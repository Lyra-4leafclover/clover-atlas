<p align="center">
  <img src="art/hero.webp" alt="Watercolor clover meadow with winding paths, lanterns and open books" width="100%">
</p>

<h1 align="center">
  <img src="art/favicon.svg" alt="" width="44" valign="middle">&nbsp;Clover Atlas
</h1>

<p align="center">
  <em>Type one word or paste your syllabus. Get the whole map of what to learn, in the right order.</em>
</p>

<p align="center">
  <img alt="no sign-up" src="https://img.shields.io/badge/no%20sign--up-f6d6cc?style=for-the-badge">
  <img alt="free and paid resources" src="https://img.shields.io/badge/free%20%26%20paid%20resources-d5eddf?style=for-the-badge">
  <img alt="your data stays in your browser" src="https://img.shields.io/badge/data%20stays%20in%20your%20browser-d8e6f5?style=for-the-badge">
  <img alt="HTML CSS JS" src="https://img.shields.io/badge/html%20·%20css%20·%20js-eadcf5?style=for-the-badge">
</p>

<p align="center">
  <a href="https://clover-atlas-eight.vercel.app"><strong>✨ Open Clover Atlas ✨</strong></a>
</p>

<p align="center">
  <img src="docs/demo.gif" alt="Opening a concept on the DevOps roadmap and scrolling through its free and paid resources" width="88%">
</p>

---

## 🍀 &nbsp;What it does

Give Clover Atlas anything: *"DevOps"*, *"organic chemistry"*, a course name, or your whole syllabus as text or a PDF. It draws a branching roadmap of every concept you need, with arrows showing what to learn first.

<table>
  <tr>
    <td width="33%" valign="top"><b>🗺️ &nbsp;A real map, not a list</b><br>Concepts branch and merge in colour-coded tracks, with prerequisite arrows, optional side-quests and a capstone at the end.</td>
    <td width="33%" valign="top"><b>📚 &nbsp;Nothing skipped</b><br>The AI plans the full curriculum first, then fills in each part. It keeps every topic from your syllabus and adds the basics it assumes. That's 30 to 90 concepts.</td>
    <td width="33%" valign="top"><b>✅ &nbsp;Tick as you go</b><br>Check concepts off and watch the progress bar fill. Concepts stay faded until their prerequisites are done, and "Next up" shows what's ready.</td>
  </tr>
  <tr>
    <td valign="top"><b>🎬 &nbsp;Real resources</b><br>Every concept links straight to real YouTube videos, docs, articles, courses, Q&amp;A, GitHub projects and books. No search links.</td>
    <td valign="top"><b>💸 &nbsp;Free and paid, split</b><br>A big Free section (often 30+ links) and a smaller Paid one with courses and books. Links are checked before they're shown.</td>
    <td valign="top"><b>✍️ &nbsp;A full study pack</b><br>A plain explanation, a study plan, common mistakes, practice questions, flashcards, a mini project, an AI tutor and your own notes.</td>
  </tr>
</table>

## 🌸 &nbsp;A peek inside

<table>
  <tr>
    <td width="68%"><img src="docs/map.png" alt="DevOps roadmap with prerequisite arrows and finished concepts"></td>
    <td width="32%" rowspan="2"><img src="docs/mobile.png" alt="A concept's resources on a phone"></td>
  </tr>
  <tr>
    <td><img src="docs/resources.png" alt="Docker concept with real YouTube videos in the Free section"></td>
  </tr>
  <tr>
    <td><img src="docs/paid.png" alt="Paid courses and books for a concept"></td>
    <td><img src="docs/list.png" alt="The same roadmap as a step-by-step list"></td>
  </tr>
</table>

<p align="center"><img src="docs/home.png" alt="Home page where you type a topic or paste a syllabus" width="88%"></p>

## ✍️ &nbsp;How to use it

1. On the home page, type a topic or paste your syllabus. You can also upload a `.txt`, `.md` or `.pdf` file.
2. Pick your level and a size: **Compact** (about 30 concepts), **Full** (about 55) or **Deep** (about 90). Then click **Build my roadmap**. On the shared free AI, big maps take 1 to 3 minutes. With your own free key (see below) it's much quicker.
3. Click any concept to open it. **Learn** explains it, **Resources** has the links, **Practice** has questions and flashcards, and **Notes** is yours.
4. Click **Mark as done** when you finish a concept. The next ones unlock.

There's a sample **DevOps** roadmap built in, so you can try it right away.

## 🎬 &nbsp;Where the resources come from

When you open a concept's **Resources** tab, the site's server looks things up for you. No keys are needed.

- **Within about a second:** real YouTube videos and full lectures, Wikipedia, popular articles from Hacker News, top Stack Overflow answers and GitHub projects (for tech topics), and books from Open Library (free to borrow) and Amazon (paid).
- **A bit later, in the background:** the AI adds official docs, guides, free courses and paid courses. The server opens each link first and drops any that are dead.

Each concept is saved once it has loaded, so opening it again is instant. **Refresh resources** fetches a new set.

## 🔑 &nbsp;Use your own free key (much faster)

Out of the box, everyone shares one free public AI. It needs no key, but it's slow (a Full roadmap takes about 1 to 3 minutes) and sometimes busy. Anyone using the site can add **their own free key** instead. Roadmaps then build several times faster, because the modules are made at the same time instead of one by one, and the maps are better too.

Click **Use my own key** on the home page (or **Settings** at the top). The steps are shown right there:

<p align="center"><img src="docs/settings.png" alt="AI settings with step-by-step instructions for a free Gemini key" width="70%"></p>

**Google Gemini (free, recommended)**
1. Open https://aistudio.google.com/apikey and sign in with your Google account.
2. If asked, accept the terms. Then click **Create API key**. If it asks for a project, pick any one or let it make one.
3. Copy the key. It starts with `AIza`.
4. In Clover Atlas, paste it into the Gemini box, press **Test connection**, then **Save**.

**Groq (free, very fast)**
1. Open https://console.groq.com/keys and sign in.
2. Click **Create API Key**, give it any name and copy it. It starts with `gsk_` and is only shown once.
3. In Settings under **Other AI service**, click **fill in Groq**, paste the key, then **Test connection** and **Save**.

**OpenRouter or OpenAI:** the same steps, with keys from https://openrouter.ai/keys (models ending in `:free` cost nothing) or https://platform.openai.com/api-keys (paid).

Keys are saved only in that person's browser and sent straight to the AI company. They never go to the site's server.

## 🔒 &nbsp;Your data

There are no accounts. Your roadmaps, ticks and notes are saved in your own browser. Use **Backup** on the home page (or **Save file** on one roadmap) to download them, and **Import** to open them on another device. **Share** copies a link that gives a friend their own copy.

## 🗂️ &nbsp;What's inside

| File | What it is |
| --- | --- |
| `css/style.css` | Colours and fonts. The `:root` colours at the top restyle the whole site. |
| `js/app.js` | The pages: home, roadmap, concept panel and settings. |
| `js/graph.js` | How the map is laid out, the arrows, and pan and zoom. |
| `js/ai.js` | The instructions given to the AI to build roadmaps and study packs. |
| `js/resources.js` | How free and paid resources are gathered for a concept. |
| `js/example.js` | The built-in DevOps sample. |
| `js/store.js` | Saving in the browser, backups and share links. |
| `api/ai.js`, `api/find.js` | The server parts (AI and the resource finder). |
| `server.py` | The same server parts, in Python. |
| `art/` | Watercolor artwork and icon. |

<br>

<p align="center">
  <img src="art/favicon.svg" alt="" width="28"><br>
  <sub>made with care for every learner by Lyra</sub><br>
  <sub><a href="https://x.com/Lyra_void">X</a> · <a href="https://github.com/Lyra-4leafclover">GitHub</a> · <a href="https://lyradossier.vercel.app/">Portfolio</a></sub>
</p>
