// Talks to the AI and turns its answers into roadmap data.
import { getSettings } from './store.js';

const SYSTEM = 'You are a world-class teacher and curriculum designer. You output only the exact line format requested: no markdown, no bullets, no commentary.';

// the free built-in AI rejects parallel requests, so those run one at a time; own keys run up to 4 at once
export const ownKey = () => { const s = getSettings(); return (s.provider === 'gemini' && !!s.geminiKey) || (s.provider === 'openai' && !!s.openaiKey); };
let queue = Promise.resolve();
const serial = (fn) => { const p = queue.then(fn, fn); queue = p.catch(() => {}); return p; };
let running = 0;
const waiting = [];
const limited = async (fn) => {
  if (running >= 4) await new Promise(r => waiting.push(r));
  running++;
  try { return await fn(); } finally { running--; waiting.shift()?.(); }
};

export function complete(prompt, { maxTokens = 4000, system = SYSTEM } = {}) {
  return (ownKey() ? limited : serial)(async () => {
    let lastErr;
    for (let attempt = 0; attempt < 3; attempt++) {
      try { return await callProvider(prompt, system, maxTokens); }
      catch (e) {
        lastErr = e;
        if (!e.retry) break;
        await new Promise(r => setTimeout(r, 4000 * (attempt + 1)));
      }
    }
    throw lastErr;
  });
}

function err(message, retry = false) { const e = new Error(message); e.retry = retry; return e; }

async function callProvider(prompt, system, maxTokens) {
  const s = getSettings();
  if (s.provider === 'gemini') return gemini(prompt, system, maxTokens, s);
  if (s.provider === 'openai') return openaiCompat(prompt, system, maxTokens, s);
  return siteServer(prompt, system, maxTokens);
}

async function siteServer(prompt, system, maxTokens) {
  let res;
  try {
    res = await fetch('api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, system, maxTokens }) });
  } catch { throw err('Could not reach the AI. Check your internet, or add your own free key in Settings.', true); }
  if (res.status === 404 || res.status === 405) throw err('This copy of the site has no built-in AI. Open Settings and paste a free Gemini key (takes 1 minute).');
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.text) throw err(data.error || `The free AI is busy right now (${res.status}). Try again in a moment, or add your own free key in Settings.`, res.status === 429 || res.status >= 500);
  return data.text;
}

export async function gemini(prompt, system, maxTokens, s) {
  if (!s.geminiKey) throw err('Add your Gemini key in Settings first.');
  const models = [s.geminiModel || 'gemini-2.5-flash', 'gemini-flash-latest'].filter((m, i, a) => a.indexOf(m) === i);
  let last;
  for (const model of models) {
    for (const thinking of [true, false]) {
      const body = {
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: Math.max(maxTokens, 2048) * 2 },
      };
      if (thinking) body.generationConfig.thinkingConfig = { thinkingBudget: 0 };
      let res;
      try {
        res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': s.geminiKey.trim() }, body: JSON.stringify(body),
        });
      } catch { throw err('Could not reach Google Gemini. Check your internet.', true); }
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const text = (data.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
        if (text) return text;
        last = err('Gemini returned an empty answer. Try again.', true); break;
      }
      const msg = data.error?.message || res.statusText;
      if (res.status === 400 && /thinking/i.test(msg) && thinking) continue;
      if (res.status === 404) { last = err(`Gemini model "${model}" was not found.`); break; }
      if (res.status === 400 && /api key/i.test(msg)) throw err('Gemini says the key is not valid. Copy it again from aistudio.google.com/apikey.');
      if (res.status === 403) throw err('Gemini refused the key (403). Make sure the key is copied fully and the Gemini API is enabled.');
      if (res.status === 429) throw err('Gemini free limit reached for a moment. Wait a minute and try again.', true);
      throw err(`Gemini error: ${msg}`, res.status >= 500);
    }
  }
  throw last;
}

export async function openaiCompat(prompt, system, maxTokens, s) {
  if (!s.openaiKey) throw err('Add your API key in Settings first.');
  const base = (s.openaiBase || 'https://api.openai.com/v1').replace(/\/+$/, '');
  let res;
  try {
    res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.openaiKey.trim()}` },
      body: JSON.stringify({ model: s.openaiModel || 'gpt-4o-mini', max_tokens: maxTokens, temperature: 0.7,
        messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }] }),
    });
  } catch { throw err('Could not reach that AI service. Check the address and your internet.', true); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw err(`AI error (${res.status}): ${data.error?.message || res.statusText}`, res.status === 429 || res.status >= 500);
  return data.choices?.[0]?.message?.content || '';
}

/* ---------- Roadmap ---------- */

const SIZES = { compact: 30, standard: 55, deep: 90 };
const LEVELS = { new: 'complete beginner', some: 'knows the basics', advanced: 'already experienced, wants depth' };

function roadmapPrompt({ input, level, size, goal }) {
  const n = SIZES[size] || 28;
  const long = input.length > 160 || input.includes('\n');
  const context = long
    ? `The learner gave this syllabus / study plan. Cover EVERYTHING in it, keep its topic names recognisable, and add any missing foundation concepts (mark those optional if not in the syllabus):\n"""\n${input.slice(0, 14000)}\n"""`
    : `Subject: ${input}`;
  return `Design a NON-LINEAR learning roadmap (a dependency graph with branches, not a single list).
${context}
Learner: ${LEVELS[level] || LEVELS.new}.${goal ? `\nGoal / deadline: ${goal}` : ''}
Target size: about ${n} concepts.
Rules:
- Group concepts into 3-7 tracks (themes).
- Give each concept only its DIRECT prerequisites (ids already listed above it). Several roots allowed. Many concepts should be studyable in parallel, and later concepts should merge branches.
- Each concept is one studyable idea, not a whole field. Order lines in a valid study order.
- Cover the whole journey, from the true fundamentals a newcomer needs first to the advanced, applied topics. Roots are those fundamentals.
- Concept titles are specific and self-explanatory (2-6 words, e.g. "Light-dependent reactions", not "Light" or "Merge").
- Mark nice-to-have concepts as optional.
Output EXACTLY these lines:
TITLE: <short roadmap title>
SUMMARY: <one friendly sentence>
DOMAIN: <one of: tech, math, science, language, humanities, business, arts, other>
TRACK: <track-id> | <track name>
NODE: <id> | <concept title> | <track-id> | <prereq ids comma separated, or none> | <difficulty 1-3> | <study hours> | <core or optional> | <one short sentence describing it>
All TRACK lines first, then all NODE lines. Ids are short kebab-case words.`;
}

const clean = (s) => String(s || '').replace(/\*\*|__|`/g, '').replace(/^[\s>*\-•\d.)]+(?=[A-Z]+:)/, '').trim();
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'x';

export function parseRoadmap(text, prev = null) {
  const map = prev || { title: '', summary: '', domain: 'other', tracks: [], nodes: [] };
  const ids = new Set(map.nodes.map(n => n.id));
  const trackIds = new Set(map.tracks.map(t => t.id));
  for (const raw of String(text).split(/\r?\n/)) {
    const line = clean(raw);
    const m = line.match(/^(TITLE|SUMMARY|DOMAIN|TRACK|NODE)\s*:\s*(.+)$/i);
    if (!m) continue;
    const key = m[1].toUpperCase(), val = m[2].trim();
    if (key === 'TITLE' && !map.title) map.title = val.replace(/["“”]/g, '');
    else if (key === 'SUMMARY' && !map.summary) map.summary = val;
    else if (key === 'DOMAIN') map.domain = (val.toLowerCase().match(/tech|math|science|language|humanities|business|arts/) || ['other'])[0];
    else if (key === 'TRACK') {
      const [id, name] = val.split('|').map(x => x.trim());
      if (!id) continue;
      const tid = slug(id);
      if (!trackIds.has(tid)) { trackIds.add(tid); map.tracks.push({ id: tid, name: name || id }); }
    } else if (key === 'NODE') {
      const f = val.split('|').map(x => x.trim());
      if (f.length < 2 || !f[1]) continue;
      let id = slug(f[0]);
      if (ids.has(id)) continue;
      ids.add(id);
      const prereqs = (f[3] || '').split(/[,;]/).map(x => x.trim()).filter(x => x && !/^(none|-+>?|n\/a|nil)$/i.test(x)).map(slug);
      map.nodes.push({
        id, title: f[1], track: slug(f[2] || ''), prereqs,
        level: Math.min(3, Math.max(1, parseInt(f[4]) || 1)),
        hours: Math.max(0.5, parseFloat(f[5]) || 2),
        optional: /opt/i.test(f[6] || ''),
        desc: f.slice(7).join(' | '),
      });
    }
  }
  return map;
}

export function tidyRoadmap(map) {
  const ids = new Set(map.nodes.map(n => n.id));
  if (!map.tracks.length) map.tracks.push({ id: 'main', name: 'Core' });
  const trackIds = new Set(map.tracks.map(t => t.id));
  for (const n of map.nodes) {
    if (!trackIds.has(n.track)) {
      const t = map.tracks.find(t => slug(t.name) === n.track) || map.tracks.find(t => n.track && t.id.startsWith(n.track));
      n.track = t ? t.id : map.tracks[0].id;
    }
    n.prereqs = [...new Set(n.prereqs)].filter(p => ids.has(p) && p !== n.id);
  }
  // break cycles
  const byId = Object.fromEntries(map.nodes.map(n => [n.id, n]));
  const state = {};
  const visit = (n) => {
    state[n.id] = 1;
    n.prereqs = n.prereqs.filter(p => {
      if (state[p] === 1) return false;
      if (!state[p]) visit(byId[p]);
      return true;
    });
    state[n.id] = 2;
  };
  map.nodes.forEach(n => { if (!state[n.id]) visit(n); });
  // transitive reduction: drop prereqs already implied by another prereq
  const anc = {};
  const ancestors = (id) => {
    if (anc[id]) return anc[id];
    const s = new Set();
    for (const p of byId[id].prereqs) { s.add(p); ancestors(p).forEach(a => s.add(a)); }
    return (anc[id] = s);
  };
  for (const n of map.nodes) {
    n.prereqs = n.prereqs.filter(p => !n.prereqs.some(q => q !== p && ancestors(q).has(p)));
  }
  map.tracks = map.tracks.filter(t => map.nodes.some(n => n.track === t.id));
  return map;
}

const NODE_FORMAT = 'NODE: <id> | <concept title> | <track-id> | <prereq ids comma separated, or none> | <difficulty 1-3> | <study hours> | <core or optional> | <one short sentence describing it>';

function contextBlock({ input, level, goal }) {
  const long = input.length > 160 || input.includes('\n');
  return (long
    ? `The learner gave this syllabus / study plan. EVERY topic in it must appear (keep its names recognisable), plus any foundations it assumes:\n"""\n${input.slice(0, 14000)}\n"""`
    : `Subject: ${input}`) + `\nLearner: ${LEVELS[level] || LEVELS.new}.${goal ? `\nGoal / deadline: ${goal}` : ''}`;
}

function outlinePrompt(opts, n) {
  return `Plan a COMPLETE curriculum, like the best university course + industry roadmap combined.
${contextBlock(opts)}
List the modules in learning order (6-9 modules), and for each module EVERY topic a thorough course on this subject covers. Start with the foundations a newcomer needs (even ones from neighbouring fields), end with advanced/applied topics and a capstone. Do not skip standard topics, tools, techniques or theory. About ${n} topics in total, 6-14 per module.
Output EXACTLY these lines:
TITLE: <short roadmap title>
SUMMARY: <one friendly sentence>
DOMAIN: <one of: tech, math, science, language, humanities, business, arts, other>
TRACK: <track-id> | <module name> | <topic>; <topic>; <topic>; ...
Ids are short kebab-case words.`;
}

function expandPrompt(opts, map, batch, k) {
  const outline = map.tracks.map(t => `TRACK: ${t.id} | ${t.name} | ${(t.topics || []).join('; ')}`).join('\n');
  const have = map.nodes.map(n => `${n.id} | ${n.title} | ${n.track}`).join('\n');
  return `We are building a NON-LINEAR learning roadmap (a dependency graph) titled "${map.title}".
${contextBlock(opts)}
Full module outline:
${outline}
${have ? `Concepts already in the roadmap (id | title | track):\n${have}\n` : ''}
Now write the concepts for module(s): ${batch.map(t => `${t.id} (${t.name})`).join(', ')}.
Rules:
- Turn EVERY topic listed for these modules into at least one concept; split big topics into 2-3 concepts. About ${k} concepts.
- Each concept is one studyable idea with a specific, self-explanatory title (2-6 words).
- Never repeat a concept that is already in the roadmap (even under another name, e.g. the same algorithm in two modules); use it as a prerequisite instead.
- Give only DIRECT prerequisites, using ids from the list above or ids defined earlier in your answer. Link across modules where it makes sense, and let concepts branch and merge. The first concepts of the first module may have none.
- Mark nice-to-have concepts optional.
Output only NODE lines, in study order:
${NODE_FORMAT}`;
}

function gapPrompt(opts, map, k) {
  return `Here is a learning roadmap titled "${map.title}".
${contextBlock(opts)}
Modules: ${map.tracks.map(t => `${t.id} (${t.name})`).join(', ')}
Concepts (id | title):
${map.nodes.map(n => `${n.id} | ${n.title}`).join('\n')}
Check it against a complete course${opts.input.length > 160 ? ' and the syllabus' : ''}. Which important concepts are still MISSING? Add up to ${k} (only real gaps, no duplicates or renames). Prerequisites must be ids from the list.
Output only NODE lines (or the single word NONE):
${NODE_FORMAT}`;
}

function parseOutline(text) {
  const map = { title: '', summary: '', domain: 'other', tracks: [], nodes: [] };
  for (const raw of String(text).split(/\r?\n/)) {
    const m = clean(raw).match(/^(TITLE|SUMMARY|DOMAIN|TRACK)\s*:\s*(.+)$/i);
    if (!m) continue;
    const key = m[1].toUpperCase(), val = m[2].trim();
    if (key === 'TITLE' && !map.title) map.title = val.replace(/["“”]/g, '');
    else if (key === 'SUMMARY' && !map.summary) map.summary = val;
    else if (key === 'DOMAIN') map.domain = (val.toLowerCase().match(/tech|math|science|language|humanities|business|arts/) || ['other'])[0];
    else {
      const [id, name, topics] = val.split('|').map(x => x.trim());
      const tid = slug(id || name || '');
      if (!tid || map.tracks.some(t => t.id === tid)) continue;
      map.tracks.push({ id: tid, name: (name || id).replace(/^(module|unit|part|phase|stage)\s*\d+\s*[:.\-–—]\s*/i, ''), topics: (topics || '').split(/[;,]/).map(x => x.trim()).filter(Boolean) });
    }
  }
  return map;
}

export async function generateRoadmap(opts, onStep = () => {}) {
  const target = SIZES[opts.size] || 55;
  onStep('Planning the full curriculum…');
  let map = parseOutline(await complete(outlinePrompt(opts, target), { maxTokens: 5000 }));
  if (map.tracks.length < 2) return singlePass(opts, onStep, target);
  // expand modules in batches so nothing is skipped
  const totalTopics = map.tracks.reduce((a, t) => a + Math.max(1, t.topics.length), 0);
  const batches = [];
  let cur = [], size = 0;
  for (const t of map.tracks) {
    const share = Math.max(3, Math.round(target * Math.max(1, t.topics.length) / totalTopics));
    if (cur.length && size + share > (ownKey() ? 14 : 26)) { batches.push({ tracks: cur, k: size }); cur = []; size = 0; }
    cur.push(t); size += share;
  }
  if (cur.length) batches.push({ tracks: cur, k: size });
  if (ownKey() && batches.length > 1) {
    // foundations first so the other modules can link to them, then the rest in parallel
    onStep(`Mapping concepts: ${batches[0].tracks.map(t => t.name).join(', ')}…`);
    try { map = parseRoadmap(await complete(expandPrompt(opts, map, batches[0].tracks, batches[0].k), { maxTokens: 6000 }), map); } catch { /* the rest can still work */ }
    onStep(`Mapping the other ${batches.length - 1} parts at once…`);
    const base = map;
    const out = await Promise.allSettled(batches.slice(1).map(b => complete(expandPrompt(opts, base, b.tracks, b.k), { maxTokens: 6000 })));
    const text = out.filter(r => r.status === 'fulfilled').map(r => r.value).join('\n');
    if (text) map = parseRoadmap(text, map);
    else if (!map.nodes.length) throw out.find(r => r.status === 'rejected')?.reason || new Error('The AI returned nothing. Try again.');
  } else {
    for (let i = 0; i < batches.length; i++) {
      onStep(`Mapping concepts: ${batches[i].tracks.map(t => t.name).join(', ')} (${i + 1} of ${batches.length})…`);
      try { map = parseRoadmap(await complete(expandPrompt(opts, map, batches[i].tracks, batches[i].k), { maxTokens: 6000 }), map); }
      catch (e) { if (!map.nodes.length && i === batches.length - 1) throw e; }
    }
  }
  if (map.nodes.length < 3) return singlePass(opts, onStep, target);
  const thin = map.tracks.filter(t => map.nodes.filter(n => n.track === t.id).length < Math.max(3, Math.round(target * Math.max(1, t.topics.length) / totalTopics * 0.6)));
  if (thin.length) {
    onStep(`Filling in ${thin.map(t => t.name).join(', ')}…`);
    try { map = parseRoadmap(await complete(expandPrompt(opts, map, thin, thin.reduce((a, t) => a + Math.max(3, t.topics.length), 0)), { maxTokens: 6000 }), map); } catch { /* keep going */ }
  }
  for (let pass = 0; pass < 2; pass++) {
    const want = Math.max(6, Math.min(25, target - map.nodes.length, Math.round(target * 0.25)));
    if (pass && map.nodes.length >= target * 0.85) break;
    onStep(pass ? 'Filling in the remaining gaps…' : 'Checking for anything missing…');
    const before = map.nodes.length;
    try { map = parseRoadmap(await complete(gapPrompt(opts, map, Math.max(want, target - map.nodes.length > 6 ? target - map.nodes.length : want)), { maxTokens: 6000 }), map); } catch { /* optional */ }
    if (map.nodes.length === before) break;
  }
  onStep('Drawing your map…');
  map.tracks.forEach(t => delete t.topics);
  map = tidyRoadmap(map);
  if (!map.title) map.title = opts.input.split('\n')[0].slice(0, 60);
  return map;
}

async function singlePass(opts, onStep, target) {
  onStep('Sketching the roadmap…');
  let map = parseRoadmap(await complete(roadmapPrompt(opts), { maxTokens: 6000 }));
  if (map.nodes.length && map.nodes.length < target * 0.7) {
    onStep('Adding more branches…');
    try {
      map = parseRoadmap(await complete(`${roadmapPrompt(opts)}

You already wrote these lines:
${map.tracks.map(t => `TRACK: ${t.id} | ${t.name}`).join('\n')}
${map.nodes.map(n => `NODE: ${n.id} | ${n.title} | ${n.track} | ${n.prereqs.join(',') || 'none'}`).join('\n')}

Continue with about ${target - map.nodes.length} MORE NODE lines (new ids only, prerequisites may use the ids above). Output only NODE lines.`, { maxTokens: 6000 }), map);
    } catch { /* keep what we have */ }
  }
  if (map.nodes.length < 3) throw new Error('The AI answer could not be turned into a roadmap. Please try again (or rephrase your topic).');
  onStep('Drawing your map…');
  map = tidyRoadmap(map);
  if (!map.title) map.title = opts.input.split('\n')[0].slice(0, 60);
  return map;
}

/* ---------- Study pack for one concept ---------- */

function packPrompt(map, node, level) {
  const track = map.tracks.find(t => t.id === node.track)?.name || '';
  const pre = node.prereqs.map(p => map.nodes.find(n => n.id === p)?.title).filter(Boolean).join(', ') || 'none';
  return `Create a study pack for the concept "${node.title}" (part of the roadmap "${map.title}", track "${track}").
Concept summary: ${node.desc || '-'}
Already learned before this: ${pre}.
Learner: ${LEVELS[level] || LEVELS.new}.
Output EXACTLY these lines (each item on ONE line):
EXPLAIN: <clear plain-language explanation, 4-6 sentences>
ANALOGY: <a memorable everyday analogy>
WHY: <why this matters / where it is used>
SUBTOPIC: <name> | <one-line explanation>   (5-8 lines)
STEP: <one study step>   (4-6 lines, a mini study plan)
QUESTION: <practice question> || <short answer>   (5 lines, mix easy and hard)
CARD: <flashcard front> || <back>   (6-8 lines)
MISTAKE: <common mistake or misconception>   (2-3 lines)
PROJECT: <one small hands-on exercise or mini project>`;
}

const BRANDS = ['udemy', 'coursera', 'youtube', 'edx', 'khanacademy', 'freecodecamp', 'pluralsight', 'linkedin', 'codecademy', 'mdn', 'w3schools', 'geeksforgeeks', 'oreilly', 'amazon', 'github', 'wikipedia', 'medium', 'kaggle', 'leetcode', 'hackerrank', 'datacamp', 'udacity', 'skillshare', 'brilliant', 'mit', 'stanford', 'harvard'];
// AI sometimes pairs a famous platform name with an unrelated URL; drop those so we fall back to a search link
function brandMatches(url, label) {
  let host = '';
  try { host = new URL(url).hostname.toLowerCase(); } catch { return false; }
  const text = label.toLowerCase().replace(/[^a-z]/g, '');
  const named = BRANDS.filter(b => text.includes(b));
  if (!named.length) return true;
  return named.some(b => host.includes(b === 'mdn' ? 'mozilla' : b === 'youtube' ? 'youtu' : b));
}

export function parsePack(text) {
  const pack = { explain: '', analogy: '', why: '', project: '', subtopics: [], resources: [], steps: [], questions: [], cards: [], mistakes: [] };
  for (const raw of String(text).split(/\r?\n/)) {
    const line = clean(raw);
    const m = line.match(/^(EXPLAIN|ANALOGY|WHY|SUBTOPIC|RESOURCE|STEP|QUESTION|CARD|MISTAKE|PROJECT)\s*:\s*(.+)$/i);
    if (!m) continue;
    const key = m[1].toUpperCase(), val = m[2].trim();
    const pair = () => { const [a, ...b] = val.split('||'); return [a.trim(), b.join('||').trim()]; };
    if (key === 'EXPLAIN') pack.explain += (pack.explain ? ' ' : '') + val;
    else if (key === 'ANALOGY') pack.analogy = val;
    else if (key === 'WHY') pack.why = val;
    else if (key === 'PROJECT') pack.project = val;
    else if (key === 'STEP') pack.steps.push(val);
    else if (key === 'MISTAKE') pack.mistakes.push(val);
    else if (key === 'SUBTOPIC') { const [name, ...d] = val.split('|'); pack.subtopics.push({ name: name.trim(), desc: d.join('|').trim() }); }
    else if (key === 'QUESTION') { const [q, a] = pair(); if (q) pack.questions.push({ q, a }); }
    else if (key === 'CARD') { const [f, b] = pair(); if (f) pack.cards.push({ front: f, back: b }); }
    else if (key === 'RESOURCE') {
      const f = val.split('|').map(x => x.trim());
      if (f.length < 2 || !f[1]) continue;
      let url = (f[2] || '').replace(/[<>]/g, '');
      if (!/^https?:\/\/[^\s]+\.[^\s]+/.test(url) || /\.\.\.|example\.com/.test(url)) url = '';
      const isCost = (x) => /^(free|paid|freemium|free\s*\/\s*paid)$/i.test(x);
      const costs = f.slice(3).filter(isCost);
      const rest = f.slice(3).filter(x => !isCost(x));
      const cost = costs.length && costs.every(x => /paid/i.test(x) && !/free/i.test(x)) ? 'paid' : 'free';
      const noBy = isCost(f[3] || '');
      const by = noBy || /^-?$/.test(rest[0] || '') ? '' : rest[0];
      if (url && !brandMatches(url, f[1] + ' ' + by)) url = '';
      pack.resources.push({ type: (f[0] || 'article').toLowerCase().replace(/[^a-z]/g, '') || 'article', title: f[1], url, by, cost, why: rest.slice(noBy ? 0 : 1).join(' | ') });
    }
  }
  if (!pack.explain && !pack.resources.length) throw new Error('The AI answer was empty. Try again.');
  return pack;
}

export async function generatePack(map, node) {
  const text = await complete(packPrompt(map, node, map.source?.level), { maxTokens: 3500 });
  return parsePack(text);
}


export async function askAbout(map, node, question) {
  return complete(`I'm studying "${node.title}" (from my roadmap "${map.title}"). ${node.desc || ''}
My question: ${question}
Answer clearly and kindly in plain language, under 180 words. Use short paragraphs; no markdown headings.`, { maxTokens: 1200, system: 'You are a patient, encouraging tutor.' });
}

export async function testConnection() {
  const t = await complete('Reply with exactly: OK', { maxTokens: 50, system: 'Reply briefly.' });
  return t.trim();
}
