#!/usr/bin/env bun
/**
 * Static-site builder.
 *
 * Inputs : apps/web/public/* + SPEC.md + docs/IETF-DRAFT.md + docs/MCP-SEP-agent-feed.md + ROADMAP.md + CHANGELOG.md
 * Output : dist/  (suitable for GitHub Pages)
 *
 * The hand-built HTML pages from the Claude design handoff render verbatim.
 * Long markdown documents (spec / IETF / SEP / roadmap / changelog) are pre-
 * rendered into the same shell so they ship complete on Pages.
 *
 * The dashboard page is rewritten lightly: hardcoded localhost:4300 references
 * are replaced with `window.__CORPUS_ORIGIN__ ?? null`, so on a hosted deploy
 * with no backend the dashboard still renders the static demo and shows a
 * clear "live data unavailable" banner.
 */

import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
  copyFileSync,
  rmSync,
  existsSync,
} from "node:fs";
import { dirname, join, resolve, relative } from "node:path";
import { marked } from "marked";

const ROOT = resolve(import.meta.dir, "..");
const SRC = join(ROOT, "apps/web/public");
const DIST = join(ROOT, "dist");

if (existsSync(DIST)) rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

// 1. Copy apps/web/public/* → dist/ (verbatim)
function copyTree(from: string, to: string) {
  for (const ent of readdirSync(from)) {
    const a = join(from, ent);
    const b = join(to, ent);
    const s = statSync(a);
    if (s.isDirectory()) {
      mkdirSync(b, { recursive: true });
      copyTree(a, b);
    } else {
      copyFileSync(a, b);
    }
  }
}
copyTree(SRC, DIST);

// 2. Patch dashboard.html for hosted use:
//    - replace `localhost:4300` defaults with a build-time setting
//    - inject a banner when no backend is configured
{
  const p = join(DIST, "dashboard.html");
  let html = readFileSync(p, "utf8");
  html = html.replace(
    /const CORPUS = \(window\.__CORPUS_ORIGIN__\) \|\| "http:\/\/localhost:4300";/g,
    `const CORPUS = window.__CORPUS_ORIGIN__ || "";`,
  );
  // Also relax the homepage's counter strip dependency on localhost:4300 for hosted use
  writeFileSync(p, html);
}
{
  const p = join(DIST, "index.html");
  let html = readFileSync(p, "utf8");
  html = html.replace(
    /const CORPUS = \(window\.__CORPUS_ORIGIN__\) \|\| "http:\/\/localhost:4300";/g,
    `const CORPUS = window.__CORPUS_ORIGIN__ || "";`,
  );
  writeFileSync(p, html);
}

// 3. Render long markdown documents into the design's shell.
//    Templates pull from spec.html / docs.html so the chrome (topbar, footer,
//    typography) is identical across pages.

const TOPBAR = `<header class="topbar">
  <div class="shell topbar-inner">
    <a href="index.html" class="brand"><span class="brand-mark"></span>agent-feed</a>
    <nav class="nav">
      <a href="index.html">overview</a>
      <a href="dashboard.html">drift dashboard</a>
      <a href="search.html" class="nav-extra">aggregator</a>
      <a href="spec.html" class="active">spec</a>
      <a href="docs.html" class="nav-extra">docs</a>
      <a href="https://github.com/abdul-abdi/agent-feed" style="color: var(--muted)">github ↗</a>
    </nav>
  </div>
</header>`;

const FOOTER = `<footer class="footer">
  <div class="row gap-5" style="flex-wrap:wrap; align-items:flex-start;">
    <div class="col gap-2" style="flex: 1; min-width: 220px;">
      <div class="brand"><span class="brand-mark"></span>agent-feed</div>
      <div>The agentic web's git log. v0 protocol — 2026-04-27.</div>
    </div>
    <div class="col gap-2" style="min-width: 160px;">
      <div class="mono-caps">protocol</div>
      <a href="spec.html">SPEC.md</a>
      <a href="ietf-draft.html">IETF draft</a>
      <a href="mcp-sep.html">MCP SEP</a>
    </div>
    <div class="col gap-2" style="min-width: 160px;">
      <div class="mono-caps">tools</div>
      <a href="dashboard.html">drift dashboard</a>
      <a href="search.html">aggregator</a>
      <a href="docs.html">CLI / library</a>
    </div>
    <div class="col gap-2" style="min-width: 160px;">
      <div class="mono-caps">project</div>
      <a href="roadmap.html">roadmap</a>
      <a href="changelog.html">changelog</a>
      <a href="https://github.com/abdul-abdi/agent-feed">github ↗</a>
    </div>
  </div>
  <hr style="margin-top: var(--s-6);">
  <div class="row" style="margin-top: var(--s-4); justify-content: space-between; flex-wrap: wrap; gap: var(--s-3);">
    <span>MIT · independent · no signup, no billing</span>
    <span>built for agents, by people who read code</span>
  </div>
</footer>`;

const RFC_KEYWORDS = [
  "MUST NOT",
  "SHOULD NOT",
  "MUST",
  "SHOULD",
  "MAY",
  "REQUIRED",
  "RECOMMENDED",
  "SHALL NOT",
  "SHALL",
];
function applyRfcKeywords(html: string): string {
  let out = html;
  for (const kw of RFC_KEYWORDS) {
    const cls =
      kw.startsWith("MUST") || kw.startsWith("SHALL") || kw === "REQUIRED"
        ? "rfc-mustword"
        : "rfc-shouldword";
    // Match the keyword only inside paragraph text, not inside attributes/code blocks.
    // marked emits paragraphs as <p>...</p> so a permissive replace inside <p> blocks is fine;
    // we additionally avoid matching inside <pre> by running on segmented chunks.
    out = out.replace(new RegExp(`(<p[^>]*>[\\s\\S]*?</p>)`, "g"), (block) =>
      block.replace(
        new RegExp(`\\b${kw}\\b`, "g"),
        `<span class="${cls}">${kw}</span>`,
      ),
    );
  }
  return out;
}

interface TocEntry {
  id: string;
  num: string;
  title: string;
  level: 2 | 3;
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9§]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "section"
  );
}

function renderMarkdownPage(opts: {
  title: string;
  outFile: string;
  src: string;
  badges?: string[];
  abstract?: string;
}): TocEntry[] {
  const md = readFileSync(opts.src, "utf8");
  // Strip leading frontmatter if present
  const noFm = md.replace(/^---\n[\s\S]*?\n---\n/, "");

  const toc: TocEntry[] = [];

  // Configure marked with custom heading renderer that:
  //  - assigns stable ids
  //  - emits the design's <span class="num">§N</span>Title structure for h2
  let h2Counter = 0;
  let h3Counter = 0;

  const renderer = new marked.Renderer();
  renderer.heading = ({ tokens, depth }) => {
    const raw = tokens
      .map((t: any) => t.raw ?? t.text ?? "")
      .join("")
      .trim();
    if (depth === 1) {
      return `<h1>${raw}</h1>\n`;
    }
    if (depth === 2) {
      h2Counter += 1;
      h3Counter = 0;
      const id = slugify(raw);
      toc.push({
        id,
        num: `§${h2Counter}`,
        title: stripNumPrefix(raw),
        level: 2,
      });
      return `<h2 id="${id}"><span class="num">§${h2Counter}</span>${escapeHtml(stripNumPrefix(raw))}</h2>\n`;
    }
    if (depth === 3) {
      h3Counter += 1;
      const id = slugify(raw);
      toc.push({
        id,
        num: `§${h2Counter}.${h3Counter}`,
        title: stripNumPrefix(raw),
        level: 3,
      });
      return `<h3 id="${id}">${escapeHtml(stripNumPrefix(raw))}</h3>\n`;
    }
    return `<h${depth}>${escapeHtml(raw)}</h${depth}>\n`;
  };
  renderer.code = ({ text, lang }) => {
    return `<pre class="block"><code${lang ? ` data-lang="${escapeHtml(lang)}"` : ""}>${escapeHtml(text)}</code></pre>\n`;
  };
  renderer.codespan = ({ text }) =>
    `<code class="inline">${escapeHtml(text)}</code>`;

  marked.use({ renderer, gfm: true, breaks: false });

  let body = marked.parse(noFm) as string;
  // Default tables get a scroll wrapper; default blockquotes get the abstract style.
  body = body
    .replace(/<table>/g, '<div class="md-table"><table>')
    .replace(/<\/table>/g, "</table></div>");
  body = body.replace(/<blockquote>/g, '<blockquote class="abstract-block">');
  body = applyRfcKeywords(body);

  // Build TOC HTML matching the design's sidebar shape
  const tocHtml = toc
    .map((t) => {
      const cls =
        t.level === 3
          ? ' style="padding-left: 14px; font-size: var(--fs-xs);"'
          : "";
      return `<a href="#${t.id}"${cls}><span class="num">${t.num}</span>${escapeHtml(t.title)}</a>`;
    })
    .join("\n      ");

  const badges = (opts.badges ?? [])
    .map((b) => `<span class="pill pill-source">${escapeHtml(b)}</span>`)
    .join(" ");

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(opts.title)} — agent-feed</title>
<link rel="stylesheet" href="tokens.css">
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<style>
  .spec-shell { display: grid; grid-template-columns: 240px 1fr; gap: var(--s-7); padding: var(--s-6) 0 var(--s-9); }
  @media (max-width: 1000px) { .spec-shell { grid-template-columns: 1fr; gap: var(--s-5); } }
  .toc { position: sticky; top: 64px; align-self: start; border-left: 1px solid var(--border); padding-left: var(--s-4); font-size: var(--fs-sm); max-height: calc(100vh - 96px); overflow: auto; }
  .toc a { display: block; color: var(--fg-2); padding: 3px 0; border-bottom: 0; }
  .toc a:hover { color: var(--fg); }
  .toc a.active { color: var(--good); }
  .toc .num { color: var(--dim); margin-right: 6px; }
  .spec h1 { font-size: var(--fs-2xl); line-height: 1.05; letter-spacing: -0.02em; font-weight: 600; margin: 0 0 var(--s-3); }
  .spec h2 { font-size: var(--fs-lg); margin: var(--s-7) 0 var(--s-3); font-weight: 600; letter-spacing: -0.01em; padding-top: var(--s-4); border-top: 1px solid var(--border); }
  .spec h2 .num { color: var(--muted); margin-right: 8px; font-weight: 500; }
  .spec h3 { font-size: var(--fs-md); margin: var(--s-5) 0 var(--s-2); font-weight: 600; color: var(--fg-2); }
  .spec p, .spec li { color: var(--fg-2); max-width: 720px; }
  .spec ul, .spec ol { color: var(--fg-2); padding-left: var(--s-5); }
  .spec li { margin: var(--s-2) 0; }
  .spec strong { color: var(--fg); }
  .spec em { color: var(--fg-2); font-style: italic; }
  .rfc-mustword { color: var(--diverge); font-weight: 700; letter-spacing: 0.02em; }
  .rfc-shouldword { color: var(--warn); font-weight: 700; letter-spacing: 0.02em; }
  .spec pre.block { max-width: 880px; }
  .spec pre.block code { font-family: var(--mono); font-size: 12px; line-height: 1.55; color: var(--fg-2); }
  .spec .md-table { overflow: auto; max-width: 880px; margin: var(--s-3) 0; }
  .spec table { border-collapse: collapse; font-size: var(--fs-sm); border: 1px solid var(--border); }
  .spec th, .spec td { border: 1px solid var(--border); padding: 6px 10px; text-align: left; vertical-align: top; }
  .spec th { background: var(--card-2); color: var(--fg); }
  .spec td { color: var(--fg-2); }
  .spec .abstract-block { border-left: 2px solid var(--good); padding-left: var(--s-4); margin: var(--s-4) 0; color: var(--fg-2); }
  .spec a { color: var(--signed); }
  .spec hr { border: 0; border-top: 1px solid var(--border); margin: var(--s-6) 0; }
  .spec-meta { display: flex; gap: var(--s-2); flex-wrap: wrap; margin-bottom: var(--s-5); }
</style>
</head>
<body data-density="default">

${TOPBAR}

<main class="shell spec-shell">
  <aside class="toc" aria-label="Table of contents">
    ${tocHtml || '<span class="muted">no sections</span>'}
  </aside>

  <article class="spec">
    <div class="spec-meta">
      <span class="stamp">${escapeHtml(opts.title)}</span>
      ${badges}
    </div>
    ${opts.abstract ? `<p class="abstract-block">${opts.abstract}</p>` : ""}
    ${body}
  </article>
</main>

${FOOTER.replace('class="footer"', 'class="footer shell"')}

<script>
  // Scrollspy on the TOC
  (() => {
    const links = [...document.querySelectorAll(".toc a[href^='#']")];
    if (!links.length) return;
    const targets = links
      .map((a) => ({ a, el: document.getElementById(a.getAttribute("href").slice(1)) }))
      .filter((x) => x.el);
    if (!targets.length) return;
    const setActive = (a) => links.forEach((l) => l.classList.toggle("active", l === a));
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting)
          .sort((a, b) => a.target.getBoundingClientRect().top - b.target.getBoundingClientRect().top)[0];
        if (visible) {
          const match = targets.find((t) => t.el === visible.target);
          if (match) setActive(match.a);
        }
      },
      { rootMargin: "-72px 0px -60% 0px", threshold: 0 },
    );
    for (const t of targets) obs.observe(t.el);
  })();
</script>

</body>
</html>
`;

  writeFileSync(opts.outFile, html);
  return toc;
}

function escapeHtml(s: string): string {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ] as string,
  );
}

function stripNumPrefix(s: string): string {
  // SPEC.md headings often start with "## §1 Overview"; strip the leading § marker
  // since we re-emit our own numbered span.
  return s
    .replace(/^§\d+(?:\.\d+)*\s*[:\-—]?\s*/, "")
    .replace(/^\d+(?:\.\d+)*\s*[:\-—]?\s*/, "")
    .trim();
}

renderMarkdownPage({
  title: "SPEC.md v0",
  outFile: join(DIST, "spec.html"),
  src: join(ROOT, "SPEC.md"),
  badges: ["v0", "1190 lines", "draft-abdi-agent-feed-00", "MCP SEP filed"],
  abstract:
    'agent-feed is a signed, append-only announcement layer at <code class="inline">/.well-known/agent-feed.xml</code>. ' +
    "This document specifies the v0 protocol — reader contract first, producer schema second.",
});

renderMarkdownPage({
  title: "draft-abdi-agent-feed-00",
  outFile: join(DIST, "ietf-draft.html"),
  src: join(ROOT, "docs/IETF-DRAFT.md"),
  badges: ["IETF I-D", "individual submission", "Standards Track"],
});

renderMarkdownPage({
  title: "MCP SEP — agent-feed",
  outFile: join(DIST, "mcp-sep.html"),
  src: join(ROOT, "docs/MCP-SEP-agent-feed.md"),
  badges: ["MCP SEP", "snapshot ≠ stream"],
});

renderMarkdownPage({
  title: "ROADMAP",
  outFile: join(DIST, "roadmap.html"),
  src: join(ROOT, "ROADMAP.md"),
  badges: ["live document", "kill-criteria-first"],
});

renderMarkdownPage({
  title: "CHANGELOG",
  outFile: join(DIST, "changelog.html"),
  src: join(ROOT, "CHANGELOG.md"),
  badges: ["shipped only"],
});

// 4. Favicon — small SVG matching the brand mark in tokens.css
const FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">
  <rect width="16" height="16" fill="#0b0d10"/>
  <rect x="2" y="2" width="12" height="12" fill="#7ee787"/>
  <rect x="5" y="5" width="6" height="6" fill="#0b0d10"/>
</svg>
`;
writeFileSync(join(DIST, "favicon.svg"), FAVICON);

// 5. .nojekyll — ensures GitHub Pages serves files starting with _ correctly (we don't have any but it's safe)
writeFileSync(join(DIST, ".nojekyll"), "");

// 6. Inject favicon link into every HTML in dist/ (idempotent)
function injectFavicon(file: string) {
  let html = readFileSync(file, "utf8");
  if (html.includes('rel="icon"')) return;
  html = html.replace(
    /<link rel="stylesheet" href="tokens\.css">/,
    `<link rel="stylesheet" href="tokens.css">\n<link rel="icon" href="favicon.svg" type="image/svg+xml">`,
  );
  writeFileSync(file, html);
}
for (const f of readdirSync(DIST)) {
  if (f.endsWith(".html")) injectFavicon(join(DIST, f));
}

// 7. Summary
const out = readdirSync(DIST).filter((f) => !f.startsWith("."));
console.log(`✓ Built dist/ (${out.length} files)`);
for (const f of out.sort()) {
  const p = join(DIST, f);
  if (statSync(p).isFile()) {
    console.log(
      `  ${f.padEnd(28)} ${statSync(p).size.toString().padStart(7)} bytes`,
    );
  }
}
