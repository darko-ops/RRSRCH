// AtlasAttestation — the full verified data-flow attestation rendered natively
// on rrsrch.com from atlas_graph.json (fetched from the operator's local
// instance). Deterministic projection only: this component draws exactly the
// nodes/edges in the graph — nothing invented, no LLM, same rules as the local
// atlas.html renderer it was ported from.
import React, { useEffect, useMemo, useRef, useState } from 'react';

const C = {
  ink: '#e8e7e2', ink2: '#a8a7a0', muted: '#77766f', hairline: '#262624',
  nodeFill: '#1d1d1c', nodeStroke: '#565550', sel: '#7aa7e0',
  confirmed: '#5da862', phantom: '#e07070', shadow: '#dd9159',
  hypothesis: '#84847e', undecidable: '#8aa0c8',
};
const MONO = '"JetBrains Mono", monospace';

const STYLE = {
  confirmed: { dash: '', width: 2, def: 'declared in config AND observed in runtime evidence' },
  phantom: { dash: '8 5', width: 3, def: 'declared, observable, and absent — documented but not real (DRIFT)' },
  shadow: { dash: '6 3', width: 3, def: 'observed at runtime but declared nowhere — real but undocumented (DRIFT)' },
  hypothesis: { dash: '2 4', width: 2, def: 'inferred from code only' },
  undecidable: { dash: '12 4 2 4', width: 2, def: 'declared, but no connected source can observe it — evidence gap, not drift' },
};

const STALE_MS = 24 * 3600 * 1000;
const isStale = (iso) => Date.now() - new Date(iso).getTime() > STALE_MS;
const ago = (iso) => {
  const h = (Date.now() - new Date(iso).getTime()) / 3600000;
  if (h < 1) return `${Math.max(1, Math.round(h * 60))}m ago`;
  if (h < 48) return `${Math.round(h)}h ago`;
  return `${Math.round(h / 24)}d ago`;
};

const NODE_W = { service: 132, platform: 150, datastore: 150, table: 150, external_api: 120 };
const NODE_H = { service: 60, platform: 42, datastore: 54, table: 30, external_api: 34 };
const W = 1240, H = 820;

// deterministic "entropy" layout: force-directed (repel all, attract along
// edges), seeded from a hash of node ids and run a FIXED number of iterations —
// organic arrangement, same graph -> same picture, no randomness at render time.
const hashStr = (s) => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h;
};

function computeLayout(graph) {
  const byId = Object.fromEntries(graph.nodes.map((n) => [n.id, n]));
  const nodes = graph.nodes;
  const idx = Object.fromEntries(nodes.map((n, i) => [n.id, i]));
  // Gestalt proximity: same-kind nodes seed in the same angular sector
  const kinds = [...new Set(nodes.map((n) => n.kind))].sort();
  const sector = Object.fromEntries(kinds.map((k, i) => [k, (2 * Math.PI * i) / kinds.length]));
  const p = nodes.map((n) => {
    const h = hashStr(n.id);
    const a = sector[n.kind] + (((h % 1000) / 1000) - 0.5) * ((2 * Math.PI) / kinds.length) * 0.8;
    const r = 170 + (((h >>> 8) % 1000) / 1000) * 200;
    return { x: Math.cos(a) * r, y: Math.sin(a) * r };
  });
  const clusterKinds = kinds.filter((k) => nodes.filter((n) => n.kind === k).length >= 2);
  const anchor = Object.fromEntries(clusterKinds.map((k) => [k,
    { x: Math.cos(sector[k]) * 330, y: Math.sin(sector[k]) * 330 }]));
  // one spring per node PAIR — twin edges must not double the pull
  const seenPair = new Set();
  const springs = [];
  graph.edges.forEach((e) => {
    const k = [idx[e.src], idx[e.dst]].sort((a, b) => a - b).join('|');
    if (!seenPair.has(k)) {
      seenPair.add(k);
      const w = (byId[e.src].kind === 'table' || byId[e.dst].kind === 'table') ? 0.55 : 1;
      springs.push([idx[e.src], idx[e.dst], w]);
    }
  });
  const K = 220;
  let temp = 170;
  for (let it = 0; it < 420; it++) {
    const disp = p.map(() => ({ x: 0, y: 0 }));
    for (let i = 0; i < p.length; i++) {
      for (let j = i + 1; j < p.length; j++) {
        let dx = p[i].x - p[j].x, dy = p[i].y - p[j].y;
        let d = Math.sqrt(dx * dx + dy * dy);
        if (d < 0.1) { dx = ((i * 13 + j * 7) % 10) / 10 - 0.5; dy = ((i * 7 + j * 13) % 10) / 10 - 0.5; d = Math.sqrt(dx * dx + dy * dy); }
        const f = ((K * K) / d) * (nodes[i].kind === nodes[j].kind ? 0.42 : 1);
        disp[i].x += (dx / d) * f; disp[i].y += (dy / d) * f;
        disp[j].x -= (dx / d) * f; disp[j].y -= (dy / d) * f;
      }
    }
    for (const [a, b, w] of springs) {
      let dx = p[a].x - p[b].x, dy = p[a].y - p[b].y;
      const d = Math.max(Math.sqrt(dx * dx + dy * dy), 0.1);
      const f = ((d * d) / K) * w;
      disp[a].x -= (dx / d) * f; disp[a].y -= (dy / d) * f;
      disp[b].x += (dx / d) * f; disp[b].y += (dy / d) * f;
    }
    for (const k of clusterKinds) {
      const members = nodes.map((n, i) => [n, i]).filter(([n]) => n.kind === k);
      const cx = members.reduce((s, [, i]) => s + p[i].x, 0) / members.length;
      const cy = members.reduce((s, [, i]) => s + p[i].y, 0) / members.length;
      for (const [, i] of members) {
        disp[i].x += (cx - p[i].x) * 0.26 + (anchor[k].x - p[i].x) * 0.10;
        disp[i].y += (cy - p[i].y) * 0.26 + (anchor[k].y - p[i].y) * 0.10;
      }
    }
    for (let i = 0; i < p.length; i++) {
      const d = Math.max(Math.sqrt(disp[i].x ** 2 + disp[i].y ** 2), 0.1);
      const step = Math.min(d, temp);
      p[i].x += (disp[i].x / d) * step;
      p[i].y += (disp[i].y / d) * step;
    }
    temp *= 0.985;
  }
  // nodes are wide boxes, not points: deterministic overlap resolution
  for (let pass = 0; pass < 80; pass++) {
    let moved = false;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const wi = NODE_W[nodes[i].kind] / 2 + 16, hi = NODE_H[nodes[i].kind] / 2 + 20;
        const wj = NODE_W[nodes[j].kind] / 2 + 16, hj = NODE_H[nodes[j].kind] / 2 + 20;
        const dx = p[j].x - p[i].x, dy = p[j].y - p[i].y;
        const ox = wi + wj - Math.abs(dx), oy = hi + hj - Math.abs(dy);
        if (ox > 0 && oy > 0) {
          moved = true;
          if (ox < oy) { const s = ((dx >= 0 ? 1 : -1) * ox) / 2; p[i].x -= s; p[j].x += s; }
          else { const s = ((dy >= 0 ? 1 : -1) * oy) / 2; p[i].y -= s; p[j].y += s; }
        }
      }
    }
    if (!moved) break;
  }
  // uniform-scale fit into the canvas (margins for kind labels)
  const M = 70;
  const minX = Math.min(...p.map((q, i) => q.x - NODE_W[nodes[i].kind] / 2));
  const maxX = Math.max(...p.map((q, i) => q.x + NODE_W[nodes[i].kind] / 2));
  const minY = Math.min(...p.map((q, i) => q.y - NODE_H[nodes[i].kind] / 2));
  const maxY = Math.max(...p.map((q, i) => q.y + NODE_H[nodes[i].kind] / 2));
  const s = Math.min((W - 2 * M) / (maxX - minX), (H - 2 * M) / (maxY - minY), 1.6);
  const cx = (W - s * (maxX - minX)) / 2, cy = (H - s * (maxY - minY)) / 2;
  const pos = {};
  nodes.forEach((n, i) => {
    pos[n.id] = { x: cx + s * (p[i].x - minX), y: cy + s * (p[i].y - minY) };
  });

  // edges anchor on the node border toward the other endpoint; twins bow apart
  const border = (node, from, to) => {
    const hw = NODE_W[node.kind] / 2 + 4, hh = NODE_H[node.kind] / 2 + 4;
    const dx = to.x - from.x, dy = to.y - from.y;
    const t = Math.min(hw / Math.max(Math.abs(dx), 1e-6), hh / Math.max(Math.abs(dy), 1e-6));
    return { x: from.x + dx * Math.min(t, 0.5), y: from.y + dy * Math.min(t, 0.5) };
  };
  const pairCount = {}, pairIdx = {};
  graph.edges.forEach((e) => {
    const k = [e.src, e.dst].sort().join('|');
    pairCount[k] = (pairCount[k] || 0) + 1;
  });
  const paths = graph.edges.map((e) => {
    const k = [e.src, e.dst].sort().join('|');
    pairIdx[k] = pairIdx[k] || 0;
    const which = pairIdx[k]++;
    const a = pos[e.src], b = pos[e.dst];
    const s1 = border(byId[e.src], a, b), s2 = border(byId[e.dst], b, a);
    const dx = s2.x - s1.x, dy = s2.y - s1.y;
    const d = Math.max(Math.sqrt(dx * dx + dy * dy), 1e-6);
    const px = -dy / d, py = dx / d;   // unit perpendicular
    const off = pairCount[k] > 1 ? (which - (pairCount[k] - 1) / 2) * 40 : 0;
    const mx = (s1.x + s2.x) / 2 + px * off, my = (s1.y + s2.y) / 2 + py * off;
    const t = 0.72, u = 1 - t;
    return {
      d: `M ${s1.x} ${s1.y} Q ${mx} ${my} ${s2.x} ${s2.y}`,
      lx: u * u * s1.x + 2 * u * t * mx + t * t * s2.x + px * 10,
      ly: u * u * s1.y + 2 * u * t * my + t * t * s2.y + py * 10 - 4,
    };
  });
  // Gestalt "common region": neutral hull behind each multi-node kind
  const convexHull = (pts) => {
    const sorted = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
    const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    const lower = [];
    for (const q of sorted) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
      lower.push(q);
    }
    const upper = [];
    for (let i = sorted.length - 1; i >= 0; i--) {
      const q = sorted[i];
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
      upper.push(q);
    }
    return lower.slice(0, -1).concat(upper.slice(0, -1));
  };
  const HULL_LABEL = { table: 'tables (bouncr schema)', external_api: 'external APIs' };
  const hulls = [];
  for (const k of clusterKinds) {
    const members = nodes.filter((n) => n.kind === k);
    const pts = [];
    members.forEach((n) => {
      const { x, y } = pos[n.id];
      const hw = NODE_W[n.kind] / 2 + 6, hh = NODE_H[n.kind] / 2 + 6;
      pts.push({ x: x - hw, y: y - hh }, { x: x + hw, y: y - hh },
               { x: x - hw, y: y + hh }, { x: x + hw, y: y + hh });
    });
    const hull = convexHull(pts);
    const top = hull.reduce((a, b) => (b.y < a.y ? b : a));
    hulls.push({
      d: 'M ' + hull.map((q) => `${q.x} ${q.y}`).join(' L ') + ' Z',
      lx: top.x, ly: top.y - 26,
      label: HULL_LABEL[k] || k.replace('_', ' ') + 's',
    });
  }
  const clustered = new Set(clusterKinds);
  return { byId, pos, paths, hulls, clustered };
}

function blast(graph, target) {
  const severed = graph.edges.filter((e) => e.dst === target);
  const degraded = [...new Set(severed.map((e) => e.src))];
  const failing = graph.edges.filter((e) => degraded.includes(e.dst) && e.src !== target);
  const idle = graph.edges.filter((e) => degraded.includes(e.src) && e.dst !== target
                                          && !failing.includes(e));
  return { severed, degraded, failing, idle };
}

const badge = (state) => (
  <span style={{ fontSize: '10px', fontWeight: 700, padding: '1px 8px', borderRadius: '999px',
    border: `1px solid ${C[state] || C.muted}`, color: C[state] || C.muted,
    fontFamily: MONO, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{state}</span>
);

function KindIcon({ kind, x, y }) {
  const P = (d) => <path d={d} stroke={C.ink2} fill="none" strokeWidth="1.3" />;
  if (kind === 'service') return <g>{P(`M${x},${y - 4} h9 v8 h-9 z M${x + 2.5},${y - 6.5} h9 v8`)}</g>;
  if (kind === 'platform') return <g>{P(`M${x},${y + 4} L${x + 5},${y - 5} L${x + 10},${y + 4} z`)}</g>;
  if (kind === 'table') return <g>{P(`M${x},${y - 4} h10 v8 h-10 z M${x},${y - 1.3} h10 M${x},${y + 1.4} h10`)}</g>;
  if (kind === 'external_api') return <g>{P(`M${x},${y - 4} v8 M${x + 3},${y} h7 M${x + 7},${y - 3} l3,3 l-3,3`)}</g>;
  if (kind === 'datastore') return <g>{P(`M${x},${y - 4} a5,2 0 0 0 10,0 a5,2 0 0 0 -10,0 v7 a5,2 0 0 0 10,0 v-7`)}</g>;
  return null;
}

const secHead = { fontSize: '11px', color: C.ink2, textTransform: 'uppercase',
  letterSpacing: '1px', fontFamily: MONO, margin: '20px 0 10px' };
const cardStyle = { background: 'rgba(0,0,0,0.3)', border: `1px solid ${C.hairline}`,
  borderRadius: '12px', padding: '14px 16px' };

export default function AtlasAttestation({ graph, endpoint, isMobile }) {
  const [sel, setSel] = useState(null);           // {type:'node'|'edge', key}
  const [blastTarget, setBlastTarget] = useState(
    graph.nodes.find((n) => n.kind === 'datastore')?.id ?? graph.nodes[0].id);
  const [showAppendix, setShowAppendix] = useState(false);
  const [full, setFull] = useState(false);   // fullscreen diagram
  const { byId, pos, paths, hulls, clustered } = useMemo(() => computeLayout(graph), [graph]);

  useEffect(() => {
    if (!full) return;
    const onKey = (e) => { if (e.key === 'Escape') setFull(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [full]);

  // pan/zoom: the viewBox IS the camera. Default = content bounding box, so
  // every graph opens auto-centered at max size regardless of node count.
  const fitView = useMemo(() => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    graph.nodes.forEach((n) => {
      const { x, y } = pos[n.id];
      const w = NODE_W[n.kind], h = NODE_H[n.kind];
      minX = Math.min(minX, x - w / 2); maxX = Math.max(maxX, x + w / 2);
      minY = Math.min(minY, y - h / 2); maxY = Math.max(maxY, y + h / 2);
    });
    const pad = 60;   // room for hulls (34px stroke), kind captions, edge labels
    return { x: minX - pad, y: minY - pad,
             w: (maxX - minX) + pad * 2, h: (maxY - minY) + pad * 2 };
  }, [graph, pos]);
  const [view, setView] = useState(null);          // null = fitted
  useEffect(() => { setView(null); }, [graph]);
  const cam = view || fitView;

  const zoomBy = (f) => {
    const w = Math.min(Math.max(cam.w * f, fitView.w * 0.15), fitView.w * 4);
    const h = cam.h * (w / cam.w);
    setView({ x: cam.x + (cam.w - w) / 2, y: cam.y + (cam.h - h) / 2, w, h });
  };

  const dragRef = useRef(null);
  const movedRef = useRef(false);
  const onPointerDown = (e) => {
    dragRef.current = { px: e.clientX, py: e.clientY, v: cam };
    movedRef.current = false;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    if (Math.abs(e.clientX - d.px) + Math.abs(e.clientY - d.py) > 4) movedRef.current = true;
    if (!movedRef.current) return;
    const r = e.currentTarget.getBoundingClientRect();
    // preserveAspectRatio "meet": uniform scale = the smaller axis fit
    const scale = Math.min(r.width / d.v.w, r.height / d.v.h);
    setView({ x: d.v.x - (e.clientX - d.px) / scale,
              y: d.v.y - (e.clientY - d.py) / scale, w: d.v.w, h: d.v.h });
  };
  const onPointerUp = () => { dragRef.current = null; };

  const counts = { confirmed: 0, phantom: 0, shadow: 0, undecidable: 0, hypothesis: 0 };
  graph.edges.forEach((e) => { counts[e.state] = (counts[e.state] || 0) + 1; });
  const drift = graph.edges.map((e, i) => [e, i])
    .filter(([e]) => e.state === 'phantom' || e.state === 'shadow');
  const oldest = graph.edges.reduce((m, e) => (e.as_of < m ? e.as_of : m), graph.edges[0].as_of);

  const fmtEdge = (e) => (
    <>
      {byId[e.src].label} <span style={{ color: C.muted }}>-[{e.kind}]-&gt;</span> {byId[e.dst].label}
      {e.state !== 'confirmed' && <> {badge(e.state)}</>}
    </>
  );

  const blastView = (target) => {
    const b = blast(graph, target);
    if (!b.severed.length) {
      return <div style={{ color: C.muted, fontSize: '12px' }}>
        Nothing in this graph depends on {byId[target].label} directly.</div>;
    }
    const line = { fontSize: '12px', color: C.ink2, overflowWrap: 'anywhere', margin: '2px 0' };
    const head = { fontSize: '11px', fontWeight: 700, color: C.ink2, margin: '8px 0 2px' };
    return (
      <div>
        <div style={head}>severed (direct dependencies):</div>
        {b.severed.map((e, i) => <div key={i} style={line}>{fmtEdge(e)}</div>)}
        <div style={head}>degraded (up, missing a dependency):</div>
        <div style={line}>{b.degraded.map((d) => byId[d].label).join(', ')}</div>
        {b.failing.length > 0 && <>
          <div style={head}>likely failing (deliveries into a degraded node):</div>
          {b.failing.map((e, i) => <div key={i} style={line}>{fmtEdge(e)}</div>)}
        </>}
        {b.idle.length > 0 && <>
          <div style={head}>idle / at-risk (flows out of a degraded node):</div>
          {b.idle.map((e, i) => <div key={i} style={line}>{fmtEdge(e)}</div>)}
        </>}
      </div>
    );
  };

  const detail = () => {
    if (!sel) {
      return <div style={{ color: C.muted, fontSize: '12.5px', lineHeight: 1.6 }}>
        Click a node for its attributes, sources, and blast radius. Click an edge for its
        provenance class, every source (connector + ref + fetched_at), as_of, and
        compliance slots.</div>;
    }
    if (sel.type === 'node') {
      const n = byId[sel.key];
      const touching = graph.edges.filter((e) => e.src === sel.key || e.dst === sel.key);
      return (
        <div style={{ fontSize: '12.5px' }}>
          <div style={{ fontWeight: 700, color: C.ink }}>{n.label}</div>
          <div style={{ color: C.muted, fontSize: '11px', marginBottom: '8px' }}>{n.id} · {n.kind}</div>
          {Object.entries(n.attributes || {}).map(([k, v]) => (
            <div key={k} style={{ borderTop: `1px solid ${C.hairline}`, padding: '4px 0',
              color: C.ink2, overflowWrap: 'anywhere' }}>
              <span style={{ color: C.muted }}>{k}: </span>{String(v)}</div>
          ))}
          <div style={secHead}>Blast radius — if down</div>
          {blastView(sel.key)}
          <div style={secHead}>Edges ({touching.length})</div>
          {touching.map((e, i) => {
            const gi = graph.edges.indexOf(e);
            return (
              <div key={i} onClick={() => setSel({ type: 'edge', key: gi })}
                style={{ color: C.ink2, fontSize: '11.5px', margin: '4px 0', cursor: 'pointer',
                  overflowWrap: 'anywhere' }}>
                {fmtEdge(e)} <span style={{ color: C.muted }}>· as_of {e.as_of}</span>
              </div>
            );
          })}
        </div>
      );
    }
    const e = graph.edges[sel.key];
    return (
      <div style={{ fontSize: '12.5px' }}>
        <div style={{ fontWeight: 700, color: C.ink, overflowWrap: 'anywhere' }}>
          {byId[e.src].label} -[{e.kind}]-&gt; {byId[e.dst].label}</div>
        <div style={{ margin: '6px 0' }}>
          {badge(e.state)}{' '}
          <span style={{ color: C.muted, fontSize: '11px' }}>as_of {e.as_of} ({ago(e.as_of)})</span>
          {isStale(e.as_of) && <span style={{ color: C.shadow, fontWeight: 700 }}> ⏱ STALE (&gt;24h)</span>}
        </div>
        {e.state === 'undecidable' && (
          <div style={{ borderLeft: `3px solid ${C.undecidable}`, padding: '7px 10px',
            fontSize: '12px', color: C.ink2, margin: '8px 0', background: 'rgba(0,0,0,0.25)' }}>
            Declared, but no connected source can observe it. Install the{' '}
            <strong style={{ color: C.ink }}>{e.missing_connector}</strong> to verify.
            {e.why_unobserved && <div style={{ color: C.muted, marginTop: '4px' }}>{e.why_unobserved}</div>}
          </div>
        )}
        {e.state === 'phantom' && (
          <div style={{ color: C.ink2, fontSize: '12px', margin: '6px 0' }}>
            Observable via {e.observable_via} — the absence of evidence is itself evidence.
            {e.implication ? ` ${e.implication}` : ''}</div>
        )}
        {e.note && <div style={{ color: C.muted, fontSize: '11.5px' }}>{e.note}</div>}
        <div style={secHead}>Sources ({e.sources.length})</div>
        {e.sources.map((s, i) => (
          <div key={i} style={{ border: `1px solid ${C.hairline}`, borderRadius: '6px',
            padding: '6px 9px', margin: '6px 0', fontSize: '11.5px', color: C.ink2,
            overflowWrap: 'anywhere' }}>
            <span style={{ fontFamily: MONO, color: C.muted }}>[{s.class}]</span> {s.ref}
            <div style={{ color: C.muted, fontSize: '10.5px', marginTop: '2px' }}>
              connector: {s.connector} · fetched_at {s.fetched_at} ({ago(s.fetched_at)})</div>
          </div>
        ))}
        <div style={secHead}>Compliance slots</div>
        {Object.entries(e.compliance || {}).map(([k, v]) => (
          <div key={k} style={{ borderTop: `1px solid ${C.hairline}`, padding: '4px 0',
            fontSize: '11.5px' }}>
            <span style={{ color: C.muted }}>{k}: </span>
            <span style={{ color: v === null ? C.muted : C.ink2 }}>
              {v === null ? 'not evaluated' : String(v)}</span>
          </div>
        ))}
      </div>
    );
  };

  const tiles = [
    ['confirmed', 'declared + observed'],
    ['phantom', 'documented, not real — drift'],
    ['shadow', 'real, undocumented — drift'],
    ['undecidable', 'evidence gap — not drift'],
    ['hypothesis', 'inferred only'],
  ];

  return (
    <div>
      {/* header + legend */}
      <div style={{ color: C.ink2, fontSize: '12.5px', lineHeight: 1.6, marginBottom: '6px' }}>
        {graph.title} · graph as_of <strong style={{ color: C.ink }}>{graph.as_of}</strong>{' '}
        ({ago(graph.as_of)})
        {endpoint && <>{' '}· <a href={`${endpoint}/atlas`} target="_blank" rel="noreferrer"
          style={{ color: C.sel }}>print/PDF version →</a></>}
        <div style={{ color: C.muted, fontSize: '11px', marginTop: '2px' }}>
          {graph.evidence_window} · deterministic projection of atlas_graph.json — no LLM in this render</div>
      </div>
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', margin: '10px 0 14px' }}>
        {Object.entries(STYLE).map(([k, s]) => (
          <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px',
            fontSize: '11px', color: C.ink2 }}>
            <svg width="34" height="8">
              <line x1="1" y1="4" x2="33" y2="4" stroke={C[k]} strokeWidth={s.width}
                strokeDasharray={s.dash} /></svg>
            <span style={{ color: C[k], fontWeight: 600 }}>{k}</span>
          </span>
        ))}
      </div>

      {/* diagram + detail panel */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0,1fr) 300px',
        gap: '12px' }}>
        <div style={full ? {
          position: 'fixed', inset: 0, zIndex: 1000, background: '#121211',
          padding: '18px', display: 'flex', flexDirection: 'column'
        } : { ...cardStyle, padding: '6px', position: 'relative' }}>
          <div style={{ position: 'absolute', top: full ? '14px' : '10px',
            right: full ? '18px' : '10px', zIndex: 1, display: 'flex', gap: '6px' }}>
            {[
              ['＋', 'Zoom in', () => zoomBy(0.72)],
              ['－', 'Zoom out', () => zoomBy(1 / 0.72)],
              ['⌖', 'Re-center (fit)', () => setView(null)],
              [full ? '✕' : '⛶', full ? 'Exit full screen (Esc)' : 'View full screen',
               () => setFull(!full)],
            ].map(([glyph, title, onClick]) => (
              <button key={title} onClick={onClick} title={title}
                style={{
                  background: 'rgba(0,0,0,0.45)', border: `1px solid ${C.hairline}`,
                  borderRadius: '8px', color: C.ink2, fontSize: '14px',
                  padding: '5px 10px', cursor: 'pointer', fontFamily: MONO, lineHeight: 1.2
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = C.ink; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = C.ink2; }}>
                {glyph}
              </button>
            ))}
          </div>
          <svg viewBox={`${cam.x} ${cam.y} ${cam.w} ${cam.h}`}
            onPointerDown={onPointerDown} onPointerMove={onPointerMove}
            onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
            onClickCapture={(e) => {
              if (movedRef.current) { e.stopPropagation(); movedRef.current = false; }
            }}
            style={full ? { width: '100%', height: '100%', flex: 1, display: 'block',
                            cursor: dragRef.current ? 'grabbing' : 'grab', touchAction: 'none' }
                        : { width: '100%', height: 'auto', display: 'block', maxHeight: '68vh',
                            cursor: dragRef.current ? 'grabbing' : 'grab', touchAction: 'none' }}>
            <defs>
              {Object.keys(STYLE).map((k) => (
                <marker key={k} id={`rr-arr-${k}`} viewBox="0 0 10 10" refX="9" refY="5"
                  markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse">
                  <path d="M0,0 L10,5 L0,10 z" fill={C[k]} />
                </marker>
              ))}
            </defs>
            {hulls.map((h, i) => (
              <g key={`hull-${i}`}>
                <path d={h.d} fill="rgba(138,137,131,0.06)" stroke="rgba(138,137,131,0.10)"
                  strokeWidth="34" strokeLinejoin="round" />
                <text x={h.lx} y={h.ly} textAnchor="middle"
                  style={{ fill: C.muted, fontSize: '10px', textTransform: 'uppercase',
                    letterSpacing: '1px' }}>{h.label}</text>
              </g>
            ))}
            {graph.edges.map((e, i) => {
              const st = STYLE[e.state] || STYLE.hypothesis;
              const p = paths[i];
              const selected = sel?.type === 'edge' && sel.key === i;
              const driftLab = e.state === 'phantom' || e.state === 'shadow';
              return (
                <g key={i}>
                  <path d={p.d} fill="none" stroke={selected ? C.sel : C[e.state]}
                    strokeWidth={selected ? st.width + 0.8 : st.width}
                    strokeDasharray={st.dash} markerEnd={`url(#rr-arr-${e.state})`}
                    opacity={isStale(e.as_of) ? 0.45 : 1} />
                  <path d={p.d} fill="none" stroke="transparent" strokeWidth="14"
                    style={{ cursor: 'pointer' }} onClick={() => setSel({ type: 'edge', key: i })}>
                    <title>{`${e.src} -[${e.kind}]-> ${e.dst}\n${e.state} · observed ${ago(e.as_of)}`}</title>
                  </path>
                  {byId[e.dst].kind !== 'table' && (
                    <text x={p.lx} y={p.ly} textAnchor="middle"
                      style={{ fill: driftLab ? C[e.state] : C.muted, fontSize: '10px',
                        fontWeight: driftLab ? 700 : 400 }}>
                      {e.kind}{driftLab ? ' — DRIFT' : e.state === 'undecidable' ? ' — unknown' : ''}
                    </text>
                  )}
                </g>
              );
            })}
            {graph.nodes.map((n) => {
              const { x, y } = pos[n.id];
              const w = NODE_W[n.kind], h = NODE_H[n.kind];
              const selected = sel?.type === 'node' && sel.key === n.id;
              const stroke = selected ? C.sel : C.nodeStroke;
              return (
                <g key={n.id} style={{ cursor: 'pointer' }}
                  onClick={() => setSel({ type: 'node', key: n.id })}>
                  <title>{n.id}</title>
                  {n.kind === 'datastore' ? (
                    <path d={`M ${x - w / 2} ${y - h / 2 + 7} A ${w / 2} 7 0 0 1 ${x + w / 2} ${y - h / 2 + 7}` +
                      ` L ${x + w / 2} ${y + h / 2 - 7} A ${w / 2} 7 0 0 1 ${x - w / 2} ${y + h / 2 - 7} Z` +
                      ` M ${x - w / 2} ${y - h / 2 + 7} A ${w / 2} 7 0 0 0 ${x + w / 2} ${y - h / 2 + 7}`}
                      fill={C.nodeFill} stroke={stroke} strokeWidth={selected ? 2.4 : 1.3} />
                  ) : (
                    <rect x={x - w / 2} y={y - h / 2} width={w} height={h}
                      rx={n.kind === 'external_api' ? h / 2 : n.kind === 'table' ? 4 : 8}
                      fill={C.nodeFill} stroke={stroke} strokeWidth={selected ? 2.4 : 1.3} />
                  )}
                  <KindIcon kind={n.kind} x={x - w / 2 + 10} y={n.kind === 'datastore' ? y + 2 : y} />
                  <text x={x + 8} y={y + 4} textAnchor="middle"
                    style={{ fill: C.ink, fontSize: '12.5px' }}>{n.label}</text>
                  {!clustered.has(n.kind) && (
                    <text x={x} y={y - h / 2 - 5} textAnchor="middle"
                      style={{ fill: C.muted, fontSize: '9px', textTransform: 'uppercase',
                        letterSpacing: '.6px' }}>{n.kind.replace('_', ' ')}</text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
        <div style={{ ...cardStyle, minHeight: '220px', maxHeight: '560px', overflowY: 'auto' }}>
          <div style={{ ...secHead, marginTop: 0 }}>Details</div>
          {detail()}
        </div>
      </div>

      {/* envelope tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(6, 1fr)',
        gap: '10px', marginTop: '14px' }}>
        {tiles.map(([k, sub]) => (
          <div key={k} style={cardStyle}>
            <div style={{ fontSize: '10px', color: C.ink2, fontFamily: MONO,
              textTransform: 'uppercase', letterSpacing: '1px' }}>{k}</div>
            <div style={{ fontSize: '24px', fontWeight: 800,
              color: counts[k] > 0 && (k === 'phantom' || k === 'shadow') ? C[k] : C.ink }}>
              {counts[k]}</div>
            <div style={{ fontSize: '10px', color: C.muted }}>{sub}</div>
          </div>
        ))}
        <div style={cardStyle}>
          <div style={{ fontSize: '10px', color: C.ink2, fontFamily: MONO,
            textTransform: 'uppercase', letterSpacing: '1px' }}>map freshness</div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: C.ink }}>{ago(oldest)}</div>
          <div style={{ fontSize: '10px', color: C.muted }}>oldest as_of in the graph</div>
        </div>
      </div>

      {/* drift + could-not-determine + blast */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '3fr 2fr',
        gap: '12px', marginTop: '14px' }}>
        <div>
          <div style={secHead}>Drift findings — documented ≠ real</div>
          {drift.length === 0 && <div style={{ color: C.muted, fontSize: '12px' }}>
            No phantom or shadow edges.</div>}
          {drift.map(([e, i]) => (
            <div key={i} onClick={() => setSel({ type: 'edge', key: i })}
              style={{ ...cardStyle, borderLeft: `3px solid ${C[e.state]}`, marginBottom: '8px',
                cursor: 'pointer' }}>
              {badge(e.state)}{' '}
              <strong style={{ color: C.ink, fontSize: '13px', overflowWrap: 'anywhere' }}>
                {byId[e.src].label} -[{e.kind}]-&gt; {byId[e.dst].label}</strong>
              {e.implication && <div style={{ color: C.ink2, fontSize: '12px', marginTop: '5px' }}>
                {e.implication}</div>}
              <div style={{ color: C.muted, fontSize: '11px', marginTop: '4px' }}>
                as_of {e.as_of} · click for sources</div>
            </div>
          ))}
          <div style={secHead}>Could not determine — evidence gaps, not drift</div>
          {(graph.could_not_determine || []).map((u, i) => (
            <div key={i} style={{ ...cardStyle, borderLeft: `3px solid ${C.undecidable}`,
              marginBottom: '8px' }}>
              <strong style={{ color: C.ink, fontSize: '12.5px', overflowWrap: 'anywhere' }}>{u.edge}</strong>
              <div style={{ color: C.ink2, fontSize: '11.5px', marginTop: '4px' }}>{u.why}</div>
              <div style={{ color: C.muted, fontSize: '11px', marginTop: '4px' }}>
                Connector to install: <strong style={{ color: C.ink2 }}>{u.connector_to_install}</strong></div>
            </div>
          ))}
        </div>
        <div>
          <div style={secHead}>Blast radius — what breaks if down</div>
          <div style={cardStyle}>
            <select value={blastTarget} onChange={(e) => setBlastTarget(e.target.value)}
              style={{ width: '100%', background: '#0a0a0a', color: C.ink,
                border: `1px solid ${C.hairline}`, borderRadius: '6px', padding: '6px 8px',
                font: 'inherit', fontSize: '12.5px', marginBottom: '10px' }}>
              {graph.nodes.map((n) => (
                <option key={n.id} value={n.id}>{n.label} ({n.kind})</option>
              ))}
            </select>
            {blastView(blastTarget)}
          </div>
        </div>
      </div>

      {/* evidence appendix */}
      <div style={secHead}>
        <span onClick={() => setShowAppendix(!showAppendix)} style={{ cursor: 'pointer' }}>
          Evidence appendix — per-edge verifiability record {showAppendix ? '▾' : '▸'}</span>
      </div>
      {showAppendix && (
        <div style={{ ...cardStyle, overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '11.5px' }}>
            <thead>
              <tr>{['ref', 'edge', 'state', 'as_of', 'sources'].map((h) => (
                <th key={h} style={{ textAlign: 'left', color: C.muted, fontWeight: 600,
                  padding: '5px 12px 5px 0', borderBottom: `1px solid ${C.hairline}`,
                  whiteSpace: 'nowrap' }}>{h}</th>))}
              </tr>
            </thead>
            <tbody>
              {graph.edges.map((e, i) => (
                <tr key={i}>
                  <td style={{ padding: '5px 12px 5px 0', borderTop: `1px solid ${C.hairline}`,
                    color: C.muted, fontFamily: MONO, whiteSpace: 'nowrap' }}>edge-{i}</td>
                  <td style={{ padding: '5px 12px 5px 0', borderTop: `1px solid ${C.hairline}`,
                    color: C.ink2 }}>{byId[e.src].label} -[{e.kind}]-&gt; {byId[e.dst].label}</td>
                  <td style={{ padding: '5px 12px 5px 0', borderTop: `1px solid ${C.hairline}` }}>
                    {badge(e.state)}</td>
                  <td style={{ padding: '5px 12px 5px 0', borderTop: `1px solid ${C.hairline}`,
                    color: C.muted, fontFamily: MONO, whiteSpace: 'nowrap' }}>{e.as_of}</td>
                  <td style={{ padding: '5px 0', borderTop: `1px solid ${C.hairline}`,
                    color: C.ink2, overflowWrap: 'anywhere' }}>
                    {e.sources.map((s, j) => (
                      <div key={j}>[{s.class}] {s.ref}
                        <span style={{ color: C.muted }}> — {s.connector.split(' (')[0]}, {s.fetched_at}</span>
                      </div>))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
