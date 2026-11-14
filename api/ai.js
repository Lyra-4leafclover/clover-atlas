// Vercel serverless function: the site's built-in AI.
// If you add a GEMINI_API_KEY environment variable in Vercel, it uses your Gemini key.
// Otherwise it uses the free, no-key Pollinations text API.
// It only does Clover Atlas jobs: the system prompt and size limits are fixed here per task, and roadmap,
// study-pack and resource answers are cut down to the site's line format, so it can't be used as a general AI.
import { sameSite, rateLimited } from './_guard.js';

const TEACHER = 'You are a world-class teacher and curriculum designer. You output only the exact line format requested: no markdown, no bullets, no commentary. You only write learning roadmaps, study packs and study resources; if asked for anything else (emails, letters, essays, stories, code for other purposes), output only: NONE';
const TUTOR = 'You are a patient, encouraging tutor. Only answer questions that help the learner understand this concept or its roadmap. If asked for anything else (emails, essays, homework unrelated to it, other tasks), reply only: I can only help with questions about this concept.';
const cut = (v, n) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, n);
// same wording as tutorPrompt in js/ai.js, but built here so callers can only send a short question
const tutorPrompt = (f) => {
  if (!f || !cut(f.question, 400) || !cut(f.concept, 120)) return '';
  return `I'm studying "${cut(f.concept, 120)}" (from my roadmap "${cut(f.roadmap, 120)}"). ${cut(f.desc, 400)}
My question: ${cut(f.question, 400)}
Answer clearly and kindly in plain language, under 180 words. Use short paragraphs; no markdown headings.`;
};
const TASKS = {
  roadmap: { system: TEACHER, prompt: 30000, tokens: 6000, lines: /^(TITLE|SUMMARY|DOMAIN|TRACK|NODE)\s*:/i, none: true },
  pack: { system: TEACHER, prompt: 6000, tokens: 3500, lines: /^(EXPLAIN|ANALOGY|WHY|SUBTOPIC|RESOURCE|STEP|QUESTION|CARD|MISTAKE|PROJECT)\s*:/i },
  resources: { system: TEACHER, prompt: 4000, tokens: 3000, lines: /^(FREE|PAID)\s*:/i },
  ask: { system: TUTOR, build: tutorPrompt, tokens: 500 },
  test: { system: 'Reply briefly.', fixed: 'Reply with exactly: OK', tokens: 20 },
};

// keep only the lines the site can use, so free-form answers (emails, essays...) come back empty
function onlyFormatLines(text, task) {
  const out = [];
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.replace(/\*\*|__|`/g, '').replace(/^[\s>*\-\u2022\d.)]+(?=[A-Z]+\s*:)/, '').trim();
    if (task.lines.test(line)) out.push(line.slice(0, 1500));
    else if (task.none && /^NONE\.?$/i.test(line)) out.push('NONE');
  }
  return out.join('\n');
}

export default async function handler(req, res) {
  if (req.method === 'GET') return res.status(200).json({ ok: true, provider: process.env.GEMINI_API_KEY ? 'gemini' : 'free' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!sameSite(req)) return res.status(403).json({ error: 'The built-in AI only works on the Clover Atlas site itself.' });
  if (rateLimited(req, 'ai', 40, 10 * 60 * 1000) || rateLimited(req, 'ai-day', 250, 24 * 3600 * 1000)) {
    return res.status(429).json({ error: 'You have used the free AI a lot just now. Wait a few minutes, or add your own free key in Settings.' });
  }
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const task = TASKS[body.task];
    if (!task) return res.status(400).json({ error: 'Unknown task' });
    const prompt = task.fixed || (task.build ? task.build(body.fields) : String(body.prompt || '').slice(0, task.prompt));
    if (!prompt) return res.status(400).json({ error: 'Missing prompt' });
    const maxTokens = Math.min(Math.max(parseInt(body.maxTokens) || task.tokens, 20), task.tokens);
    let text = process.env.GEMINI_API_KEY
      ? await gemini(prompt, task.system, maxTokens, process.env.GEMINI_API_KEY, process.env.GEMINI_MODEL || 'gemini-2.5-flash')
      : await pollinations(prompt, task.system, maxTokens);
    if (task.lines) text = onlyFormatLines(text, task);
    if (!text) text = 'NONE';
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
