// Lays out the roadmap as a branching map and handles pan / zoom.
import { nodeStatus } from './store.js';

const W = 224, H = 78, GX = 30, GY = 104, PAD = 80;

export function layout(map) {
  const byId = Object.fromEntries(map.nodes.map(n => [n.id, n]));
  const kids = Object.fromEntries(map.nodes.map(n => [n.id, []]));
  map.nodes.forEach(n => n.prereqs.forEach(p => kids[p]?.push(n.id)));
  const depth = {};
  const d = (id) => depth[id] ??= byId[id].prereqs.length ? 1 + Math.max(...byId[id].prereqs.map(d)) : 0;
  map.nodes.forEach(n => d(n.id));
  // pull nodes down next to the concepts they unlock (roots with nearby children stay in the start row)
  [...map.nodes].sort((a, b) => depth[b.id] - depth[a.id]).forEach(n => {
    if (!kids[n.id].length) return;
    depth[n.id] = Math.max(depth[n.id], Math.min(...kids[n.id].map(k => depth[k])) - 1);
  });
  const nLayers = Math.max(...Object.values(depth)) + 1;
  const trackIdx = Object.fromEntries(map.tracks.map((t, i) => [t.id, i]));
  const layers = Array.from({ length: nLayers }, () => []);
  map.nodes.forEach((n, i) => { n._i = i; layers[depth[n.id]].push(n.id); });
  layers.forEach(L => L.sort((a, b) => (trackIdx[byId[a].track] - trackIdx[byId[b].track]) || byId[a]._i - byId[b]._i));

  const pos = {};
  const S = W + GX;
  const setRow = (L) => L.forEach((id, i) => pos[id] = (i - (L.length - 1) / 2) * S);
  layers.forEach(setRow);
  const avg = (ids) => ids.reduce((s, id) => s + pos[id], 0) / ids.length;
  const nTracks = map.tracks.length || 1;
  for (let it = 0; it < 8; it++) {
    const down = it % 2 === 0;
    const order = down ? layers.map((_, i) => i) : layers.map((_, i) => nLayers - 1 - i);
    for (const li of order) {
      const L = layers[li];
      const key = {};
      L.forEach(id => {
        const nb = down ? byId[id].prereqs : kids[id];
        const bc = nb.length ? avg(nb) : pos[id];
        key[id] = bc + (trackIdx[byId[id].track] - nTracks / 2) * 6;
      });
      L.sort((a, b) => key[a] - key[b]);
      setRow(L);
    }
  }
  // place each row near the concepts it connects to, without overlaps
  const place = (L, want) => {
    const x = L.map(id => want(id));
    for (let i = 1; i < x.length; i++) x[i] = Math.max(x[i], x[i - 1] + S);
    for (let i = x.length - 2; i >= 0; i--) x[i] = Math.min(x[i], x[i + 1] - S);
    for (let i = 1; i < x.length; i++) x[i] = Math.max(x[i], x[i - 1] + S);
    L.forEach((id, i) => pos[id] = x[i]);
  };
  for (let it = 0; it < 4; it++) {
    for (let li = 1; li < nLayers; li++) place(layers[li], id => byId[id].prereqs.length ? avg(byId[id].prereqs) : pos[id]);
    for (let li = nLayers - 2; li >= 0; li--) place(layers[li], id => kids[id].length ? (pos[id] + avg(kids[id])) / 2 : pos[id]);
  }
  const xs = Object.values(pos);
  const minX = Math.min(...xs);
  const out = {};
  map.nodes.forEach(n => out[n.id] = { x: pos[n.id] - minX + PAD + 70, y: depth[n.id] * (H + GY) + PAD, layer: depth[n.id] });
  return { pos: out, kids, layers, width: Math.max(...xs) - minX + W + PAD * 2 + 70, height: nLayers * (H + GY) - GY + PAD * 2 };
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function createGraph(el, map, { onOpen, onToggle }) {
  el.innerHTML = `<div class="world"><svg class="edges"></svg><div class="stages"></div><div class="gnodes"></div></div>
    <div class="gctl">
      <button data-z="in" aria-label="Zoom in">+</button><button data-z="out" aria-label="Zoom out">−</button><button data-z="fit" aria-label="Fit whole map">⤢</button>
    </div>`;
  const world = el.querySelector('.world'), svg = el.querySelector('.edges'), nodesEl = el.querySelector('.gnodes'), stagesEl = el.querySelector('.stages');
  let L, view = { x: 0, y: 0, k: 1 }, selected = null, filter = null, search = '';

  function build() {
    L = layout(map);
    world.style.width = L.width + 'px'; world.style.height = L.height + 'px';
    svg.setAttribute('width', L.width); svg.setAttribute('height', L.height);
    stagesEl.innerHTML = L.layers.map((_, i) => `<div class="stage" style="top:${i * (H + GY) + PAD + H / 2 - 10}px">${i === 0 ? 'Start' : 'Step ' + (i + 1)}</div>`).join('');
    const color = Object.fromEntries(map.tracks.map(t => [t.id, t.color]));
    const tname = Object.fromEntries(map.tracks.map(t => [t.id, t.name]));
    nodesEl.innerHTML = map.nodes.map(n => {
      const p = L.pos[n.id];
      return `<div class="gnode" data-id="${esc(n.id)}" style="left:${p.x}px;top:${p.y}px;width:${W}px;height:${H}px;--c:${color[n.track]}" tabindex="0" role="button" aria-label="${esc(n.title)}">
        <button class="tick" data-tick aria-label="Mark ${esc(n.title)} as done"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.2 4.2L19 7"/></svg></button>
        <div class="gbody"><div class="gtitle">${esc(n.title)}</div>
        <div class="gmeta"><span class="tdot"></span><span class="tname">${esc(tname[n.track] || '')}</span><span>· ${n.hours}h</span>${n.optional ? '<span class="opt">optional</span>' : ''}</div></div>
        <span class="lock" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg></span>
      </div>`;
    }).join('');
    refresh();
  }

  function edgePath(a, b) {
    const x1 = a.x + W / 2, y1 = a.y + H, x2 = b.x + W / 2, y2 = b.y;
    const dy = Math.max(40, (y2 - y1) * 0.5);
    return `M${x1},${y1} C${x1},${y1 + dy} ${x2},${y2 - dy} ${x2},${y2}`;
  }

  function related(id) {
    const anc = new Set(), desc = new Set();
    const up = (x) => map.nodes.find(n => n.id === x)?.prereqs.forEach(p => { if (!anc.has(p)) { anc.add(p); up(p); } });
    up(id);
    (L.kids[id] || []).forEach(k => desc.add(k));
    return { anc, desc };
  }

  function refresh() {
    const rel = selected ? related(selected) : null;
    const s = search.trim().toLowerCase();
    const edges = [];
    for (const n of map.nodes) for (const p of n.prereqs) {
      const from = map.nodes.find(x => x.id === p);
      let cls = from?.done ? 'done' : '';
      if (rel && ((n.id === selected && rel.anc.has(p)) || (rel.anc.has(n.id) && rel.anc.has(p)))) cls += ' hl';
      else if (rel && p === selected) cls += ' hl kid';
      else if (rel || filter || s) cls += ' dim';
      edges.push(`<path class="${cls}" d="${edgePath(L.pos[p], L.pos[n.id])}"/>`);
    }
    svg.innerHTML = `<defs><marker id="arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z"/></marker></defs>` + edges.join('');
    for (const el2 of nodesEl.children) {
      const n = map.nodes.find(x => x.id === el2.dataset.id);
      const st = nodeStatus(map, n);
      el2.className = `gnode ${st}${n.optional ? ' optional' : ''}`;
      if (selected === n.id) el2.classList.add('sel');
      if (rel?.anc.has(n.id)) el2.classList.add('anc');
      if (rel?.desc.has(n.id)) el2.classList.add('kid');
      const dimmed = (rel && selected !== n.id && !rel.anc.has(n.id) && !rel.desc.has(n.id)) ||
        (filter && n.track !== filter) || (s && !(`${n.title} ${n.desc}`.toLowerCase().includes(s)));
      if (dimmed) el2.classList.add('dim');
      el2.querySelector('.tick').setAttribute('aria-pressed', n.done);
    }
  }

  const apply = () => { world.style.transform = `translate(${view.x}px,${view.y}px) scale(${view.k})`; el.style.setProperty('--k', view.k); };
  const clampK = (k) => Math.min(1.8, Math.max(0.2, k));
  function zoomAt(k, cx, cy) {
    k = clampK(k);
    view.x = cx - (cx - view.x) * (k / view.k);
    view.y = cy - (cy - view.y) * (k / view.k);
    view.k = k; apply();
  }
  function fit(initial = false) {
    const r = el.getBoundingClientRect();
    let k = Math.min((r.width - 20) / L.width, (r.height - 20) / L.height, 1);
    if (initial) k = Math.max(k, r.width < 700 ? 0.62 : 0.78);
    view.k = clampK(k);
    view.x = Math.max((r.width - L.width * view.k) / 2, initial ? -(L.width * view.k - r.width) / 2 : -Infinity);
    view.y = initial && L.height * view.k > r.height ? 10 : (r.height - L.height * view.k) / 2;
    apply();
  }
  function centerOn(id) {
    const p = L.pos[id]; if (!p) return;
    const r = el.getBoundingClientRect();
    const drawerOpen = document.body.classList.contains('drawer-open');
    const wide = r.width > 900;
    const cx = drawerOpen && wide ? (r.width - Math.min(460, r.width * 0.42)) / 2 : r.width / 2;
    const cy = drawerOpen && !wide ? r.height * 0.18 : r.height / 2;
    view.x = cx - (p.x + W / 2) * view.k;
    view.y = cy - (p.y + H / 2) * view.k;
    world.classList.add('glide'); apply(); setTimeout(() => world.classList.remove('glide'), 400);
  }

  // pointer handling
  const pts = new Map();
  let start = null, moved = false, pinch = null;
  el.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.gctl')) return;
    if (e.target.closest('[data-tick]')) return;
    el.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 1) { start = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, target: e.target.closest('.gnode') }; moved = false; }
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), k: view.k }; moved = true;
    }
  });
  el.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const r = el.getBoundingClientRect();
    if (pts.size >= 2 && pinch) {
      const [a, b] = [...pts.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      zoomAt(pinch.k * d / pinch.d, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
      return;
    }
    if (!start) return;
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    if (Math.abs(dx) + Math.abs(dy) > 6) { moved = true; el.classList.add('grabbing'); }
    if (moved) { view.x = start.vx + dx; view.y = start.vy + dy; apply(); }
  });
  const end = (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch = null;
    if (pts.size === 0) {
      el.classList.remove('grabbing');
      if (!moved && start?.target && e.type === 'pointerup') onOpen(start.target.dataset.id);
      else if (!moved && !start?.target && e.type === 'pointerup') onOpen(null);
      start = null;
    } else if (pts.size === 1) {
      const [p] = pts.values(); start = { x: p.x, y: p.y, vx: view.x, vy: view.y, target: null };
    }
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = el.getBoundingClientRect();
    if (!e.ctrlKey && Math.abs(e.deltaX) > Math.abs(e.deltaY) * 0.6) { view.x -= e.deltaX; view.y -= e.deltaY; apply(); return; }
    zoomAt(view.k * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018)), e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });
  el.addEventListener('click', (e) => {
    const t = e.target.closest('[data-tick]');
    if (t) { e.stopPropagation(); onToggle(t.closest('.gnode').dataset.id); return; }
    const z = e.target.closest('[data-z]')?.dataset.z;
    const r = el.getBoundingClientRect();
    if (z === 'in') zoomAt(view.k * 1.25, r.width / 2, r.height / 2);
    if (z === 'out') zoomAt(view.k / 1.25, r.width / 2, r.height / 2);
    if (z === 'fit') fit();
  });
  el.addEventListener('keydown', (e) => {
    const n = e.target.closest?.('.gnode');
    if (n && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onOpen(n.dataset.id); }
  });

  build();
  requestAnimationFrame(() => fit(true));
  return {
    refresh, rebuild: build, fit, centerOn,
    select(id) { selected = id; refresh(); },
    setFilter(t) { filter = t; refresh(); },
    setSearch(s) {
      search = s; refresh();
      const hit = s.trim() && map.nodes.find(n => `${n.title} ${n.desc}`.toLowerCase().includes(s.trim().toLowerCase()));
      if (hit) centerOn(hit.id);
    },
  };
}
