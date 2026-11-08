// Vercel serverless function: finds REAL resources for a concept.
// POST { queries: [{ key, kind: 'video' | 'web', q, n }] } -> { results: { key: [...] } }
// Videos from YouTube search; articles, Q&A, repos and books from the Wikipedia, Hacker News,
// Stack Exchange, GitHub and Open Library APIs; kind 'check' verifies AI-suggested links. No keys needed.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';

const unescape = (s) => String(s || '')
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
  .replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
const strip = (s) => unescape(String(s || '').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();

async function fetchText(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' }, signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}

async function youtube(q, n) {
  const h = await fetchText(`https://www.youtube.com/results?sp=EgIQAQ%253D%253D&search_query=${encodeURIComponent(q)}`);
  const m = h.match(/var ytInitialData = (\{.*?\});<\/script>/s);
  if (!m) return [];
  const out = [], seen = new Set();
  const walk = (o) => {
    if (Array.isArray(o)) return o.forEach(walk);
    if (!o || typeof o !== 'object') return;
    const v = o.videoRenderer;
    if (v?.videoId && v.lengthText && !seen.has(v.videoId)) {
      seen.add(v.videoId);
      out.push({
        url: `https://www.youtube.com/watch?v=${v.videoId}`,
        title: (v.title?.runs || []).map(r => r.text).join(''),
        by: v.ownerText?.runs?.[0]?.text || '',
        len: v.lengthText.simpleText || '',
        views: v.shortViewCountText?.simpleText || '',
        thumb: `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`
      });
    }
    Object.values(o).forEach(walk);
  };
  walk(JSON.parse(m[1]));
  return out.slice(0, n);
}

async function fetchJson(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
const enc = encodeURIComponent;

function relevant(q, text) {
  const words = (q.toLowerCase().match(/[a-z0-9+#]+/g) || []).filter(w => w.length > 2);
  const t = String(text).toLowerCase();
  const hit = words.filter(w => t.includes(w.replace(/s$/, ''))).length;
  return !words.length || (words.length <= 3 ? hit === words.length : hit * 3 >= words.length * 2);
}

async function wiki(q, n) {
  const d = await fetchJson(`https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=${n}&srsearch=${enc(q)}`);
  return (d.query?.search || []).map(x => ({ url: `https://en.wikipedia.org/wiki/${enc(x.title.replace(/ /g, '_'))}`, title: `${x.title} (Wikipedia)`, snippet: strip(x.snippet).slice(0, 200), host: 'en.wikipedia.org' }));
}

async function hn(q, n) {
  const d = await fetchJson(`https://hn.algolia.com/api/v1/search?tags=story&hitsPerPage=30&query=${enc(q)}`);
  return (d.hits || []).filter(h => h.url && (h.points || 0) >= 15 && relevant(q, h.title) && !/(twitter|x)\.com\//.test(h.url)).sort((a, b) => b.points - a.points).slice(0, n)
    .map(h => ({ url: h.url, title: h.title, snippet: `${h.points} upvotes on Hacker News`, host: hostOf(h.url) }));
}

async function so(q, n) {
  const base = 'https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=votes&site=stackoverflow&accepted=True';
  let items = (await fetchJson(`${base}&pagesize=${n}&title=${enc(q)}`)).items || [];
  if (!items.length) items = ((await fetchJson(`${base}&pagesize=30&q=${enc(q)}`)).items || []).filter(x => relevant(q, strip(x.title))).slice(0, n);
  return items.map(x => ({ url: x.link, title: strip(x.title), snippet: `${x.score} votes · ${x.answer_count} answers`, host: 'stackoverflow.com' }));
}

async function github(q, n) {
  const d = await fetchJson(`https://api.github.com/search/repositories?sort=stars&per_page=30&q=${enc(q + ' in:name,description,topics')}`);
  return (d.items || []).filter(x => relevant(q, `${x.full_name.replace(/-/g, ' ')} ${x.description || ''}`)).slice(0, n).map(x => ({ url: x.html_url, title: x.full_name, snippet: `★ ${x.stargazers_count.toLocaleString('en')} · ${(x.description || '').slice(0, 160)}`, host: 'github.com' }));
}

function isbn10(i) {
  i = String(i).replace(/-/g, '');
  if (i.length === 10) return i;
  if (i.length === 13 && i.startsWith('978')) {
    const core = i.slice(3, 12);
    const c = (11 - [...core].reduce((a, x, k) => a + (10 - k) * +x, 0) % 11) % 11;
    return core + (c === 10 ? 'X' : String(c));
  }
  return '';
}

async function books(q, n) {
  const d = await fetchJson(`https://openlibrary.org/search.json?limit=${n * 2}&fields=key,title,author_name,first_publish_year,ebook_access,isbn&q=${enc(q)}`);
  const out = [];
  for (const x of d.docs || []) {
    const meta = [(x.author_name || []).slice(0, 2).join(', '), x.first_publish_year].filter(Boolean).join(' · ');
    if (['public', 'borrowable'].includes(x.ebook_access)) out.push({ url: `https://openlibrary.org${x.key}`, title: x.title, snippet: `${meta} · free to read or borrow on Open Library`, host: 'openlibrary.org', cost: 'free' });
    const isbn = (x.isbn || []).map(isbn10).find(Boolean);
    if (isbn) out.push({ url: `https://www.amazon.com/dp/${isbn}`, title: x.title, snippet: meta, host: 'amazon.com', cost: 'paid' });
  }
  return out.slice(0, n * 2);
}

async function check(url) {
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return { ok: false };
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,*/*', 'Accept-Language': 'en-US' }, redirect: 'follow', signal: AbortSignal.timeout(8000) });
    if (r.status === 404 || r.status === 410) return { ok: false };
    if (!r.ok) return { ok: null };
    const page = (await r.text()).slice(0, 300000);
    const title = strip(page.match(/<title[^>]*>(.*?)<\/title>/is)?.[1] || '').slice(0, 160);
    if (/\b(404|page not found|not found|no longer available)\b/i.test(title)) return { ok: false };
    return { ok: true, title };
  } catch (e) {
    return /ENOTFOUND/.test(String(e?.cause?.code || '')) ? { ok: false } : { ok: null };
  }
}

const KINDS = { video: youtube, wiki, hn, so, github, books };

async function run(x) {
  if (x.kind === 'check') {
    const urls = (Array.isArray(x.urls) ? x.urls : []).filter(u => typeof u === 'string').slice(0, 24);
    const out = await Promise.all(urls.map(check));
    return Object.fromEntries(urls.map((u, i) => [u, out[i]]));
  }
  const fn = KINDS[x.kind];
  if (!fn) return [];
  return fn(String(x.q || '').slice(0, 300), Math.min(+x.n || 8, 15)).catch(() => []);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const queries = (Array.isArray(body.queries) ? body.queries : []).filter(x => x && typeof x === 'object').slice(0, 12);
    const out = await Promise.all(queries.map(run));
    res.setHeader('Cache-Control', 's-maxage=86400');
    return res.status(200).json({ results: Object.fromEntries(queries.map((x, i) => [String(x.key ?? i), out[i]])) });
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
}
