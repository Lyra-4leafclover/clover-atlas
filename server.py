#!/usr/bin/env python3
"""Run Clover Atlas on your own computer: python3 server.py  then open http://localhost:8000
Serves the site, the built-in AI at /api/ai and the resource finder at /api/find (same as the Vercel functions).
Set GEMINI_API_KEY to use your Gemini key; otherwise the free Pollinations API is used."""
import gzip, html, json, os, re, time, urllib.request, urllib.error, urllib.parse
from concurrent.futures import ThreadPoolExecutor
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

ROOT = os.path.dirname(os.path.abspath(__file__))
KEY = os.environ.get('GEMINI_API_KEY', '')
MODEL = os.environ.get('GEMINI_MODEL', 'gemini-2.5-flash')


def post(url, payload, headers):
    req = urllib.request.Request(url, data=json.dumps(payload).encode(), headers={'Content-Type': 'application/json', **headers})
    with urllib.request.urlopen(req, timeout=240) as r:
        return json.load(r)


def ask(prompt, system, max_tokens):
    if KEY:
        d = post(f'https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent', {
            'systemInstruction': {'parts': [{'text': system}]},
            'contents': [{'role': 'user', 'parts': [{'text': prompt}]}],
            'generationConfig': {'temperature': 0.7, 'maxOutputTokens': max_tokens * 2, 'thinkingConfig': {'thinkingBudget': 0}},
        }, {'x-goog-api-key': KEY})
        return ''.join(p.get('text', '') for p in d['candidates'][0]['content']['parts'])
    last = None
    for attempt in range(3):
        try:
            d = post('https://text.pollinations.ai/openai', {
                'model': 'openai', 'reasoning_effort': 'low', 'max_tokens': max_tokens,
                'messages': [{'role': 'system', 'content': system}, {'role': 'user', 'content': prompt}],
            }, {})
            text = (d.get('choices') or [{}])[0].get('message', {}).get('content') or ''
            if text:
                return text
            last = RuntimeError('empty answer: ' + json.dumps(d)[:200])
        except Exception as e:
            last = e
        print('free AI attempt', attempt + 1, 'failed:', str(last)[:300], flush=True)
        time.sleep(4 * (attempt + 1))
    raise last


UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36'
CACHE = {}


def fetch_text(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9'})
    with urllib.request.urlopen(req, timeout=10) as r:
        return r.read().decode('utf-8', 'replace')


def strip(x):
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', '', x or ''))).strip()


def youtube(q, n):
    """Real videos from a YouTube search (no API key needed)."""
    h = fetch_text('https://www.youtube.com/results?sp=EgIQAQ%253D%253D&search_query=' + urllib.parse.quote_plus(q))
    m = re.search(r'var ytInitialData = (\{.*?\});</script>', h, re.S)
    out, seen = [], set()

    def walk(o):
        if isinstance(o, dict):
            v = o.get('videoRenderer')
            if v and v.get('videoId') and v.get('lengthText') and v['videoId'] not in seen:
                seen.add(v['videoId'])
                out.append({
                    'url': 'https://www.youtube.com/watch?v=' + v['videoId'],
                    'title': ''.join(r.get('text', '') for r in v.get('title', {}).get('runs', [])),
                    'by': ((v.get('ownerText') or {}).get('runs') or [{}])[0].get('text', ''),
                    'len': v['lengthText'].get('simpleText', ''),
                    'views': (v.get('shortViewCountText') or {}).get('simpleText', ''),
                    'thumb': f"https://i.ytimg.com/vi/{v['videoId']}/mqdefault.jpg",
                })
            for x in o.values():
                walk(x)
        elif isinstance(o, list):
            for x in o:
                walk(x)
    if m:
        walk(json.loads(m.group(1)))
    return out[:n]


def fetch_json(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/json', 'Accept-Encoding': 'gzip'})
    with urllib.request.urlopen(req, timeout=10) as r:
        data = r.read()
        if r.headers.get('Content-Encoding') == 'gzip':
            data = gzip.decompress(data)
        return json.loads(data)


def relevant(q, text):
    words = [w for w in re.findall(r'[a-z0-9+#]+', q.lower()) if len(w) > 2]
    t = text.lower()
    hit = sum(w.rstrip('s') in t for w in words)
    return not words or (hit == len(words) if len(words) <= 3 else hit * 3 >= len(words) * 2)


def wiki(q, n):
    d = fetch_json('https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=%d&srsearch=%s' % (n, urllib.parse.quote(q)))
    return [{'url': 'https://en.wikipedia.org/wiki/' + urllib.parse.quote(x['title'].replace(' ', '_')), 'title': x['title'] + ' (Wikipedia)',
             'snippet': strip(x.get('snippet', ''))[:200], 'host': 'en.wikipedia.org'} for x in d.get('query', {}).get('search', [])]


def hn(q, n):
    d = fetch_json('https://hn.algolia.com/api/v1/search?tags=story&hitsPerPage=30&query=' + urllib.parse.quote(q))
    hits = sorted([h for h in d.get('hits', []) if h.get('url') and (h.get('points') or 0) >= 15 and relevant(q, h.get('title', ''))
                   and not re.search(r'(twitter|x)\.com/', h['url'])], key=lambda h: -(h.get('points') or 0))
    return [{'url': h['url'], 'title': h['title'], 'snippet': f"{h['points']} upvotes on Hacker News", 'host': urllib.parse.urlparse(h['url']).netloc.replace('www.', '')} for h in hits[:n]]


def stackoverflow(q, n):
    d = fetch_json('https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=votes&site=stackoverflow&accepted=True&pagesize=%d&title=%s' % (n, urllib.parse.quote(q)))
    if not d.get('items'):
        d = fetch_json('https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=votes&site=stackoverflow&accepted=True&pagesize=30&q=%s' % urllib.parse.quote(q))
        d['items'] = [x for x in d.get('items', []) if relevant(q, strip(x['title']))][:n]
    return [{'url': x['link'], 'title': strip(x['title']), 'snippet': f"{x['score']} votes · {x['answer_count']} answers", 'host': 'stackoverflow.com'} for x in d.get('items', [])]


def github(q, n):
    d = fetch_json('https://api.github.com/search/repositories?sort=stars&per_page=30&q=%s' % urllib.parse.quote(q + ' in:name,description,topics'))
    items = [x for x in d.get('items', []) if relevant(q, x['full_name'].replace('-', ' ') + ' ' + (x.get('description') or ''))][:n]
    return [{'url': x['html_url'], 'title': x['full_name'], 'snippet': f"★ {x['stargazers_count']:,} · " + (x.get('description') or '')[:160], 'host': 'github.com'} for x in items]


def isbn10(i):
    i = i.replace('-', '')
    if len(i) == 10:
        return i
    if len(i) == 13 and i.startswith('978'):
        core = i[3:12]
        c = (11 - sum((10 - k) * int(x) for k, x in enumerate(core)) % 11) % 11
        return core + ('X' if c == 10 else str(c))
    return ''


def books(q, n):
    d = fetch_json('https://openlibrary.org/search.json?limit=%d&fields=key,title,author_name,first_publish_year,ebook_access,isbn&q=%s' % (n * 2, urllib.parse.quote(q)))
    out = []
    for x in d.get('docs', []):
        by = ', '.join((x.get('author_name') or [])[:2])
        meta = ' · '.join(str(v) for v in [by, x.get('first_publish_year')] if v)
        if x.get('ebook_access') in ('public', 'borrowable'):
            out.append({'url': 'https://openlibrary.org' + x['key'], 'title': x['title'], 'snippet': meta + ' · free to read or borrow on Open Library', 'host': 'openlibrary.org', 'cost': 'free'})
        isbn = next((isbn10(i) for i in x.get('isbn') or [] if isbn10(i)), '')
        if isbn:
            out.append({'url': 'https://www.amazon.com/dp/' + isbn, 'title': x['title'], 'snippet': meta, 'host': 'amazon.com', 'cost': 'paid'})
    return out[:n * 2]


def check(url):
    """{ok: True/False/None, title}: None means the site blocks checkers."""
    try:
        u = urllib.parse.urlparse(url)
        if u.scheme not in ('http', 'https') or not u.netloc:
            return {'ok': False}
        req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'text/html,*/*', 'Accept-Language': 'en-US'})
        with urllib.request.urlopen(req, timeout=8) as r:
            page = r.read(300000).decode('utf-8', 'replace')
        m = re.search(r'<title[^>]*>(.*?)</title>', page, re.S | re.I)
        title = strip(m.group(1))[:160] if m else ''
        if re.search(r'\b(404|page not found|not found|no longer available)\b', title, re.I):
            return {'ok': False}
        return {'ok': True, 'title': title}
    except urllib.error.HTTPError as e:
        return {'ok': False} if e.code in (404, 410) else {'ok': None}
    except urllib.error.URLError as e:
        return {'ok': False} if 'Name or service not known' in str(e.reason) or 'No address' in str(e.reason) else {'ok': None}
    except Exception:
        return {'ok': None}


KINDS = {'video': youtube, 'wiki': wiki, 'hn': hn, 'so': stackoverflow, 'github': github, 'books': books}


def run_query(x):
    kind = x.get('kind')
    if kind == 'check':
        urls = [u for u in (x.get('urls') or []) if isinstance(u, str)][:24]
        with ThreadPoolExecutor(12) as ex:
            return dict(zip(urls, ex.map(check, urls)))
    q, n = str(x.get('q', ''))[:300], min(int(x.get('n') or 8), 15)
    key = (kind, q, n)
    if kind not in KINDS:
        return []
    if key not in CACHE:
        try:
            CACHE[key] = KINDS[kind](q, n)
        except Exception as e:
            print('find failed:', kind, q, e, flush=True)
            return []
    return CACHE[key]


def find(queries):
    queries = [x for x in queries if isinstance(x, dict)][:12]
    with ThreadPoolExecutor(12) as ex:
        res = list(ex.map(run_query, queries))
    return {str(x.get('key', i)): r for i, (x, r) in enumerate(zip(queries, res))}


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def send_json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.startswith('/api/ai'):
            return self.send_json(200, {'ok': True, 'provider': 'gemini' if KEY else 'free'})
        return super().do_GET()

    def do_POST(self):
        if self.path.startswith('/api/find'):
            try:
                body = json.loads(self.rfile.read(int(self.headers.get('Content-Length', 0)) or 0) or b'{}')
                return self.send_json(200, {'results': find(body.get('queries') or [])})
            except Exception as e:
                return self.send_json(400, {'error': str(e)})
        if not self.path.startswith('/api/ai'):
            return self.send_json(404, {'error': 'Not found'})
        try:
            body = json.loads(self.rfile.read(int(self.headers.get('Content-Length', 0)) or 0) or b'{}')
            prompt = str(body.get('prompt', ''))[:30000]
            if not prompt:
                return self.send_json(400, {'error': 'Missing prompt'})
            max_tokens = min(max(int(body.get('maxTokens') or 2000), 50), 8000)
            self.send_json(200, {'text': ask(prompt, str(body.get('system', ''))[:2000], max_tokens)})
        except urllib.error.HTTPError as e:
            self.send_json(429 if e.code == 429 else 502, {'error': 'The free AI is busy right now. Try again in a moment, or add your own free key in Settings.'})
        except Exception as e:
            print('AI error:', e, flush=True)
            self.send_json(502, {'error': 'The free AI is busy right now. Try again in a moment, or add your own free key in Settings.'})


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8000))
    print(f'Clover Atlas running at http://localhost:{port}')
    ThreadingHTTPServer(('0.0.0.0', port), Handler).serve_forever()
