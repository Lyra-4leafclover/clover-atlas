// Vercel serverless function: the site's built-in AI.
// If you add a GEMINI_API_KEY environment variable in Vercel, it uses your Gemini key.
// Otherwise it uses the free, no-key Pollinations text API.
export default async function handler(req, res) {
  if (req.method === 'GET') return res.status(200).json({ ok: true, provider: process.env.GEMINI_API_KEY ? 'gemini' : 'free' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const prompt = String(body.prompt || '').slice(0, 30000);
    const system = String(body.system || '').slice(0, 2000);
    const maxTokens = Math.min(Math.max(parseInt(body.maxTokens) || 2000, 50), 8000);
    if (!prompt) return res.status(400).json({ error: 'Missing prompt' });
    const text = process.env.GEMINI_API_KEY
      ? await gemini(prompt, system, maxTokens, process.env.GEMINI_API_KEY, process.env.GEMINI_MODEL || 'gemini-2.5-flash')
      : await pollinations(prompt, system, maxTokens);
    return res.status(200).json({ text });
  } catch (e) {
    return res.status(e.status || 502).json({ error: e.message || 'AI error' });
  }
}

async function gemini(prompt, system, maxTokens, key, model) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: maxTokens * 2, thinkingConfig: { thinkingBudget: 0 } },
    }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(d.error?.message || 'Gemini error'); e.status = r.status === 429 ? 429 : 502; throw e; }
  return (d.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
}

async function pollinations(prompt, system, maxTokens) {
  let last;
  for (let attempt = 0; attempt < 3; attempt++) {
    try { const t = await pollinationsOnce(prompt, system, maxTokens); if (t) return t; last = new Error('The free AI returned an empty answer.'); }
    catch (e) { last = e; }
    await new Promise(r => setTimeout(r, 3000 * (attempt + 1)));
  }
  last.status = last.status || 502;
  throw last;
}

async function pollinationsOnce(prompt, system, maxTokens) {
  const r = await fetch('https://text.pollinations.ai/openai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'openai', reasoning_effort: 'low', max_tokens: maxTokens,
      messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }] }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error('The free AI is busy right now. Try again in a moment, or add your own free key in Settings.'); e.status = r.status === 429 ? 429 : 502; throw e; }
  return d.choices?.[0]?.message?.content || '';
}
