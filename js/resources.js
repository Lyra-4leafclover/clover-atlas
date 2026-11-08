// Real, direct study resources for a concept.
// Step 1 (fast, ~1s): YouTube + Wikipedia + Hacker News + Stack Overflow + GitHub + Open Library through /api/find.
// Step 2 (AI, in the background): hand-picked docs, guides and courses; every link is opened on the server and dropped if dead.
import { shortTopic } from './links.js';
import { complete } from './ai.js';

const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };

const plain = (t) => String(t).replace(/[&()/:,+|"'?!]+/g, ' ').replace(/\s+/g, ' ').trim();

function topicOf(map, node) {
  const ctx = plain(shortTopic(map));
  const title = plain(node.title);
  return ctx && !ctx.toLowerCase().split(' ').every(w => title.toLowerCase().includes(w)) ? `${title} ${ctx}` : title;
}

async function find(queries) {
  let r;
  try {
    r = await fetch('api/find', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ queries }), signal: AbortSignal.timeout(25000) });
  } catch {
    throw new Error('Could not reach the resource finder. Check your connection and try again.');
  }
  if (!r.ok) throw new Error(r.status === 404 || r.status === 405 || r.status === 501
    ? 'The resource finder needs the Clover Atlas server (python3 server.py or the Vercel deploy). It is not available on this host.'
    : 'The resource finder is busy. Try again in a moment.');
  return (await r.json()).results || {};
}

export async function findResources(map, node) {
  const topic = topicOf(map, node), title = plain(node.title);
  const tech = map.domain === 'tech';
  const secs = [
    { key: 'videos', cost: 'free', name: 'Videos', kind: 'video', q: `${topic} explained tutorial`, n: 9 },
    { key: 'long', cost: 'free', name: 'Full lectures & free video courses', kind: 'video', q: `${topic} full course lecture`, n: 6 },
    { key: 'wiki', cost: 'free', name: 'Read', kind: 'wiki', q: title, n: 2 },
    { key: 'hn', cost: 'free', name: 'Read', kind: 'hn', q: title, n: 5 },
    ...(tech ? [
      { key: 'so', cost: 'free', name: 'Top questions & answers', kind: 'so', q: title, n: 5 },
      { key: 'gh', cost: 'free', name: 'Projects & example code', kind: 'github', q: title, n: 5 }
    ] : []),
    { key: 'books', cost: 'mixed', name: 'Books', kind: 'books', q: title, n: 4 },
    { key: 'books2', cost: 'mixed', name: 'Books', kind: 'books', q: plain(shortTopic(map)) || title, n: 3 }
  ];
  const results = await find(secs.map(({ key, kind, q, n }) => ({ key, kind, q, n })));
  const out = { free: [], paid: [], at: Date.now() };
  const seen = new Set();
  const add = (cost, name, kind, item) => {
    if (!item?.url || seen.has(item.url)) return;
    seen.add(item.url);
    let g = out[cost].find(x => x.name === name);
    if (!g) out[cost].push(g = { name, kind, items: [] });
    g.items.push(item);
  };
  for (const s of secs) {
    for (const it of results[s.key] || []) {
      if (s.cost === 'mixed') add(it.cost === 'paid' ? 'paid' : 'free', it.cost === 'paid' ? 'Books' : 'Free books', 'web', it);
      else add(s.cost, s.name, s.kind, it);
    }
  }
  if (!out.free.length && !out.paid.length) throw new Error('No resources were found for this concept. Try again in a moment.');
  return out;
}

const GROUP = {
  docs: 'Official docs & guides', article: 'Articles & guides', course: 'Free courses', book: 'Free books',
  interactive: 'Interactive & practice', practice: 'Interactive & practice', tool: 'Interactive & practice'
};

export async function aiPicks(map, node, res) {
  const track = map.tracks.find(t => t.id === node.track)?.name || '';
  const text = await complete(`List the best study resources for the concept "${node.title}" (roadmap "${map.title}", module "${track}"). ${node.desc || ''}
Only resources you are SURE exist, each with its exact, full URL: official documentation pages, famous articles and guides, free courses (MIT OCW, Khan Academy, freeCodeCamp, Coursera, university pages), interactive tutorials, free online books, practice sites, plus a few paid courses and books. No YouTube links.
Output EXACTLY these lines:
FREE: <docs|article|course|book|interactive|practice|tool> | <exact title> | <exact url>   (12-16 lines)
PAID: <course|book|tool> | <exact title> | <exact url> | <price hint, e.g. ~$15 or subscription>   (3-5 lines)`, { maxTokens: 3000 });
  const picks = [];
  for (const raw of String(text).split(/\r?\n/)) {
    const m = raw.replace(/[*`]/g, '').trim().match(/^[-•\d.\s]*(FREE|PAID)\s*:\s*(.+)$/i);
    if (!m) continue;
    const f = m[2].split('|').map(x => x.trim());
    const url = (f.find(x => /^https?:\/\/[^\s]+\.[^\s]+$/.test(x)) || '').replace(/[<>)\]]+$/, '');
    if (!url || /youtube\.com|youtu\.be|example\.com/.test(url)) continue;
    picks.push({ cost: m[1].toUpperCase() === 'PAID' ? 'paid' : 'free', type: (f[0] || '').toLowerCase().replace(/[^a-z]/g, ''), title: f[1] || '', url, price: m[1].toUpperCase() === 'PAID' ? f.slice(3).join(' ') : '' });
  }
  const urls = [...new Set(picks.map(p => p.url))].filter(u => !res.free.concat(res.paid).some(g => g.items.some(i => i.url === u))).slice(0, 24);
  if (!urls.length) return res;
  const checked = (await find([{ key: 'c', kind: 'check', urls }])).c || {};
  for (const p of picks) {
    const c = checked[p.url];
    // keep links that opened; big course stores block checkers, so keep their course pages unverified
    if (!c || !(c.ok || (c.ok === null && /(^|\.)(udemy\.com|pluralsight\.com|oreilly\.com|amazon\.com|linkedin\.com)$/.test(host(p.url))))) continue;
    const name = p.cost === 'paid' ? (p.type === 'book' ? 'Books' : 'Paid courses & tools') : (GROUP[p.type] || 'Articles & guides');
    let g = res[p.cost].find(x => x.name === name);
    if (!g) res[p.cost].push(g = { name, kind: 'web', items: [] });
    if (g.items.some(i => i.url === p.url)) continue;
    g.items.unshift({ url: p.url, title: p.title || c.title || host(p.url), snippet: [c.title && c.title !== p.title ? c.title : '', p.price].filter(Boolean).join(' · ').slice(0, 200), host: host(p.url), picked: true });
  }
  const order = ['Videos', 'Official docs & guides', 'Articles & guides', 'Read', 'Free courses', 'Full lectures & free video courses', 'Interactive & practice', 'Top questions & answers', 'Projects & example code', 'Free books', 'Paid courses & tools', 'Books'];
  for (const k of ['free', 'paid']) res[k].sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
  res.paid.forEach(g => { g.items = g.items.slice(0, 6); });
  res.ai = true;
  return res;
}

export const count = (groups) => groups.reduce((a, g) => a + g.items.length, 0);
