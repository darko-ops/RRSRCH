"""The /dashboard page: one self-contained HTML string (inline CSS/JS, no CDNs,
no build step). Served by api.py from the same origin, it polls /metrics,
/recent, /topics, and /recalls every 3s and renders live state. Pure
observability — every number on the page comes from those endpoints."""
from __future__ import annotations

DASHBOARD_HTML = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>rrsrch — live</title>
<style>
:root {
  --page: #f9f9f7; --surface: #fcfcfb; --ink: #0b0b0b; --ink-2: #52514e;
  --muted: #898781; --hairline: #e1e0d9; --border: rgba(11,11,11,0.10);
  --good: #006300; --good-mark: #0ca30c; --warn: #a06f00; --warn-mark: #fab219;
  --crit: #d03b3b; --accent: #2a78d6; --accent-track: #cde2fb;
  --flash: rgba(42,120,214,0.12);
}
@media (prefers-color-scheme: dark) {
  :root {
    --page: #0d0d0d; --surface: #1a1a19; --ink: #ffffff; --ink-2: #c3c2b7;
    --muted: #898781; --hairline: #2c2c2a; --border: rgba(255,255,255,0.10);
    --good: #0ca30c; --good-mark: #0ca30c; --warn: #fab219; --warn-mark: #fab219;
    --crit: #e66767; --accent: #3987e5; --accent-track: #0d366b;
    --flash: rgba(57,135,229,0.18);
  }
}
* { box-sizing: border-box; }
body {
  margin: 0; background: var(--page); color: var(--ink);
  font: 14px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif;
}
.wrap { max-width: 1180px; margin: 0 auto; padding: 20px 20px 48px; }
header { display: flex; align-items: baseline; gap: 12px; margin-bottom: 18px; }
header h1 { font-size: 18px; font-weight: 650; margin: 0; letter-spacing: 0.2px; }
.live { display: inline-flex; align-items: center; gap: 6px; font-size: 12px;
        color: var(--ink-2); }
.live .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--good-mark);
             animation: pulse 2s ease-in-out infinite; }
.live.off .dot { background: var(--crit); animation: none; }
@keyframes pulse { 50% { opacity: 0.35; } }
.updated { margin-left: auto; font-size: 12px; color: var(--muted); }
.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
         gap: 12px; margin-bottom: 16px; }
.tile { background: var(--surface); border: 1px solid var(--border);
        border-radius: 10px; padding: 14px 16px; }
.tile .label { font-size: 12px; color: var(--ink-2); margin-bottom: 4px; }
.tile .value { font-size: 30px; font-weight: 600; line-height: 1.1; }
.tile .sub { font-size: 12px; color: var(--muted); margin-top: 4px; }
.tile .caveat { font-size: 11px; color: var(--muted); margin-top: 6px;
                border-top: 1px solid var(--hairline); padding-top: 6px; }
.cols { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); gap: 12px; }
@media (max-width: 860px) { .cols { grid-template-columns: 1fr; } }
.panel { background: var(--surface); border: 1px solid var(--border);
         border-radius: 10px; padding: 14px 16px; min-width: 0; }
.panel h2 { font-size: 13px; font-weight: 650; margin: 0 0 10px; color: var(--ink-2);
            text-transform: uppercase; letter-spacing: 0.4px; }
.feed { display: flex; flex-direction: column; gap: 8px; }
.row { border: 1px solid var(--hairline); border-radius: 8px; padding: 10px 12px;
       background: var(--surface); }
.row.fresh { animation: flash 2.4s ease-out; }
@keyframes flash { 0% { background: var(--flash); } 100% { background: var(--surface); } }
.row .top { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.badge { font-size: 11px; font-weight: 650; padding: 1px 8px; border-radius: 999px;
         border: 1px solid var(--border); white-space: nowrap; }
.badge.hit { color: var(--good); }
.badge.stale { color: var(--warn); }
.badge.miss { color: var(--muted); }
.badge.corrected { color: var(--crit); }
.badge.explore, .badge.info { color: var(--accent); }
.row .when { font-size: 11px; color: var(--muted); margin-left: auto;
             white-space: nowrap; }
.row .q { font-weight: 550; overflow-wrap: anywhere; }
.row .claim { color: var(--ink-2); margin-top: 4px; overflow-wrap: anywhere; }
.trust { margin-top: 8px; padding: 8px 10px; border: 1px solid var(--hairline);
         border-radius: 6px; display: flex; gap: 14px; flex-wrap: wrap;
         align-items: center; font-size: 12px; }
.trust .k { color: var(--muted); margin-right: 4px; }
.trust .v { color: var(--ink); font-weight: 550; overflow-wrap: anywhere; }
.trust a { color: var(--accent); text-decoration: none; }
.trust a:hover { text-decoration: underline; }
.meter { display: inline-block; width: 64px; height: 6px; border-radius: 3px;
         background: var(--accent-track); vertical-align: middle; margin-right: 6px; }
.meter i { display: block; height: 100%; border-radius: 3px; background: var(--accent); }
.mini { font-size: 12px; color: var(--ink-2); }
.mini table { width: 100%; border-collapse: collapse; }
.mini td { padding: 4px 6px 4px 0; border-top: 1px solid var(--hairline);
           vertical-align: top; overflow-wrap: anywhere; }
.mini tr:first-child td { border-top: 0; }
.empty { color: var(--muted); font-size: 12px; padding: 8px 0; }
.num { font-variant-numeric: tabular-nums; }
.stack { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>rrsrch</h1>
    <span id="live" class="live"><span class="dot"></span><span id="livetxt">live</span></span>
    <span id="updated" class="updated"></span>
  </header>

  <div class="tiles">
    <div class="tile">
      <div class="label">Knowledge stored</div>
      <div class="value" id="t-stored">–</div>
      <div class="sub" id="t-stored-sub"></div>
    </div>
    <div class="tile">
      <div class="label">Reuse rate</div>
      <div class="value" id="t-rate">–</div>
      <div class="sub" id="t-rate-sub"></div>
    </div>
    <div class="tile">
      <div class="label">Queries handled</div>
      <div class="value" id="t-queries">–</div>
      <div class="sub" id="t-queries-sub"></div>
    </div>
    <div class="tile">
      <div class="label">Tokens saved (measured)</div>
      <div class="value" id="t-saved">–</div>
      <div class="sub" id="t-saved-sub"></div>
      <div class="caveat" id="t-saved-caveat"></div>
    </div>
  </div>

  <div class="cols">
    <div class="panel">
      <h2>Reuse feed</h2>
      <div id="feed" class="feed"><div class="empty">Waiting for events…</div></div>
    </div>
    <div class="stack">
      <div class="panel">
        <h2>Corrections (last 24h)</h2>
        <div id="recalls" class="mini"><div class="empty">Loading…</div></div>
      </div>
      <div class="panel">
        <h2>Topics</h2>
        <div id="topics" class="mini"><div class="empty">Loading…</div></div>
      </div>
    </div>
  </div>
</div>

<script>
"use strict";
const POLL_MS = 3000;
const seen = new Set();
let firstRender = true;

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function compact(n) {
  if (n == null) return "–";
  const abs = Math.abs(n);
  if (abs >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (abs >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (abs >= 1e4) return (n / 1e3).toFixed(1) + "K";
  return n.toLocaleString();
}
function ago(iso) {
  if (!iso) return "";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (!isFinite(s)) return "";
  if (s < 2) return "just now";
  if (s < 60) return Math.floor(s) + "s ago";
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  if (s < 86400) return Math.floor(s / 3600) + "h ago";
  return Math.floor(s / 86400) + "d ago";
}
function dur(sec) {
  if (sec == null) return "–";
  if (sec < 60) return Math.round(sec) + "s";
  if (sec < 3600) return Math.round(sec / 60) + "m";
  if (sec < 86400) return (sec / 3600).toFixed(1) + "h";
  return (sec / 86400).toFixed(1) + "d";
}
function host(u) { try { return new URL(u).hostname; } catch (e) { return u; } }
function plural(n, word, words) {
  return compact(n) + " " + (n === 1 ? word : (words || word + "s"));
}
function shortId(id) { return id ? String(id).slice(0, 8) : "–"; }

const BADGES = {
  hit: ["hit", "● reused"],
  stale: ["stale", "went stale — re-derive"],
  miss: ["miss", "miss — re-derived + deposited"],
  agreed: ["hit", "✓ corroborated"],
  disagreed: ["corrected", "✗ corrected"],
  disputed: ["stale", "dispute recorded"],
  explore: ["explore", "spot-check (explore)"],
};

function trustStrip(e) {
  const parts = [];
  if (e.confidence != null) {
    const pct = Math.max(0, Math.min(1, e.confidence)) * 100;
    parts.push('<span><span class="meter"><i style="width:' + pct.toFixed(0) +
      '%"></i></span><span class="k">confidence</span><span class="v num">' +
      e.confidence.toFixed(2) + "</span></span>");
  }
  const urls = e.source_urls || [];
  if (urls.length) {
    const links = urls.map(u => '<a href="' + esc(u) + '" target="_blank" rel="noopener">' +
      esc(host(u)) + "</a>").join(", ");
    parts.push('<span><span class="k">source</span><span class="v">' + links + "</span></span>");
  }
  if (e.age_seconds != null) {
    parts.push('<span><span class="k">freshness</span><span class="v">answer is ' +
      esc(dur(e.age_seconds)) + " old</span></span>");
  }
  if (e.depositor) {
    parts.push('<span><span class="k">deposited by</span><span class="v">' +
      esc(e.depositor) + "</span></span>");
  }
  if (e.similarity != null) {
    parts.push('<span><span class="k">match</span><span class="v num">' +
      e.similarity.toFixed(2) + "</span></span>");
  }
  return parts.length ? '<div class="trust">' + parts.join("") + "</div>" : "";
}

function renderFeed(events) {
  const feed = document.getElementById("feed");
  if (!events.length) {
    feed.innerHTML = '<div class="empty">No queries yet — search via MCP and ' +
      "watch this fill in.</div>";
    return;
  }
  feed.innerHTML = events.map(e => {
    const key = (e.ts || "") + "|" + e.outcome + "|" + e.query;
    const fresh = !firstRender && !seen.has(key);
    seen.add(key);
    const [cls, label] = BADGES[e.outcome] || ["info", e.outcome];
    let body = '<div class="q">' + esc(e.query) + "</div>";
    if (e.outcome === "hit" || e.outcome === "stale") {
      if (e.claim) body += '<div class="claim">→ ' + esc(e.claim) + "</div>";
      body += trustStrip(e);
    } else if (e.outcome === "miss") {
      body += '<div class="claim">no trusted answer' +
        (e.reason ? " (" + esc(e.reason) + ")" : "") +
        " — caller re-derives and deposits</div>";
    } else if (e.reason) {
      body += '<div class="claim">rule: ' + esc(e.reason) + "</div>";
    }
    return '<div class="row' + (fresh ? " fresh" : "") + '">' +
      '<div class="top"><span class="badge ' + cls + '">' + label + "</span>" +
      '<span class="when">' + esc(ago(e.ts)) + "</span></div>" + body + "</div>";
  }).join("");
  firstRender = false;
}

function renderTiles(m, recent) {
  const c = m.corpus || {};
  document.getElementById("t-stored").textContent = compact(c.live_deposits);
  document.getElementById("t-stored-sub").textContent =
    plural(c.distinct_questions, "distinct question") + " · " +
    plural(c.total_deposits, "deposit") + " ever";
  const rate = m.total_queries ? (100 * m.hit_rate).toFixed(0) + "%" : "–";
  document.getElementById("t-rate").textContent = rate;
  document.getElementById("t-rate-sub").textContent =
    compact(m.hits) + " served from the corpus of " +
    plural(m.total_queries, "query", "queries");
  document.getElementById("t-queries").textContent = compact(m.total_queries);
  document.getElementById("t-queries-sub").textContent =
    plural(m.hits, "hit") + " · " + compact(m.stale) + " stale · " +
    plural(m.misses, "miss", "misses");
  // MEASURED ONLY: savings = recorded research cost minus tokens actually
  // served, summed over hits whose deposit carried derivation_tokens. Hits
  // without a recorded cost are counted as reuse but credited ZERO savings —
  // no assumed cold path, no estimate, anywhere on this tile.
  const measured = m.tokens_saved_measured || 0;
  const nMeasured = m.hits_measured_basis || 0;
  const nUncounted = m.hits_estimated_basis || 0;
  document.getElementById("t-saved").textContent = compact(measured);
  document.getElementById("t-saved-sub").textContent = nMeasured
    ? "from " + nMeasured + " hit" + (nMeasured === 1 ? "" : "s") +
      " with recorded research cost (recorded − served)"
    : "no hits with a recorded research cost yet";
  document.getElementById("t-saved-caveat").textContent = nUncounted
    ? nUncounted + " hit" + (nUncounted === 1 ? "" : "s") + " had no recorded cost — " +
      "counted as reuse, credited zero savings. Pass derivation_tokens on deposit()."
    : "every credited token is measured — nothing assumed";
}

function renderRecalls(rs) {
  const el = document.getElementById("recalls");
  if (!rs.length) {
    el.innerHTML = '<div class="empty">No corrections in the last 24h.</div>';
    return;
  }
  el.innerHTML = "<table>" + rs.slice().reverse().slice(0, 12).map(r =>
    "<tr><td><span class=\\"badge corrected\\">✗ retired</span></td>" +
    '<td>answer <span class="num">' + esc(shortId(r.retired_deposit_id)) + "</span>" +
    (r.superseded_by
      ? ' superseded by <span class="num">' + esc(shortId(r.superseded_by)) + "</span>"
      : " retired") +
    '<br><span class="when">' + esc(ago(r.retired_at)) + "</span></td></tr>"
  ).join("") + "</table>";
}

function renderTopics(ts) {
  const el = document.getElementById("topics");
  const ids = Object.keys(ts);
  if (!ids.length) {
    el.innerHTML = '<div class="empty">No topics yet.</div>';
    return;
  }
  el.innerHTML = "<table>" + ids.slice(0, 12).map(id => {
    const t = ts[id];
    const vol = t.observed_volatility || t.base_volatility;
    return '<tr><td><span class="num">' + esc(shortId(id)) + "</span><br>" +
      '<span class="when">' + esc(t.scope_key || "") + "</span></td>" +
      "<td>" + esc(vol) + ' · explore <span class="num">' +
      Number(t.exploration_rate).toFixed(3) + "</span><br>" +
      '<span class="when">✓ ' + t.agreements + " · ✗ " + t.disagreements +
      "</span></td></tr>";
  }).join("") + "</table>";
}

async function poll() {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  try {
    const [m, recent, topics, recalls] = await Promise.all([
      fetch("/metrics"), fetch("/recent?limit=30"), fetch("/topics"),
      fetch("/recalls?since=" + encodeURIComponent(since)),
    ].map(p => p.then(r => {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    })));
    renderTiles(m, recent);
    renderFeed(recent);
    renderTopics(topics);
    renderRecalls(recalls);
    document.getElementById("live").classList.remove("off");
    document.getElementById("livetxt").textContent = "live";
    document.getElementById("updated").textContent =
      "updated " + new Date().toLocaleTimeString();
  } catch (err) {
    document.getElementById("live").classList.add("off");
    document.getElementById("livetxt").textContent = "offline — retrying";
  }
}
poll();
setInterval(poll, POLL_MS);
</script>
</body>
</html>
"""
