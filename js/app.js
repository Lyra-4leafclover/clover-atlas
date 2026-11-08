import * as store from './store.js';
import { generateRoadmap, generatePack, askAbout, testConnection } from './ai.js';
import { findResources, aiPicks, count } from './resources.js';
import { createGraph, layout } from './graph.js';
import { wikiSummary } from './links.js';
import { EXAMPLE } from './example.js';

const $ = (s, el = document) => el.querySelector(s);
const app = $('#app'), drawer = $('#drawer'), scrim = $('#scrim'), modal = $('#modal');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ICON = {
  check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.2 4.2L19 7"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  clip: '<svg viewBox="0 0 24 24"><path d="M21 11.5l-8.6 8.6a5.5 5.5 0 0 1-7.8-7.8l8.6-8.6a3.7 3.7 0 0 1 5.2 5.2l-8.6 8.6a1.8 1.8 0 0 1-2.6-2.6l7.9-7.9"/></svg>',
  ext: '<svg viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
  map: '<svg viewBox="0 0 24 24"><path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14"/></svg>',
  list: '<svg viewBox="0 0 24 24"><path d="M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01"/></svg>',
  share: '<svg viewBox="0 0 24 24"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
  down: '<svg viewBox="0 0 24 24"><path d="M12 4v12M6 10l6 6 6-6M5 20h14"/></svg>',
  up: '<svg viewBox="0 0 24 24"><path d="M12 20V8M6 14l6-6 6 6M5 4h14"/></svg>',
  spark: '<svg viewBox="0 0 24 24"><path d="M12 3l1.8 5.4L19 10l-5.2 1.6L12 17l-1.8-5.4L5 10l5.2-1.6z"/></svg>',
  branch: '<svg viewBox="0 0 24 24"><circle cx="6" cy="5" r="2.5"/><circle cx="6" cy="19" r="2.5"/><circle cx="18" cy="9" r="2.5"/><path d="M6 7.5v9M18 11.5c0 4-6 3-11 6"/></svg>',
};

function toast(msg, ms = 2600) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), ms);
}

/* ---------- first visit ---------- */
if (!localStorage.getItem('clover-atlas.seeded')) {
  localStorage.setItem('clover-atlas.seeded', '1');
  if (!store.listMaps().length) store.newMap(structuredClone(EXAMPLE), EXAMPLE.source);
}

/* ---------- router ---------- */
let current = null; // { map, graph, view }
function route() {
  const h = location.hash.replace(/^#\/?/, '');
  const [page, a, b] = h.split('/');
  if (page === 'map' && store.getMap(a)) {
    if (current?.map.id === a) { b ? openNode(decodeURIComponent(b), false) : closeDrawer(false); return; }
    renderMap(store.getMap(a), b && decodeURIComponent(b));
  } else if (page === 'share' && a) {
    openShared(a);
  } else {
    renderHome();
  }
}
window.addEventListener('hashchange', route);

/* ---------- home ---------- */
const EXAMPLES = ['DevOps', 'Machine Learning', 'Organic Chemistry', 'Japanese (JLPT N5)', 'Calculus', 'UI/UX Design', 'Personal finance', 'Cybersecurity', 'Music theory', 'World History'];

function providerLabel() {
  const s = store.getSettings();
  if (s.provider === 'gemini') return s.geminiKey ? 'Google Gemini (your key)' : 'Google Gemini: key missing';
  if (s.provider === 'openai') return s.openaiKey ? `${s.openaiModel} (your key)` : 'Custom AI: key missing';
  return 'Built-in free AI';
}

function renderHome() {
  current = null; closeDrawer(false);
  document.body.dataset.page = 'home';
  const maps = store.listMaps();
  app.innerHTML = `
  <section class="hero">
    <div class="hero-art" aria-hidden="true"><img src="art/hero.webp" alt=""></div>
    <div class="hero-copy">
      <p class="eyebrow">Your study map maker</p>
      <h1>Turn anything into a <em>roadmap</em>.</h1>
      <p class="lede">Type a topic or paste your syllabus. You get a branching map of every concept with its prerequisites. Tick concepts off as you go, and open any of them for a full study pack.</p>
    </div>
    <form class="maker card" id="maker">
      <label class="sr" for="input">What do you want to learn?</label>
      <textarea id="input" rows="3" placeholder="e.g. DevOps … or paste your syllabus / study plan here" required></textarea>
      <div class="maker-row">
        <label class="pill ghost small filebtn">${ICON.clip}<span>Upload file</span><input type="file" id="file" accept=".txt,.md,.pdf,.csv,.json,.html,.htm,.rtf"></label>
        <label class="field"><span>Level</span><select id="level"><option value="new">New to it</option><option value="some">Know the basics</option><option value="advanced">Advanced</option></select></label>
        <label class="field"><span>Size</span><select id="size"><option value="compact">Compact (~30)</option><option value="standard" selected>Full (~55)</option><option value="deep">Deep (~90)</option></select></label>
        <label class="field grow"><span>Goal or deadline <i>(optional)</i></span><input id="goal" placeholder="e.g. exam on 20 Dec, get a junior job"></label>
        <button class="pill primary" type="submit">${ICON.spark}<span>Build my roadmap</span></button>
      </div>
      <div class="chips"><span>Try:</span>${EXAMPLES.map(e => `<button type="button" class="chip" data-ex="${esc(e)}">${esc(e)}</button>`).join('')}</div>
      <p class="ai-note">AI: <b>${esc(providerLabel())}</b> · <button type="button" class="linkish" data-act="settings">change</button></p>
    </form>
  </section>

  <section class="section" id="maps">
    <div class="section-head">
      <h2>Your roadmaps</h2>
      <div class="row-btns">
        <label class="pill ghost small">${ICON.up}<span>Import</span><input type="file" id="importFile" accept=".json" hidden></label>
        <button class="pill ghost small" data-act="exportAll">${ICON.down}<span>Backup</span></button>
      </div>
    </div>
    ${maps.length ? `<div class="mapgrid">${maps.map(mapCard).join('')}</div>` : `<div class="empty card"><img src="art/journal.webp" alt=""><p>No roadmaps yet. Type a topic above to make your first one.</p></div>`}
  </section>

  <section class="section how">
    <div class="how-art"><img src="art/journal.webp" alt="" loading="lazy"></div>
    <div class="how-steps">
      <h2>How it works</h2>
      <ol>
        <li><b>Give it anything.</b> A single word, a course name, or your whole syllabus or study plan (paste it or upload a .txt, .md or .pdf).</li>
        <li><b>Get a map, not a list.</b> Concepts branch and merge. Arrows show what you need first, and anything not ready yet stays faded until its prerequisites are done.</li>
        <li><b>Study each stop.</b> Click a concept for an explanation, free and paid resources (real videos, articles, courses and books), practice questions, flashcards and your own notes. Tick it off and the next concepts light up.</li>
      </ol>
    </div>
  </section>
  ${footer()}`;

  const input = $('#input');
  app.querySelectorAll('[data-ex]').forEach(b => b.onclick = () => { input.value = b.dataset.ex; input.focus(); });
  $('#maker').onsubmit = (e) => { e.preventDefault(); build({ input: input.value.trim(), level: $('#level').value, size: $('#size').value, goal: $('#goal').value.trim() }); };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !input.value.includes('\n')) { e.preventDefault(); $('#maker').requestSubmit(); } });
  $('#file').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { input.value = (await readFile(f)).trim(); toast(`Loaded ${f.name}`); }
    catch (err) { toast(err.message, 4000); }
    e.target.value = '';
  };
  $('#importFile').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { const n = store.importData(await f.text()); toast(`Imported ${n} roadmap${n === 1 ? '' : 's'}`); renderHome(); }
    catch (err) { toast('That file could not be imported: ' + err.message, 4000); }
  };
  app.querySelectorAll('[data-del]').forEach(b => b.onclick = (e) => {
    e.preventDefault();
    const m = store.getMap(b.dataset.del);
    if (confirm(`Delete "${m.title}"? This can't be undone.`)) { store.deleteMap(m.id); renderHome(); }
  });
}

function mapCard(m) {
  const p = store.progress(m);
  return `<a class="mapcard card" href="#/map/${m.id}">
    <div class="mc-tracks">${m.tracks.slice(0, 6).map(t => `<span style="background:${t.color}"></span>`).join('')}</div>
    <h3>${esc(m.title)}</h3>
    <p>${esc(m.summary || '')}</p>
    <div class="mc-foot">
      <div class="bar"><i style="width:${p.pct}%"></i></div>
      <span>${p.done}/${p.total} · ${p.pct}%</span>
      <button class="iconbtn" data-del="${m.id}" aria-label="Delete ${esc(m.title)}" title="Delete">${ICON.trash}</button>
    </div>
    ${m.example ? '<span class="tag">Sample</span>' : ''}
  </a>`;
}

function footer() {
  return `<footer class="foot">
    <p>Made with care by Lyra · <a href="https://x.com/Lyra_void" target="_blank" rel="noopener">X</a> · <a href="https://github.com/Lyra-4leafclover" target="_blank" rel="noopener">GitHub</a> · <a href="https://lyradossier.vercel.app/" target="_blank" rel="noopener">Portfolio</a></p>
    <p class="muted">Your roadmaps and keys stay in this browser. Use Backup to move them to another device.</p>
  </footer>`;
}

async function readFile(f) {
  if (f.size > 15e6) throw new Error('That file is too big (max 15 MB).');
  if (/\.pdf$/i.test(f.name) || f.type === 'application/pdf') {
    toast('Reading PDF…', 8000);
    const pdfjs = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';
    const pdf = await pdfjs.getDocument({ data: await f.arrayBuffer() }).promise;
    let text = '';
    for (let i = 1; i <= Math.min(pdf.numPages, 60); i++) {
      const page = await pdf.getPage(i);
      const c = await page.getTextContent();
      text += c.items.map(it => it.str + (it.hasEOL ? '\n' : ' ')).join('') + '\n';
    }
    if (!text.trim()) throw new Error('This PDF has no selectable text (it may be a scan). Copy the text in by hand instead.');
    return text;
  }
  let t = await f.text();
  if (/\.html?$/i.test(f.name)) t = new DOMParser().parseFromString(t, 'text/html').body.innerText;
  return t;
}

/* ---------- building ---------- */
let buildToken = 0;
async function build(opts) {
  if (!opts.input) { toast('Type a topic or paste your syllabus first'); return; }
  const token = ++buildToken;
  modal.hidden = false;
  modal.innerHTML = `<div class="modal-card building">
    <img src="art/journal.webp" alt="">
    <h2>Drawing your roadmap…</h2>
    <p id="step">Reading what you gave me…</p>
    <div class="dots"><i></i><i></i><i></i></div>
    <p class="muted small">Big maps are built in several passes so nothing is skipped. This takes about 1 to 3 minutes.</p>
    <button class="pill ghost small" data-act="cancelBuild">Cancel</button>
  </div>`;
  try {
    const data = await generateRoadmap(opts, (s) => { const el = $('#step'); if (el && token === buildToken) el.textContent = s; });
    if (token !== buildToken) return;
    const map = store.newMap(data, { input: opts.input.slice(0, 4000), level: opts.level, size: opts.size, goal: opts.goal });
    modal.hidden = true;
    location.hash = `#/map/${map.id}`;
  } catch (e) {
    if (token !== buildToken) return;
    modal.innerHTML = `<div class="modal-card building">
      <h2>That didn't work</h2>
      <p>${esc(e.message)}</p>
      <div class="row-btns center">
        <button class="pill primary small" data-act="retryBuild">Try again</button>
        <button class="pill ghost small" data-act="settings">Open Settings</button>
        <button class="pill ghost small" data-act="closeModal">Close</button>
      </div></div>`;
    modal.querySelector('[data-act=retryBuild]').onclick = () => build(opts);
  }
}

/* ---------- map page ---------- */
function renderMap(map, nodeId) {
  closeDrawer(false);
  store.touchMap(map.id);
  document.body.dataset.page = 'map';
  const view = localStorage.getItem('clover-atlas.view') || (innerWidth < 640 ? 'list' : 'map');
  app.innerHTML = `
  <section class="mapbar">
    <div class="mb-top">
      <a class="back" href="#/">← All roadmaps</a>
      <div class="row-btns">
        <button class="pill ghost small" data-act="share">${ICON.share}<span>Share</span></button>
        <button class="pill ghost small" data-act="exportMap">${ICON.down}<span>Save file</span></button>
        <button class="iconbtn" data-act="deleteMap" title="Delete roadmap" aria-label="Delete roadmap">${ICON.trash}</button>
      </div>
    </div>
    <h1 class="mtitle">${esc(map.title)}</h1>
    ${map.summary ? `<p class="msum">${esc(map.summary)}</p>` : ''}
    <div class="mb-progress"><div class="bar big"><i id="pbar"></i></div><span id="ptext"></span></div>
    <div class="mb-tools">
      <div class="seg" role="tablist">
        <button data-view="map" class="${view === 'map' ? 'on' : ''}">${ICON.map}<span>Map</span></button>
        <button data-view="list" class="${view === 'list' ? 'on' : ''}">${ICON.list}<span>List</span></button>
      </div>
      <label class="searchbox">${ICON.search}<input id="msearch" placeholder="Find a concept"></label>
      <div class="legend" id="legend">${map.tracks.map(t => `<button class="lchip" data-track="${esc(t.id)}" style="--c:${t.color}"><span></span>${esc(t.name)}</button>`).join('')}</div>
    </div>
    <div class="keys"><span class="k ready"></span>Ready to study <span class="k locked"></span>Needs prerequisites first <span class="k done"></span>Done <span class="k opt"></span>Optional</div>
  </section>
  <section class="mapstage">
    <div id="graph" class="graph" ${view === 'map' ? '' : 'hidden'}></div>
    <div id="list" class="mlist" ${view === 'list' ? '' : 'hidden'}></div>
    <div class="nextup card" id="nextup"></div>
  </section>`;

  current = { map, graph: null, view };
  const g = $('#graph');
  current.graph = createGraph(g, map, { onOpen: (id) => id ? go(id) : (drawerNode && go(null)), onToggle: toggleDone });
  renderList();
  updateProgress();

  app.querySelectorAll('[data-view]').forEach(b => b.onclick = () => {
    current.view = b.dataset.view; localStorage.setItem('clover-atlas.view', current.view);
    app.querySelectorAll('[data-view]').forEach(x => x.classList.toggle('on', x === b));
    g.hidden = current.view !== 'map'; $('#list').hidden = current.view !== 'list';
    if (current.view === 'map') current.graph.fit(true);
  });
  let filter = null;
  app.querySelectorAll('[data-track]').forEach(b => b.onclick = () => {
    filter = filter === b.dataset.track ? null : b.dataset.track;
    app.querySelectorAll('[data-track]').forEach(x => x.classList.toggle('on', x.dataset.track === filter));
    app.classList.toggle('filtering', !!filter);
    current.graph.setFilter(filter); renderList(filter);
  });
  $('#msearch').oninput = (e) => { current.graph.setSearch(e.target.value); renderList(filter, e.target.value); };
  if (nodeId) openNode(nodeId, false);
}

const go = (id) => { location.hash = id ? `#/map/${current.map.id}/${encodeURIComponent(id)}` : `#/map/${current.map.id}`; };

function updateProgress() {
  const p = store.progress(current.map);
  $('#pbar').style.width = p.pct + '%';
  $('#ptext').textContent = `${p.done} of ${p.total} concepts done · ${p.pct}%${p.hoursLeft ? ` · about ${p.hoursLeft}h to go` : ''}`;
  const ready = current.map.nodes.filter(n => store.nodeStatus(current.map, n) === 'ready');
  const nu = $('#nextup');
  if (!ready.length) { nu.innerHTML = p.done === p.total ? `<b>You finished it all.</b> Amazing work.` : ''; nu.hidden = p.done !== p.total; return; }
  nu.hidden = false;
  const core = ready.filter(n => !n.optional);
  nu.innerHTML = `<b>Next up</b>${(core.length ? core : ready).slice(0, 3).map(n => `<button class="nchip" data-open="${esc(n.id)}">${esc(n.title)}</button>`).join('')}`;
  nu.querySelectorAll('[data-open]').forEach(b => b.onclick = () => { go(b.dataset.open); if (current.view === 'map') current.graph.centerOn(b.dataset.open); });
}

function renderList(filter = null, search = '') {
  const map = current.map;
  const { layers } = layout(map);
  const byId = Object.fromEntries(map.nodes.map(n => [n.id, n]));
  const color = Object.fromEntries(map.tracks.map(t => [t.id, t]));
  const s = search.trim().toLowerCase();
  $('#list').innerHTML = layers.map((L, i) => {
    const items = L.map(id => byId[id]).filter(n => (!filter || n.track === filter) && (!s || `${n.title} ${n.desc}`.toLowerCase().includes(s)));
    if (!items.length) return '';
    return `<div class="lstage"><h3>${i === 0 ? 'Start here' : 'Step ' + (i + 1)}<span>${i === 0 ? 'no prerequisites' : 'after the steps above'}</span></h3>
      ${items.map(n => {
        const st = store.nodeStatus(map, n), t = color[n.track];
        return `<div class="litem ${st}${n.optional ? ' optional' : ''}" data-id="${esc(n.id)}" style="--c:${t?.color}">
          <button class="tick" data-tick aria-pressed="${n.done}" aria-label="Mark ${esc(n.title)} as done">${ICON.check}</button>
          <button class="lbody" data-open="${esc(n.id)}"><b>${esc(n.title)}</b><span>${esc(n.desc || '')}</span>
          <em><i></i>${esc(t?.name || '')} · ${n.hours}h${n.optional ? ' · optional' : ''}${st === 'locked' ? ' · needs: ' + esc(n.prereqs.filter(p => !byId[p].done).map(p => byId[p].title).join(', ')) : ''}</em></button>
        </div>`;
      }).join('')}</div>`;
  }).join('') || '<p class="muted center">Nothing matches.</p>';
  $('#list').querySelectorAll('[data-open]').forEach(b => b.onclick = () => go(b.dataset.open));
  $('#list').querySelectorAll('[data-tick]').forEach(b => b.onclick = () => toggleDone(b.closest('[data-id]').dataset.id));
}

function toggleDone(id) {
  const map = current.map, n = map.nodes.find(x => x.id === id);
  const wasLocked = store.nodeStatus(map, n) === 'locked';
  n.done = !n.done; n.doneAt = n.done ? Date.now() : null;
  store.putMap(map);
  current.graph.refresh();
  renderList(app.querySelector('.lchip.on')?.dataset.track || null, $('#msearch')?.value || '');
  updateProgress();
  if (drawerNode === id) renderDrawerHead();
  if (n.done) {
    const unlocked = map.nodes.filter(k => k.prereqs.includes(id) && store.nodeStatus(map, k) === 'ready');
    const p = store.progress(map);
    if (p.done === p.total) { confetti(); toast('You finished the whole roadmap!', 4000); }
    else if (unlocked.length) toast(`Nice! Unlocked: ${unlocked.map(k => k.title).slice(0, 3).join(', ')}`);
    else toast(wasLocked ? 'Marked done (you skipped some prerequisites, that\'s okay)' : 'Nice, checked off!');
    const el = app.querySelector(`.gnode[data-id="${CSS.escape(id)}"]`); el?.classList.add('pop'); setTimeout(() => el?.classList.remove('pop'), 600);
  }
}

function confetti() {
  const colors = ['#7fae8b', '#e29aa8', '#d9b25c', '#a99bd6', '#86b2dc'];
  for (let i = 0; i < 80; i++) {
    const s = document.createElement('i'); s.className = 'confetti';
    s.style.left = Math.random() * 100 + 'vw'; s.style.background = colors[i % colors.length];
    s.style.animationDelay = Math.random() * 0.6 + 's'; s.style.transform = `rotate(${Math.random() * 360}deg)`;
    document.body.appendChild(s); setTimeout(() => s.remove(), 3200);
  }
}

/* ---------- concept drawer ---------- */
let drawerNode = null, drawerTab = 'learn';

function openNode(id, push = true) {
  if (!current) return;
  const n = current.map.nodes.find(x => x.id === id);
  if (!n) return closeDrawer();
  if (push) return go(id);
  if (drawerNode !== id) drawerTab = 'learn';
  drawerNode = id;
  document.body.classList.add('drawer-open');
  drawer.setAttribute('aria-hidden', 'false');
  current.graph.select(id);
  if (current.view === 'map') current.graph.centerOn(id);
  drawer.innerHTML = `<div class="dhead"></div>
    <div class="tabs" role="tablist">
      ${['learn', 'resources', 'practice', 'notes'].map(t => `<button role="tab" data-tab="${t}" class="${drawerTab === t ? 'on' : ''}">${{ learn: 'Learn', resources: 'Resources', practice: 'Practice', notes: 'Notes' }[t]}</button>`).join('')}
    </div>
    <div class="dbody"></div>`;
  drawer.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => {
    drawerTab = b.dataset.tab;
    drawer.querySelectorAll('[data-tab]').forEach(x => x.classList.toggle('on', x === b));
    renderTab();
  });
  renderDrawerHead();
  renderTab();
  drawer.scrollTop = 0;
  if (!n.pack && !n.packLoading) loadPack(n);
  if (!n.res?.at && !n.resLoading) loadRes(n);
}

function closeDrawer(push = true) {
  if (push && current && drawerNode) { go(null); return; }
  drawerNode = null;
  document.body.classList.remove('drawer-open');
  drawer.setAttribute('aria-hidden', 'true');
  current?.graph?.select(null);
}
scrim.onclick = () => closeDrawer();
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { if (!modal.hidden) closeModal(); else if (drawerNode) closeDrawer(); }
});

function renderDrawerHead() {
  const map = current.map, n = map.nodes.find(x => x.id === drawerNode);
  const t = map.tracks.find(x => x.id === n.track);
  const st = store.nodeStatus(map, n);
  const byId = Object.fromEntries(map.nodes.map(x => [x.id, x]));
  const unlocks = map.nodes.filter(x => x.prereqs.includes(n.id));
  const chip = (x) => `<button class="rchip ${x.done ? 'done' : ''}" data-open="${esc(x.id)}">${x.done ? ICON.check : ''}${esc(x.title)}</button>`;
  $('.dhead', drawer).innerHTML = `
    <div class="dtop">
      <span class="tpill" style="--c:${t?.color}">${esc(t?.name || '')}</span>
      <button class="iconbtn" data-act="closeDrawer" aria-label="Close">${ICON.close}</button>
    </div>
    <h2>${esc(n.title)}</h2>
    <div class="dmeta">
      <span class="lvl" title="Difficulty">${[1, 2, 3].map(i => `<i class="${i <= n.level ? 'on' : ''}"></i>`).join('')} ${['', 'Easy', 'Medium', 'Hard'][n.level]}</span>
      <span>~${n.hours}h</span>${n.optional ? '<span class="opt">optional</span>' : ''}
      <span class="st ${st}">${{ done: 'Done', ready: 'Ready to study', locked: 'Prerequisites first' }[st]}</span>
    </div>
    ${n.desc ? `<p class="ddesc">${esc(n.desc)}</p>` : ''}
    <button class="pill ${n.done ? 'done' : 'primary'} wide" data-act="toggleDone">${ICON.check}<span>${n.done ? 'Done! (tap to undo)' : 'Mark as done'}</span></button>
    ${n.prereqs.length ? `<div class="rel"><span>Needs first</span>${n.prereqs.map(p => chip(byId[p])).join('')}</div>` : '<div class="rel"><span>Needs first</span><em>Nothing, you can start here</em></div>'}
    ${unlocks.length ? `<div class="rel"><span>Unlocks</span>${unlocks.map(chip).join('')}</div>` : ''}`;
  drawer.querySelectorAll('.dhead [data-open]').forEach(b => b.onclick = () => go(b.dataset.open));
}

async function loadPack(n, force = false) {
  const map = current.map;
  n.packLoading = true; n.packError = null;
  if (force) n.pack = null;
  if (drawerNode === n.id) renderTab();
  try {
    const pack = await generatePack(map, n);
    n.pack = pack;
  } catch (e) {
    n.packError = e.message;
  }
  n.packLoading = false;
  store.putMap(map);
  if (drawerNode === n.id && current?.map === map) renderTab();
}

async function loadRes(n, force = false) {
  const map = current.map;
  const show = () => { if (drawerNode === n.id && current?.map === map && drawerTab === 'resources') renderTab(); };
  n.resLoading = true; n.resError = null;
  if (force) n.res = null;
  show();
  try { n.res = await findResources(map, n); }
  catch (e) { n.resError = e.message; }
  n.resLoading = false;
  store.putMap(map);
  show();
  if (!n.res) return;
  n.resMore = true; show();
  try { await aiPicks(map, n, n.res); } catch { /* the instant results are still there */ }
  n.resMore = false;
  store.putMap(map);
  show();
}

const vidCard = (v) => `
  <a class="vcard" href="${esc(v.url)}" target="_blank" rel="noopener">
    <span class="vthumb"><img src="${esc(v.thumb)}" alt="" loading="lazy">${v.len ? `<i>${esc(v.len)}</i>` : ''}</span>
    <b>${esc(v.title)}</b>
    <span class="rby">${[v.by, v.views].filter(Boolean).map(esc).join(' · ')}</span>
  </a>`;
const webCard = (w) => `
  <a class="rcard" href="${esc(w.url)}" target="_blank" rel="noopener">
    <span class="rhost"><img src="https://www.google.com/s2/favicons?domain=${esc(w.host)}&sz=32" alt="" loading="lazy" onerror="this.remove()">${esc(w.host)}</span>
    <b>${esc(w.title)}</b>${w.picked ? '<span class="pick">AI pick · link checked</span>' : ''}
    ${w.snippet ? `<span class="rwhy">${esc(w.snippet)}</span>` : ''}
    ${ICON.ext}
  </a>`;
const resGroups = (groups) => groups.map(g => `
  <div class="block"><h4>${esc(g.name)} <span class="muted">${g.items.length}</span></h4>
    <div class="${g.kind === 'video' ? 'vgrid' : 'res'}">${g.items.map(g.kind === 'video' ? vidCard : webCard).join('')}</div>
  </div>`).join('');

function renderTab() {
  const map = current.map, n = map.nodes.find(x => x.id === drawerNode);
  const body = $('.dbody', drawer);
  const p = n.pack;
  const loading = `<div class="loading"><div class="dots"><i></i><i></i><i></i></div><p>Writing your study pack for <b>${esc(n.title)}</b>…</p><div class="skel"></div><div class="skel short"></div><div class="skel"></div></div>`;
  const failed = n.packError ? `<div class="notice"><p>${esc(n.packError)}</p><div class="row-btns"><button class="pill primary small" data-act="retryPack">Try again</button><button class="pill ghost small" data-act="settings">Settings</button></div><p class="muted small">The links in Resources still work without AI.</p></div>` : '';
  const need = (html) => n.packLoading ? loading : (p ? html() : failed || `<button class="pill primary" data-act="retryPack">${ICON.spark}<span>Make study pack</span></button>`);

  if (drawerTab === 'learn') {
    body.innerHTML = need(() => `
      <div class="block"><h4>In plain words</h4><p>${esc(p.explain)}</p></div>
      ${p.analogy ? `<div class="block soft"><h4>Think of it like…</h4><p>${esc(p.analogy)}</p></div>` : ''}
      ${p.why ? `<div class="block"><h4>Why it matters</h4><p>${esc(p.why)}</p></div>` : ''}
      ${p.subtopics.length ? `<div class="block"><h4>What to cover</h4><ul class="subs">${p.subtopics.map(s => `<li><b>${esc(s.name)}</b>${s.desc ? `<span>${esc(s.desc)}</span>` : ''}</li>`).join('')}</ul></div>` : ''}
      ${p.steps.length ? `<div class="block"><h4>Study plan</h4><ol class="steps">${p.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol></div>` : ''}
      ${p.mistakes.length ? `<div class="block warn"><h4>Common mistakes</h4><ul>${p.mistakes.map(s => `<li>${esc(s)}</li>`).join('')}</ul></div>` : ''}
      <div class="block ask"><h4>Still confused? Ask anything</h4>
        <form id="askf"><input id="askq" placeholder="e.g. what's the difference between X and Y?" autocomplete="off"><button class="pill primary small">Ask</button></form>
        <div id="answers">${(n.qa || []).map(qaHtml).join('')}</div>
      </div>`) + `<div class="block wiki" id="wiki"></div>
      <button class="pill ghost small wide" data-act="expand">${ICON.branch}<span>Break this concept into its own roadmap</span></button>
      ${p ? `<button class="linkish small center-block" data-act="retryPack">Regenerate this study pack</button>` : ''}`;
    loadWiki(n);
    const f = $('#askf', body);
    if (f) f.onsubmit = async (e) => {
      e.preventDefault();
      const q = $('#askq', body).value.trim(); if (!q) return;
      const box = $('#answers', body);
      box.insertAdjacentHTML('afterbegin', `<div class="qa pending"><b>${esc(q)}</b><p>Thinking…</p></div>`);
      $('#askq', body).value = '';
      try {
        const a = await askAbout(map, n, q);
        n.qa = [{ q, a }, ...(n.qa || [])].slice(0, 12); store.putMap(map);
        if (drawerNode === n.id && drawerTab === 'learn') box.innerHTML = n.qa.map(qaHtml).join('');
      } catch (err) { box.querySelector('.pending p').textContent = err.message; box.querySelector('.pending').classList.remove('pending'); }
    };
  }

  if (drawerTab === 'resources') {
    const r = n.res?.at ? n.res : null;
    if (n.resLoading || (!r && !n.resError)) {
      body.innerHTML = `<div class="loading"><div class="dots"><i></i><i></i><i></i></div><p>Finding real videos, articles, courses and books for <b>${esc(n.title)}</b>…</p><div class="skel"></div><div class="skel short"></div></div>`;
      if (!n.resLoading) loadRes(n);
    } else if (!r) {
      body.innerHTML = `<div class="notice"><p>${esc(n.resError)}</p><div class="row-btns"><button class="pill primary small" data-act="retryRes">Try again</button></div></div>`;
    } else {
      body.innerHTML = `
        <div class="rsec free"><h3><span class="ctag free">Free</span> ${count(r.free)} resources</h3>${n.resMore ? '<p class="more-load"><span class="dots"><i></i><i></i><i></i></span> Adding hand-picked docs, guides and courses (links are checked first)…</p>' : ''}${resGroups(r.free) || '<p class="muted small">No free resources found.</p>'}</div>
        <div class="rsec paid"><h3><span class="ctag paid">Paid</span> ${count(r.paid)} if you want to go further</h3>${resGroups(r.paid) || '<p class="muted small">No paid picks found for this one.</p>'}</div>
        <button class="linkish small center-block" data-act="retryRes">Refresh resources</button>`;
    }
  }

  if (drawerTab === 'practice') {
    body.innerHTML = need(() => `
      ${p.questions.length ? `<div class="block"><h4>Practice questions</h4><p class="muted small">Answer in your head first, then tap to check.</p>
        ${p.questions.map((x, i) => `<details class="qcard"><summary><span>${i + 1}</span>${esc(x.q)}</summary><p>${esc(x.a)}</p></details>`).join('')}</div>` : ''}
      ${p.cards.length ? `<div class="block"><h4>Flashcards</h4>
        <div class="flash" id="flash"><div class="fcard" tabindex="0"><div class="ff"></div><div class="fb"></div></div>
        <div class="fnav"><button class="iconbtn" data-f="-1" aria-label="Previous">‹</button><span id="fcount"></span><button class="iconbtn" data-f="1" aria-label="Next">›</button></div>
        <p class="muted small center">Tap the card to flip it.</p></div></div>` : ''}
      ${p.project ? `<div class="block soft"><h4>Mini project</h4><p>${esc(p.project)}</p></div>` : ''}`);
    const fl = $('#flash', body);
    if (fl) {
      let i = 0;
      const card = $('.fcard', fl);
      const show = () => { card.classList.remove('flip'); $('.ff', fl).textContent = p.cards[i].front; $('.fb', fl).textContent = p.cards[i].back; $('#fcount', fl).textContent = `${i + 1} / ${p.cards.length}`; };
      card.onclick = () => card.classList.toggle('flip');
      card.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); card.classList.toggle('flip'); } };
      fl.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { i = (i + +b.dataset.f + p.cards.length) % p.cards.length; show(); });
      show();
    }
  }

  if (drawerTab === 'notes') {
    body.innerHTML = `<div class="block"><h4>Your notes</h4><p class="muted small">Saved automatically in this browser.</p>
      <textarea id="notes" rows="12" placeholder="Write what you learned, questions to ask, links you found…">${esc(n.notes || '')}</textarea></div>`;
    $('#notes', body).oninput = (e) => { n.notes = e.target.value; store.saveSoon(map); };
  }

  body.querySelectorAll('[data-act=retryPack]').forEach(b => b.onclick = () => loadPack(n, true));
  body.querySelectorAll('[data-act=retryRes]').forEach(b => b.onclick = () => loadRes(n, true));
  body.querySelector('[data-act=expand]')?.addEventListener('click', () => {
    const track = map.tracks.find(t => t.id === n.track)?.name;
    build({ input: `${n.title} (as part of ${map.title}${track ? ', ' + track : ''})`, level: map.source?.level || 'new', size: 'compact', goal: '' });
  });
}

const qaHtml = (x) => `<div class="qa"><b>${esc(x.q)}</b>${esc(x.a).split(/\n{2,}/).map(par => `<p>${par.replace(/\n/g, '<br>')}</p>`).join('')}</div>`;

const wikiCache = {};
async function loadWiki(n) {
  const el = $('#wiki', drawer); if (!el) return;
  const w = wikiCache[n.id] ?? (wikiCache[n.id] = await wikiSummary(n.title));
  const el2 = $('#wiki', drawer);
  if (!w || !el2 || drawerNode !== n.id) { if (el2) el2.remove(); return; }
  el2.innerHTML = `<h4>From Wikipedia</h4>${w.thumb ? `<img src="${esc(w.thumb)}" alt="">` : ''}<p>${esc(w.text)}</p><a href="${esc(w.url)}" target="_blank" rel="noopener">Read "${esc(w.title)}" on Wikipedia ${ICON.ext}</a>`;
}

/* ---------- sharing / files ---------- */
async function shareMap() {
  const code = await store.shareCode(current.map);
  const url = `${location.origin}${location.pathname}#/share/${code}`;
  try { await navigator.clipboard.writeText(url); toast('Share link copied. Anyone who opens it gets their own copy.', 3500); }
  catch { prompt('Copy this link:', url); }
}
async function openShared(code) {
  try {
    const data = await store.fromShareCode(code);
    const m = store.newMap(data, data.source);
    toast('Roadmap added to your collection');
    location.replace(`#/map/${m.id}`);
  } catch { toast('That share link is broken or incomplete.', 4000); location.replace('#/'); }
}
function download(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const fileName = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'roadmap';

/* ---------- settings ---------- */
function openSettings() {
  const s = store.getSettings();
  modal.hidden = false;
  modal.innerHTML = `<div class="modal-card settings" role="dialog" aria-label="Settings">
    <div class="dtop"><h2>AI settings</h2><button class="iconbtn" data-act="closeModal" aria-label="Close">${ICON.close}</button></div>
    <p class="muted">Pick which AI builds your roadmaps. Keys are stored only in this browser and sent only to that AI company.</p>
    <label class="opt-card"><input type="radio" name="prov" value="auto" ${s.provider === 'auto' ? 'checked' : ''}>
      <div><b>Built-in free AI</b><span>No key needed. Only works when the site runs on its own server (like Vercel). It can be slow or busy at times.</span></div></label>
    <label class="opt-card"><input type="radio" name="prov" value="gemini" ${s.provider === 'gemini' ? 'checked' : ''}>
      <div><b>Google Gemini <em class="rec">free · recommended</em></b><span>Fast and smart. Get a free key in about a minute:</span>
      <ol class="small"><li>Open <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a> and sign in with Google.</li><li>Click <b>Create API key</b>, then copy it.</li><li>Paste it below and press <b>Save</b>.</li></ol>
      <div class="pf"><input id="gkey" type="password" placeholder="Paste your Gemini key (starts with AIza…)" value="${esc(s.geminiKey)}" autocomplete="off"></div>
      <details class="small"><summary>Advanced</summary><label class="field"><span>Model</span><input id="gmodel" value="${esc(s.geminiModel)}"></label></details></div></label>
    <label class="opt-card"><input type="radio" name="prov" value="openai" ${s.provider === 'openai' ? 'checked' : ''}>
      <div><b>Other AI service</b><span>OpenAI, Groq, OpenRouter or any OpenAI-compatible API.</span>
      <div class="pf"><input id="obase" placeholder="API address" value="${esc(s.openaiBase)}"><input id="okey" type="password" placeholder="API key" value="${esc(s.openaiKey)}" autocomplete="off"><input id="omodel" placeholder="Model name" value="${esc(s.openaiModel)}"></div>
      <p class="small muted">Groq: <code>https://api.groq.com/openai/v1</code> · OpenRouter: <code>https://openrouter.ai/api/v1</code></p></div></label>
    <div class="row-btns"><button class="pill primary" data-act="saveSettings">Save</button><button class="pill ghost" data-act="testAI">Test connection</button><span id="testres" class="small"></span></div>
    <hr>
    <h3>Your data</h3>
    <div class="row-btns"><button class="pill ghost small" data-act="exportAll">${ICON.down}<span>Download backup</span></button>
    <button class="pill ghost small" data-act="addSample">Add the DevOps sample again</button></div>
  </div>`;
  modal.querySelectorAll('.pf input, details input').forEach(i => i.addEventListener('input', () => {
    i.closest('.opt-card').querySelector('input[type=radio]').checked = true;
  }));
}
function readSettingsForm() {
  store.setSettings({
    provider: modal.querySelector('input[name=prov]:checked')?.value || 'auto',
    geminiKey: $('#gkey', modal).value.trim(), geminiModel: $('#gmodel', modal).value.trim() || 'gemini-2.5-flash',
    openaiBase: $('#obase', modal).value.trim(), openaiKey: $('#okey', modal).value.trim(), openaiModel: $('#omodel', modal).value.trim(),
  });
}
function closeModal() {
  modal.hidden = true; modal.innerHTML = ''; buildToken++;
  const note = $('.ai-note b'); if (note) note.textContent = providerLabel();
}

/* ---------- global actions ---------- */
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const act = b.dataset.act;
  if (act === 'settings') { e.preventDefault(); openSettings(); }
  else if (act === 'closeModal' || act === 'cancelBuild') closeModal();
  else if (act === 'closeDrawer') closeDrawer();
  else if (act === 'toggleDone') toggleDone(drawerNode);
  else if (act === 'share') shareMap();
  else if (act === 'exportMap') { const m = current.map; download(`${fileName(m.title)}.json`, JSON.stringify(m, null, 1)); }
  else if (act === 'exportAll') download(`clover-atlas-backup-${new Date().toISOString().slice(0, 10)}.json`, store.exportAll());
  else if (act === 'deleteMap') { if (confirm(`Delete "${current.map.title}"? This can't be undone.`)) { store.deleteMap(current.map.id); location.hash = '#/'; } }
  else if (act === 'saveSettings') { readSettingsForm(); toast('Settings saved'); closeModal(); }
  else if (act === 'addSample') { store.newMap(structuredClone(EXAMPLE), EXAMPLE.source); toast('Sample added'); closeModal(); if (location.hash.length > 2) location.hash = '#/'; else renderHome(); }
  else if (act === 'testAI') {
    readSettingsForm();
    const r = $('#testres'); r.textContent = 'Testing…'; r.className = 'small';
    try { await testConnection(); r.textContent = 'It works!'; r.className = 'small ok'; }
    catch (err) { r.textContent = err.message; r.className = 'small bad'; }
  }
});
modal.addEventListener('click', (e) => { if (e.target === modal && !modal.querySelector('.building')) closeModal(); });

route();
