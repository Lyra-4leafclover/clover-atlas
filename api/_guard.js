// Shared protection for the site's serverless functions (files starting with _ are not public endpoints).

// Only accept requests sent by this site's own pages, not by other websites.
export function sameSite(req) {
  const host = String(req.headers.host || '').toLowerCase();
  const hostOf = (u) => { try { return new URL(u).host.toLowerCase(); } catch { return ''; } };
  const site = String(req.headers['sec-fetch-site'] || '');
  if (site && site !== 'same-origin') return false;
  const origin = req.headers.origin, referer = req.headers.referer;
  if (origin) return hostOf(origin) === host;
  if (referer) return hostOf(referer) === host;
  return false;
}

// Best-effort per-visitor limit (each server instance keeps its own counts).
const hits = new Map();
export function rateLimited(req, name, max, windowMs) {
  const ip = String(req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  const key = `${name}:${ip}`, now = Date.now();
  const list = (hits.get(key) || []).filter(t => now - t < windowMs);
  if (list.length >= max) { hits.set(key, list); return true; }
  list.push(now);
  hits.set(key, list);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some(t => now - t < windowMs)) hits.delete(k);
  return false;
}
