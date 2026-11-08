// Search links that always work (no AI needed).
const q = encodeURIComponent;
const g = (site, term) => `https://www.google.com/search?q=${q(`site:${site} ${term}`)}`;

export function shortTopic(map) {
  const t = (map.title || '').replace(/\b(road ?map|learning|path|plan|guide|for beginners|beginner'?s?|complete|ultimate|the)\b/gi, '').replace(/[:\-–—]+/g, ' ').replace(/\s+/g, ' ').trim();
  return t.split(' ').slice(0, 3).join(' ');
}

export async function wikiSummary(term) {
  try {
    const s = await fetch(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${q(term)}&srlimit=1&format=json&origin=*`).then(r => r.json());
    const title = s.query?.search?.[0]?.title;
    if (!title) return null;
    const p = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${q(title.replace(/ /g, '_'))}`).then(r => r.json());
    if (!p.extract || p.type === 'disambiguation') return null;
    return { title: p.title, text: p.extract, url: p.content_urls?.desktop?.page, thumb: p.thumbnail?.source };
  } catch { return null; }
}
