// Everything is saved in this browser (localStorage).
const KEY = 'clover-atlas.v1';
const SKEY = 'clover-atlas.settings';

export const PALETTE = ['#7fae8b', '#e29aa8', '#d9b25c', '#a99bd6', '#86b2dc', '#e7a27c', '#6fbfae', '#c49a7c', '#b5c46a', '#d68fc4'];

const TRANSIENT = new Set(['packLoading', 'packError', 'resLoading', 'resError', 'resMore', '_byId', '_i']);
function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || { maps: {} }; } catch { return { maps: {} }; }
}
let db = load();
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(db, (k, v) => (TRANSIENT.has(k) ? undefined : v))); return true; }
  catch { alert('Your browser storage is full. Delete an old roadmap or export a backup.'); return false; }
}

export const uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);

export function listMaps() {
  return Object.values(db.maps).sort((a, b) => (b.opened || b.updated) - (a.opened || a.updated));
}
export const getMap = (id) => db.maps[id];
export function putMap(map) {
  map.updated = Date.now();
  map.tracks.forEach((t, i) => { if (!t.color) t.color = PALETTE[i % PALETTE.length]; });
  map.nodes.forEach(n => { n.done = !!n.done; n.notes = n.notes || ''; });
  db.maps[map.id] = map;
  save();
  return map;
}
export function touchMap(id) { if (db.maps[id]) { db.maps[id].opened = Date.now(); save(); } }
export function deleteMap(id) { delete db.maps[id]; save(); }
export function saveSoon(map) {
  clearTimeout(saveSoon.t);
  saveSoon.t = setTimeout(() => putMap(map), 300);
}

export function newMap(data, source) {
  return putMap({ id: uid(), created: Date.now(), source, ...data });
}

export function progress(map) {
  const total = map.nodes.length;
  const done = map.nodes.filter(n => n.done).length;
  const hours = map.nodes.reduce((s, n) => s + (n.done ? 0 : n.hours || 0), 0);
  return { total, done, pct: total ? Math.round((done / total) * 100) : 0, hoursLeft: Math.round(hours) };
}

export function nodeStatus(map, node) {
  if (node.done) return 'done';
  const ready = node.prereqs.every(p => map.nodes.find(n => n.id === p)?.done);
  return ready ? 'ready' : 'locked';
}

const DEFAULT_SETTINGS = { provider: 'auto', geminiKey: '', geminiModel: 'gemini-2.5-flash', openaiKey: '', openaiBase: 'https://api.openai.com/v1', openaiModel: 'gpt-4o-mini' };
export function getSettings() {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SKEY)) }; } catch { return { ...DEFAULT_SETTINGS }; }
}
export function setSettings(s) { localStorage.setItem(SKEY, JSON.stringify({ ...getSettings(), ...s })); }

export function exportAll() {
  return JSON.stringify({ app: 'clover-atlas', version: 1, maps: db.maps }, null, 1);
}
export function importData(text) {
  const data = JSON.parse(text);
  const maps = data.maps ? Object.values(data.maps) : data.nodes ? [data] : [];
  if (!maps.length) throw new Error('No roadmaps found in that file.');
  let count = 0;
  for (const m of maps) {
    if (!m.nodes || !m.tracks) continue;
    if (db.maps[m.id]) m.id = uid();
    db.maps[m.id || (m.id = uid())] = m; count++;
  }
  save();
  return count;
}

const b64u = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

export async function shareCode(map) {
  const slim = { t: map.title, s: map.summary, d: map.domain, l: map.source?.level,
    k: map.tracks.map(t => [t.id, t.name]),
    n: map.nodes.map(n => [n.id, n.title, n.track, n.prereqs, n.level, n.hours, n.optional ? 1 : 0, n.desc]) };
  const bytes = new TextEncoder().encode(JSON.stringify(slim));
  if (!window.CompressionStream) return 'j' + b64u(bytes);
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return 'z' + b64u(new Uint8Array(await new Response(stream).arrayBuffer()));
}
export async function fromShareCode(code) {
  let bytes = unb64u(code.slice(1));
  if (code[0] === 'z') {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  }
  const s = JSON.parse(new TextDecoder().decode(bytes));
  return { title: s.t, summary: s.s, domain: s.d, source: { level: s.l, input: s.t },
    tracks: s.k.map(([id, name]) => ({ id, name })),
    nodes: s.n.map(([id, title, track, prereqs, level, hours, opt, desc]) => ({ id, title, track, prereqs, level, hours, optional: !!opt, desc })) };
}
