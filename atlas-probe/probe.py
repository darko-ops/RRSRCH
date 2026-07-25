"""Generic Atlas probe: attest the project in the CURRENT DIRECTORY.

Usage:
  cd ~/Desktop/some-project && atlas-probe          # probe the cwd
  atlas-probe /path/to/project                      # or name a target

Nothing is hardcoded: the stack is discovered at runtime from the repo's own
files (package.json, pyproject/requirements, docker-compose, vercel link, env
NAMES) and from live, read-only shell evidence (docker ps, port checks, curl
against the production domain, vercel CLI). Env VALUES are never read except
to extract a host from *_URL-style names — credentials are stripped, secrets
never touched.

Output: ~/.atlas/targets/<name>/atlas_graph.json (+ evidence.json), the same
schema the bouncr probe exports — renderable by serve.py, AtlasView, and
atlas-mcp unchanged.

Reconciliation states (same discipline as the hand-built probe):
  confirmed   declared AND independently observed
  phantom     declared, an observer looked, and it is NOT there
  shadow      observed running, never declared
  undecidable declared, but no connected evidence source CAN observe it
"""
from __future__ import annotations

import json
import os
import pathlib
import re
import socket
import subprocess
import sys
from datetime import datetime, timezone

TARGETS_ROOT = pathlib.Path(os.environ.get(
    "ATLAS_TARGETS", pathlib.Path.home() / ".atlas" / "targets"))

# provider key -> (node id, node kind, edge kind, how it could be observed)
PROVIDERS = {
    "postgres":  ("db:postgres", "datastore", "queries", "docker ps + port check"),
    "redis":     ("db:redis", "datastore", "queries", "docker ps + port check"),
    "mysql":     ("db:mysql", "datastore", "queries", "docker ps + port check"),
    "supabase":  ("db:supabase", "datastore", "queries", "supabase management API (needs token)"),
    "vercel-blob": ("store:vercel-blob", "datastore", "reads_writes", "vercel blob ls"),
    "stripe":    ("ext:stripe", "external_api", "calls", "stripe request logs (provider-side)"),
    "anthropic": ("ext:anthropic", "external_api", "calls", "provider usage logs"),
    "openai":    ("ext:openai", "external_api", "calls", "provider usage logs"),
    "resend":    ("ext:resend", "external_api", "emails_via", "resend delivery logs (provider-side)"),
    "sendgrid":  ("ext:sendgrid", "external_api", "emails_via", "sendgrid delivery logs (provider-side)"),
    "finnhub":   ("ext:finnhub", "external_api", "calls", "provider usage logs"),
    "twitter":   ("ext:twitter", "external_api", "calls", "provider usage logs"),
    "revenuecat": ("ext:revenuecat", "external_api", "calls", "revenuecat request/webhook logs (provider-side)"),
    "google-ai": ("ext:google-ai", "external_api", "calls", "provider usage logs"),
}

# env NAME prefixes -> provider key (names only; values are sensitive)
ENV_PREFIXES = [
    ("STRIPE_", "stripe"), ("ANTHROPIC_", "anthropic"), ("OPENAI_", "openai"),
    ("RESEND_", "resend"), ("SENDGRID_", "sendgrid"), ("SUPABASE_", "supabase"),
    ("DATABASE_URL", "postgres"), ("POSTGRES_", "postgres"), ("PG", "postgres"),
    ("REDIS_", "redis"), ("MYSQL_", "mysql"), ("BLOB_READ_WRITE_TOKEN", "vercel-blob"),
    ("FINNHUB_", "finnhub"), ("TWITTER_", "twitter"),
    ("CLAUDE_", "anthropic"), ("REVENUECAT_", "revenuecat"), ("GOOGLE_AI_", "google-ai"),
]

# external API host -> provider key (literal hosts found in source code)
API_HOSTS = [
    ("api.anthropic.com", "anthropic"), ("api.openai.com", "openai"),
    ("api.stripe.com", "stripe"), ("api.revenuecat.com", "revenuecat"),
    ("generativelanguage.googleapis.com", "google-ai"),
    ("api.resend.com", "resend"), (".supabase.co", "supabase"),
]

# directories never scanned for build settings / sources
SKIP_DIRS = {".git", "build", "Build", "Pods", "DerivedData", "node_modules"}

# dependency name (package.json / python) -> provider key
DEP_PATTERNS = [
    ("stripe", "stripe"), ("@supabase/", "supabase"), ("supabase", "supabase"),
    ("@vercel/blob", "vercel-blob"), ("@anthropic-ai/", "anthropic"),
    ("anthropic", "anthropic"), ("openai", "openai"), ("resend", "resend"),
    ("@sendgrid/", "sendgrid"), ("ioredis", "redis"), ("redis", "redis"),
    ("asyncpg", "postgres"), ("psycopg", "postgres"), ("pg", "postgres"),
    ("mysql2", "mysql"), ("finnhub", "finnhub"),
]

# docker image substring -> provider key (for observed + shadow detection)
IMAGE_PATTERNS = [("pgvector", "postgres"), ("postgres", "postgres"),
                  ("redis", "redis"), ("mysql", "mysql"), ("mariadb", "mysql")]

SECRETY = re.compile(r"(key|token|secret|password|passwd|credential)", re.I)


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def sh(cmd: list[str], cwd: str | None = None, timeout: int = 20) -> str:
    """Read-only shell evidence; empty string on any failure (recorded as a gap)."""
    try:
        return subprocess.run(cmd, cwd=cwd, capture_output=True, text=True,
                              timeout=timeout).stdout
    except Exception:
        return ""


def strip_credentials(url: str) -> str:
    return re.sub(r"//[^@/]+@", "//", url)


def host_of(url: str) -> str:
    m = re.match(r"[a-z+]+://(?:[^@/]+@)?([^/:?#]+)(?::(\d+))?", url.strip())
    return (m.group(1) + (f":{m.group(2)}" if m.group(2) else "")) if m else ""


class Probe:
    def __init__(self, target: pathlib.Path):
        self.target = target
        self.name = self._name()
        self.sources: dict[str, list[dict]] = {}   # provider -> source records
        self.observed: dict[str, tuple[bool, dict]] = {}  # provider -> (present, source)
        self.connectors: list[str] = []
        self.evidence: dict = {}
        self.env_hosts: dict[str, str] = {}        # provider -> host (from local *_URL)
        self.live_domains: dict[str, str] = {}     # host -> declared ref (non-provider *_URL)
        self.domain_checks: dict[str, tuple[str, str]] = {}  # host -> (http code, ref)
        self.supabase_project_id = ""
        self.docker_declared: dict | None = None   # compose says the app itself is containerized
        self.docker_observed: dict | None = None   # a container named like the app is up
        self.docker_ps_ran = False                 # whether the docker observer was available

    def _name(self) -> str:
        pkg = self.target / "package.json"
        if pkg.exists():
            try:
                n = json.load(open(pkg)).get("name")
                if n:
                    return re.sub(r"[^a-z0-9-]", "-", n.lower()).strip("-")
            except Exception:
                pass
        for xc in self._xcconfigs():
            m = re.search(r"^\s*PRODUCT_NAME\s*=\s*([A-Za-z0-9 _.-]+?)\s*$",
                          xc.read_text(errors="ignore"), re.M)
            if m:
                return re.sub(r"[^a-z0-9-]", "-", m.group(1).lower()).strip("-")
        return re.sub(r"[^a-z0-9-]", "-", self.target.name.lower()).strip("-")

    def _xcconfigs(self) -> list[pathlib.Path]:
        return [p for p in sorted(self.target.rglob("*.xcconfig"))
                if not any(part in SKIP_DIRS or part.startswith(".")
                           for part in p.relative_to(self.target).parts)]

    def declare(self, provider: str, connector: str, ref: str) -> None:
        self.sources.setdefault(provider, []).append(
            {"class": "declared", "connector": connector, "ref": ref, "fetched_at": now()})

    def observe(self, provider: str, present: bool, connector: str, ref: str) -> None:
        # first positive observation wins; a negative never overwrites a positive
        if provider in self.observed and self.observed[provider][0] and not present:
            return
        self.observed[provider] = (present, {"class": "observed", "connector": connector,
                                             "ref": ref, "fetched_at": now()})

    # ---- declared evidence (repo files + vercel CLI) ----

    def collect_declared(self) -> None:
        c = "repo-files (package.json, docker-compose, env names)"
        self.connectors.append(c)

        pkg = self.target / "package.json"
        if pkg.exists():
            try:
                deps = {**json.load(open(pkg)).get("dependencies", {}),
                        **json.load(open(pkg)).get("devDependencies", {})}
                self.evidence["package_deps"] = sorted(deps)
                for dep in deps:
                    for pat, prov in DEP_PATTERNS:
                        if dep == pat or dep.startswith(pat):
                            self.declare(prov, c, f"package.json dependency: {dep}")
                            break
            except Exception:
                pass

        for reqfile in ("requirements.txt", "pyproject.toml"):
            f = self.target / reqfile
            if f.exists():
                text = f.read_text(errors="ignore").lower()
                for pat, prov in DEP_PATTERNS:
                    if re.search(rf'["\s>=]{re.escape(pat)}[<>=~"\s\[]', text):
                        self.declare(prov, c, f"{reqfile} dependency: {pat}")

        for compose in ("docker-compose.yml", "docker-compose.yaml", "compose.yaml"):
            f = self.target / compose
            if f.exists():
                text = f.read_text(errors="ignore")
                for img, prov in IMAGE_PATTERNS:
                    if re.search(rf"image:.*{img}", text):
                        self.declare(prov, c, f"{compose} declares image ~{img}")
                        break
                # a `build:` service means the app ITSELF is housed in docker
                if re.search(r"^\s+build\s*:", text, re.M):
                    self.docker_declared = {"class": "declared", "connector": c,
                                            "ref": f"{compose} builds the app as a container (build:)",
                                            "fetched_at": now()}

        # env NAMES from local env files; extract host ONLY from non-secrety *_URL values
        for envfile in (".env", ".env.local", ".env.example", ".env.production"):
            f = self.target / envfile
            if not f.exists():
                continue
            for line in f.read_text(errors="ignore").splitlines():
                m = re.match(r"^\s*([A-Z][A-Z0-9_]+)\s*=\s*(.*)$", line)
                if not m:
                    continue
                key, val = m.group(1), m.group(2).strip().strip("'\"")
                for prefix, prov in ENV_PREFIXES:
                    if key.startswith(prefix):
                        ref = f"{envfile}: {key} set"
                        if key.endswith("_URL") and not SECRETY.search(key) and "://" in val:
                            h = host_of(val)
                            if h:
                                ref += f" (host {h})"
                                self.env_hosts.setdefault(prov, h)
                        self.declare(prov, c, ref)
                        break

        # Xcode build settings (*.xcconfig): setting NAMES only; a host is
        # extracted ONLY from non-secrety *_URL-style values, same as env files
        xcs = self._xcconfigs()
        if xcs:
            xc = "xcconfig (Xcode build settings, names only)"
            self.connectors.append(xc)
            xc_names = set()
            for f in xcs:
                rel = f.relative_to(self.target)
                for line in f.read_text(errors="ignore").splitlines():
                    m = re.match(r"^\s*([A-Z][A-Z0-9_]+)\s*=\s*(.*)$", line)
                    if not m:
                        continue
                    key, val = m.group(1), m.group(2).strip()
                    xc_names.add(key)
                    urlish = (key.endswith("_URL") and not SECRETY.search(key)
                              and "://" in val)
                    for prefix, prov in ENV_PREFIXES:
                        if key.startswith(prefix):
                            ref = f"{rel}: {key} set"
                            if urlish:
                                h = host_of(val)
                                if h:
                                    ref += f" (host {h})"
                                    self.env_hosts.setdefault(prov, h)
                            self.declare(prov, xc, ref)
                            break
                    else:
                        if urlish:
                            h = host_of(val)
                            if h:
                                self.live_domains.setdefault(h, f"{rel}: {key}")
            self.evidence["xcconfig_setting_names"] = sorted(xc_names)

        # supabase project config (supabase/config.toml)
        sb = self.target / "supabase" / "config.toml"
        if sb.exists():
            self.declare("supabase", c, "supabase/config.toml present")
            m = re.search(r'^\s*project_id\s*=\s*"([^"]+)"', sb.read_text(errors="ignore"), re.M)
            if m:
                self.supabase_project_id = m.group(1)
                self.evidence["supabase_project_id"] = m.group(1)

        # edge-function source (Deno): env NAMES + literal external API hosts
        fdir = self.target / "supabase" / "functions"
        if fdir.is_dir():
            fc = "edge-function source (env names, fetch hosts)"
            self.connectors.append(fc)
            env_names, hosts = set(), set()
            for f in sorted(fdir.rglob("*.ts")):
                if set(f.parts) & SKIP_DIRS:
                    continue
                text = f.read_text(errors="ignore")
                env_names |= set(re.findall(
                    r"""Deno\.env\.get\(['"]([A-Z][A-Z0-9_]+)['"]\)""", text))
                hosts |= set(re.findall(r"https://([a-z0-9.-]+\.[a-z]{2,})", text))
            self.evidence["function_env_names"] = sorted(env_names)
            self.evidence["function_api_hosts"] = sorted(
                h for h in hosts if any(pat in h for pat, _ in API_HOSTS))
            for name in sorted(env_names):
                for prefix, prov in ENV_PREFIXES:
                    if name.startswith(prefix):
                        self.declare(prov, fc, f"supabase/functions env: {name}")
                        break
            for h in sorted(hosts):
                for pat, prov in API_HOSTS:
                    if pat in h:
                        self.declare(prov, fc, f"supabase/functions calls https://{h}")
                        break

        # vercel link + prod env names (CLI, network; skipped silently if unlinked)
        vlink = self.target / ".vercel" / "project.json"
        if vlink.exists():
            vc = "vercel-cli (project link, env ls)"
            self.connectors.append(vc)
            try:
                proj = json.load(open(vlink))
                self.declare("vercel", vc, f".vercel/project.json projectId={proj.get('projectId')}")
            except Exception:
                pass
            env_ls = sh(["vercel", "env", "ls"], cwd=str(self.target), timeout=30)
            self.evidence["vercel_env_names"] = sorted(
                {w for w in re.findall(r"^\s*([A-Z][A-Z0-9_]+)\s", env_ls, re.M)})
            for key in self.evidence["vercel_env_names"]:
                for prefix, prov in ENV_PREFIXES:
                    if key.startswith(prefix):
                        self.declare(prov, vc, f"vercel env ls: {key} set (value sensitive/unreadable)")
                        break

    # ---- observed evidence (live, read-only) ----

    def collect_observed(self) -> None:
        dc = "docker ps (live containers)"
        docker = sh(["docker", "ps", "--format", "{{.Names}}\t{{.Image}}\t{{.Ports}}"])
        if docker:
            self.connectors.append(dc)
        rows = [r.split("\t") for r in docker.splitlines() if r.strip()]
        self.docker_ps_ran = bool(docker)
        self.evidence["docker_ps"] = ["\t".join(r) for r in rows]
        # the app's OWN container (housing): docker compose names containers
        # <project>-<service>-<n>, so ownership = the project prefix equals the
        # app name EXACTLY (a stem match attributes other repos' containers)
        def owns(cname: str) -> bool:
            return re.split(r"[-_]", cname)[0] == self.name
        for cname, image, ports in rows:
            if owns(cname) and not any(img in image for img, _ in IMAGE_PATTERNS):
                self.docker_observed = {"class": "observed", "connector": dc,
                                        "ref": f"container {cname} ({image}) up, ports {ports}",
                                        "fetched_at": now()}
                break
        # a running container only counts FOR a provider this project declared —
        # a machine-wide docker ps must not attribute other projects' datastores
        for prov_key in set(self.sources):
            for cname, image, ports in rows:
                for img, prov in IMAGE_PATTERNS:
                    if prov == prov_key and img in image:
                        self.observe(prov, True, dc, f"container {cname} ({image}) up, ports {ports}")
        # shadow candidates: running datastores OWNED by this project (compose
        # project prefix == app name) but never declared
        for cname, image, ports in rows:
            for img, prov in IMAGE_PATTERNS:
                if (img in image and prov not in self.sources
                        and re.split(r"[-_]", cname)[0] == self.name):
                    self.observe(prov, True, dc, f"container {cname} ({image}) up — never declared")
        # local supabase stack: the CLI names containers supabase_<svc>_<project_id>,
        # so only a suffix match counts — other projects' stacks must not attribute
        if self.supabase_project_id:
            for cname, image, ports in rows:
                if "supabase" in image and cname.endswith(f"_{self.supabase_project_id}"):
                    self.observe("supabase", True, dc,
                                 f"local stack container {cname} ({image}) up")

        # port checks for hosts discovered from local *_URL values
        for prov, host in self.env_hosts.items():
            h, _, p = host.partition(":")
            if h in ("localhost", "127.0.0.1") and p:
                try:
                    socket.create_connection((h, int(p)), timeout=2).close()
                    self.observe(prov, True, "tcp port check", f"{host} accepting connections")
                except OSError:
                    self.observe(prov, False, "tcp port check", f"{host} NOT accepting connections")

        # remote provider hosts from *_URL values: read-only HTTPS reachability
        for prov, host in sorted(self.env_hosts.items()):
            h = host.partition(":")[0]
            if h in ("localhost", "127.0.0.1"):
                continue
            code = sh(["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}",
                       "--max-time", "8", f"https://{host}"])
            self.connectors.append("curl (remote host)")
            up = bool(code and code != "000")
            self.observe(prov, up, "curl (remote host)",
                         f"https://{host} responds {code}" if up
                         else f"https://{host} NOT responding")

        # declared live domains (non-provider *_URL values, e.g. the app's own API)
        for h, ref in sorted(self.live_domains.items()):
            code = sh(["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}",
                       "--max-time", "8", f"https://{h}"])
            self.connectors.append("curl (live domain)")
            self.domain_checks[h] = (code, ref)

        # live domain: CNAME file or package.json homepage
        domain = ""
        cname_f = self.target / "CNAME"
        if cname_f.exists():
            domain = cname_f.read_text().strip().splitlines()[0].strip()
        if domain:
            code = sh(["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}",
                       "--max-time", "8", f"https://{domain}"])
            self.connectors.append("curl (live domain)")
            self.evidence["domain_check"] = f"https://{domain} -> {code}"
            if code and code != "000":
                self.observe("vercel", True, "curl (live domain)", f"https://{domain} responds {code}")

    # ---- reconcile + export ----

    def graph(self) -> dict:
        nodes = [{"id": f"app:{self.name}", "label": self.name, "kind": "service", "attributes": {}}]
        edges, cnd = [], []

        def add_edge(prov: str, declared: list[dict]) -> None:
            node_id, kind, edge_kind, connector_needed = PROVIDERS[prov]
            obs = self.observed.get(prov)
            srcs = list(declared)
            if obs and (obs[0] or declared):
                srcs.append(obs[1])
            if declared and obs and obs[0]:
                state = "confirmed"
            elif declared and obs and not obs[0]:
                state = "phantom"
            elif declared:
                state = "undecidable"
            elif obs and obs[0]:
                state = "shadow"
            else:
                return
            nodes.append({"id": node_id, "label": node_id.split(":", 1)[1], "kind": kind,
                          "attributes": ({"host": self.env_hosts[prov]}
                                         if prov in self.env_hosts else {})})
            e = {"src": f"app:{self.name}", "dst": node_id, "kind": edge_kind,
                 "state": state, "sources": srcs, "as_of": now(),
                 "note": {"confirmed": "declared and independently observed",
                          "phantom": "declared, an observer looked, and it is not there",
                          "shadow": "observed running but never declared",
                          "undecidable": "declared; no connected source can observe it",
                          }[state]}
            if state == "undecidable":
                e["missing_connector"] = connector_needed
                e["why_unobserved"] = "no connected evidence source covers this flow"
                cnd.append({"edge": f"{e['src']} -[{edge_kind}]-> {node_id}",
                            "label": "undecidable — declared, but no connected source can observe it",
                            "why": e["why_unobserved"],
                            "connector_to_install": connector_needed, "as_of": e["as_of"]})
            edges.append(e)

        # platform edge first (vercel hosting)
        if "vercel" in self.sources or ("vercel" in self.observed and self.observed["vercel"][0]):
            decl = self.sources.get("vercel", [])
            obs = self.observed.get("vercel")
            srcs = decl + ([obs[1]] if obs else [])
            state = ("confirmed" if decl and obs and obs[0]
                     else "undecidable" if decl else "shadow")
            nodes.append({"id": f"platform:vercel/{self.name}", "label": f"vercel/{self.name}",
                          "kind": "platform", "attributes": {}})
            edges.append({"src": f"app:{self.name}", "dst": f"platform:vercel/{self.name}",
                          "kind": "hosted_on", "state": state, "sources": srcs, "as_of": now(),
                          "note": "project link in repo" + (" + live domain responds" if state == "confirmed" else "")})

        # docker hosting (what houses the app when it isn't on a cloud platform)
        if self.docker_declared or self.docker_observed:
            hostname = re.sub(r"[^a-z0-9-]", "-", socket.gethostname().lower()).strip("-")
            node_id = f"platform:docker/{hostname}"
            srcs = [s for s in (self.docker_declared, self.docker_observed) if s]
            if self.docker_declared and self.docker_observed:
                state, note = "confirmed", "compose declares the app container and it is running"
            elif self.docker_declared and self.docker_ps_ran:
                state, note = "phantom", "compose declares an app container; docker ps shows none"
            elif self.docker_declared:
                state, note = "undecidable", "compose declares an app container; docker not reachable to check"
            else:
                state, note = "shadow", "an app-named container is running but no compose declares it"
            nodes.append({"id": node_id, "label": f"docker @ {hostname}", "kind": "platform",
                          "attributes": {}})
            edges.append({"src": f"app:{self.name}", "dst": node_id, "kind": "hosted_on",
                          "state": state, "sources": srcs, "as_of": now(), "note": note})

        # declared live domains (the app's own public endpoints, e.g. *_BASE_URL)
        for h, (code, ref) in sorted(self.domain_checks.items()):
            up = bool(code and code != "000")
            nodes.append({"id": f"domain:{h}", "label": h, "kind": "platform",
                          "attributes": {}})
            edges.append({"src": f"app:{self.name}", "dst": f"domain:{h}",
                          "kind": "serves_at", "state": "confirmed" if up else "phantom",
                          "sources": [
                              {"class": "declared", "connector": "repo-files",
                               "ref": ref, "fetched_at": now()},
                              {"class": "observed", "connector": "curl (live domain)",
                               "ref": f"https://{h} -> {code or 'no response'}",
                               "fetched_at": now()}],
                          "as_of": now(),
                          "note": ("declared and independently observed" if up else
                                   "declared, an observer looked, and it is not there")})

        for prov, declared in sorted(self.sources.items()):
            if prov in PROVIDERS:
                add_edge(prov, declared)
        for prov, (present, _) in sorted(self.observed.items()):
            if prov in PROVIDERS and prov not in self.sources and present:
                add_edge(prov, [])

        # de-dup nodes
        seen, uniq = set(), []
        for n in nodes:
            if n["id"] not in seen:
                seen.add(n["id"])
                uniq.append(n)
        return {"title": f"Atlas — {self.name} (generic probe)", "as_of": now(),
                "exported_at": now(), "connectors": sorted(set(self.connectors)),
                "evidence_window": "point-in-time (this probe run)",
                "nodes": uniq, "edges": edges, "could_not_determine": cnd}


def publish(name: str, graph: dict) -> str:
    """Push the attestation to the paired rrsrch.com account (device token).
    The dashboard's Atlas tab reads it from there — nothing served locally."""
    creds = pathlib.Path.home() / ".rrsrch" / "credentials.json"
    if not creds.exists():
        return "not published (no pairing — run rrsrch-login first)"
    try:
        token = json.load(open(creds))["token"]
    except Exception:
        return "not published (unreadable ~/.rrsrch/credentials.json)"
    site = os.environ.get("RRSRCH_SITE", "https://rrsrch.com")
    body = json.dumps({"target": name, "graph": graph})
    try:
        r = subprocess.run(
            ["curl", "-s", "-X", "POST", f"{site}/api/atlas",
             "-H", f"Authorization: Bearer {token}",
             "-H", "Content-Type: application/json", "--data-binary", "@-"],
            input=body, capture_output=True, text=True, timeout=30)
        d = json.loads(r.stdout or "{}")
        return (f"published to {site} as '{d['target']}'" if d.get("ok")
                else f"publish FAILED: {d.get('error', r.stdout[:120] or 'no response')}")
    except Exception as exc:
        return f"publish FAILED: {exc}"


def merge_graphs(name: str, graphs: list[dict]) -> dict:
    """One system, several repos: union of nodes (by id) and all edges. Each
    repo keeps its own app node — a system map with two services is the truth."""
    nodes: dict[str, dict] = {}
    edges: list[dict] = []
    cnd: list[dict] = []
    connectors: set[str] = set()
    for g in graphs:
        for n in g["nodes"]:
            nodes.setdefault(n["id"], n)
        edges.extend(g["edges"])
        cnd.extend(g["could_not_determine"])
        connectors.update(g["connectors"])
    return {"title": f"Atlas — {name} (multi-repo system)", "as_of": now(),
            "exported_at": now(), "connectors": sorted(connectors),
            "evidence_window": "point-in-time (this probe run)",
            "nodes": list(nodes.values()), "edges": edges, "could_not_determine": cnd}


def main() -> None:
    """atlas-probe [--name SYSTEM] [dir ...]   (no dirs = the cwd)
    Multiple dirs = one system spanning several repos, published under --name."""
    args = sys.argv[1:]
    name = None
    if "--name" in args:
        i = args.index("--name")
        if i + 1 >= len(args):
            sys.exit("atlas-probe: --name needs a value")
        name = re.sub(r"[^a-z0-9-]", "-", args[i + 1].lower()).strip("-")
        args = args[:i] + args[i + 2:]
    dirs = [pathlib.Path(a).resolve() for a in args] or [pathlib.Path.cwd()]
    for d in dirs:
        if not d.is_dir():
            sys.exit(f"atlas-probe: not a directory: {d}")
    if len(dirs) > 1 and not name:
        sys.exit("atlas-probe: probing multiple directories needs --name <system-name>")

    graphs, evidence = [], {}
    for d in dirs:
        p = Probe(d)
        print(f"probing {d}  (name: {p.name})")
        p.collect_declared()
        p.collect_observed()
        graphs.append((p, p.graph()))
        evidence[p.name] = p.evidence
    name = name or graphs[0][0].name
    if len(graphs) == 1:
        g = graphs[0][1]
        if name != graphs[0][0].name:
            g["title"] = f"Atlas — {name} (generic probe)"
    else:
        g = merge_graphs(name, [gr for _, gr in graphs])

    out = TARGETS_ROOT / name
    out.mkdir(parents=True, exist_ok=True)
    json.dump(g, open(out / "atlas_graph.json", "w"), indent=1)
    json.dump(evidence if len(graphs) > 1 else graphs[0][0].evidence,
              open(out / "evidence.json", "w"), indent=1)
    states: dict[str, int] = {}
    for e in g["edges"]:
        states[e["state"]] = states.get(e["state"], 0) + 1
    print(f"  {len(g['nodes'])} nodes, {len(g['edges'])} edges: "
          + ", ".join(f"{v} {k}" for k, v in sorted(states.items())))
    print(f"  -> {out / 'atlas_graph.json'}")
    print(f"  {publish(name, g)}")


if __name__ == "__main__":
    main()
