/**
 * index — the lifecycle dashboard (SEAM-9).
 *
 * Reads the repo's JSON catalog (docs/catalog.json, written by `htw register
 * --all`) and emits a SELF-CONTAINED docs/index.html: docs grouped into
 * lifecycle sections (Idea / Scoping / Active / Done / Archive), each entry
 * carrying a monochrome segmented stage bar, linking into its rendered doc. This
 * is the non-Homebase equivalent of Homebase's React /docs SPA — no React, no
 * Convex, no Vite, no framework: one file any static host can serve.
 *
 * It reuses the SAME theme.css the renderer inlines into every doc (honoring the
 * config.doc.themeFile / themeTokens overrides and the per-repo overlay), so the
 * dashboard matches the docs it links to — gorgeous for free, dark-mode included
 * (fonts are base64-inlined inside theme.css, so the page stays offline-clean).
 *
 * Links are computed RELATIVE to the docs/ directory (e.g. prds/<slug>/index.html)
 * so they resolve both under `htw serve` / a static host AND when the file is
 * opened directly.
 *
 * Node ESM, built-ins only.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { loadConfig, PACKAGE_ROOT } from "../config.mjs";
import { loadStages } from "../stages.mjs";

// Lifecycle -> dashboard section. The five canonical sections, in lifecycle
// order. Frontmatter `lifecycle` is validated to active|scoping|idea|archive|
// implemented; aliases are tolerated so a hand-set status still lands sensibly.
const SECTION_ORDER = ["Idea", "Scoping", "Active", "Done", "Archive"];
const LIFECYCLE_SECTION = {
  idea: "Idea",
  scoping: "Scoping",
  draft: "Scoping",
  active: "Active",
  "in execution": "Active",
  executing: "Active",
  implemented: "Done",
  done: "Done",
  complete: "Done",
  completed: "Done",
  shipped: "Done",
  archive: "Archive",
  archived: "Archive",
};

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
function escAttr(s) {
  return esc(s).replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------------------
// theme (mirrors doc-kit's resolution so the dashboard matches the docs)
// ---------------------------------------------------------------------------

function resolveThemePath(doc, root) {
  if (doc.themeFile) return isAbsolute(doc.themeFile) ? doc.themeFile : join(root, doc.themeFile);
  const overlayTheme = join(root, doc.overlayDir ?? ".agents/skill-config/doc", "templates", "theme.css");
  if (existsSync(overlayTheme)) return overlayTheme;
  return join(PACKAGE_ROOT, "templates", "theme.css");
}
function resolveThemeTokens(doc, root) {
  if (doc.themeFile || !doc.themeTokens) return null;
  const abs = isAbsolute(doc.themeTokens) ? doc.themeTokens : join(root, doc.themeTokens);
  return existsSync(abs) ? abs : null;
}
function themeCss(doc, root) {
  const base = readFileSync(resolveThemePath(doc, root), "utf8");
  const tokens = resolveThemeTokens(doc, root);
  if (!tokens) return base;
  return `${base}\n\n/* === config.doc.themeTokens override (base + :root patch) === */\n${readFileSync(tokens, "utf8")}\n`;
}

// ---------------------------------------------------------------------------
// stage bar (same markup/classes the renderer emits, so theme.css styles it)
// ---------------------------------------------------------------------------

function makeStage(stages) {
  const sequence = stages.sequence;
  const aliases = stages.aliases;
  function stageIndex(stage) {
    if (!stage) return -1;
    const raw = String(stage).trim().toLowerCase();
    for (const k of [raw, raw.replace(/\s*\([^)]*\)\s*$/, "").trim(), raw.replace(/[_-]+/g, " ").trim()]) {
      if (!k) continue;
      if (k in aliases) return aliases[k];
      const i = sequence.findIndex((s) => s.toLowerCase() === k);
      if (i !== -1) return i;
    }
    return -1;
  }
  function renderStageBar(stage, fallback) {
    let idx = stageIndex(stage);
    if (idx < 0 && fallback != null) idx = stageIndex(fallback);
    if (idx < 0) return "";
    const total = sequence.length;
    const segs = sequence
      .map((_s, i) => `<i class="${i < idx ? "seg done" : i === idx ? "seg current" : "seg todo"}" aria-hidden="true"></i>`)
      .join("");
    const label = sequence[idx];
    return `<div class="stageline" role="group" aria-label="Stage ${idx + 1} of ${total}: ${escAttr(label)}"><span class="stagebar">${segs}</span><span class="stagestatus"><b>${esc(label)}</b><span class="stagestep">${idx + 1} / ${total}</span></span></div>`;
  }
  return { renderStageBar };
}

// ---------------------------------------------------------------------------
// entry -> card
// ---------------------------------------------------------------------------

// Link RELATIVE to docs/ so it works under a static host and via file://.
function entryLink(entry, indexDir, root) {
  if (entry.sourcePath) {
    const rel = relative(indexDir, resolve(root, entry.sourcePath));
    return rel.split(sep).join("/");
  }
  // Fall back to the server-absolute href, stripping a leading /docs/ so the
  // result is still relative to the dashboard's own directory.
  const href = String(entry.href || "");
  return href.replace(/^\/?docs\//, "");
}

function entryCard(entry, indexDir, root, stage) {
  const link = entryLink(entry, indexDir, root);
  const bar = stage.renderStageBar(entry.stage, entry.status || entry.lifecycle);
  const tags = Array.isArray(entry.tags) ? entry.tags : [];
  const chips = [...tags.map((t) => `<span class="chip">${esc(t)}</span>`)];
  if (entry.updatedAt) chips.push(`<span class="chip">${esc(entry.updatedAt)}</span>`);
  const next = entry.nextAction ? `<p class="small doc-next"><span class="label">Next</span> ${esc(entry.nextAction)}</p>` : "";
  const search = esc(
    ((entry.title || "") + " " + (entry.summary || "") + " " + tags.join(" ") + " " + (entry.lifecycle || "")).toLowerCase(),
  );
  return `<a class="card doc" href="${escAttr(link)}" data-search="${search}">
<div class="doc-head"><h3 class="doc-title">${esc(entry.title || entry.id)}</h3>${bar}</div>
${entry.summary ? `<p class="small">${esc(entry.summary)}</p>` : ""}
${next}
${chips.length ? `<div class="chips">${chips.join("")}</div>` : ""}
</a>`;
}

// Dashboard-only layout. Token-based (reads the theme's custom properties) so it
// rides the same palette + dark mode; the visual system stays owned by theme.css.
const DASH_CSS = `
.dash-lede{color:var(--muted);margin:6px 0 0}
.section{margin-top:40px}
.section-head{display:flex;align-items:baseline;gap:10px;border-bottom:1px solid var(--line);padding-bottom:8px}
.section-head h2{margin:0;border:0}
.section-count{color:var(--muted);font-size:13px;font-variant-numeric:tabular-nums}
.docs{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px;margin-top:16px}
a.card.doc{display:flex;flex-direction:column;gap:8px;text-decoration:none;color:var(--fg)}
a.card.doc:hover{color:var(--fg)}
.doc-head{display:flex;flex-direction:column;gap:8px}
.doc-title{margin:0;color:var(--fg)}
a.card.doc:hover .doc-title{color:var(--accent)}
.doc .stageline{margin-top:0}
.doc-next .label{color:var(--muted)}
.dash-empty{margin-top:40px;color:var(--muted)}
`;

// ---------------------------------------------------------------------------
// run
// ---------------------------------------------------------------------------

const PACKET_ROLE_LABEL = { explainer: "Explainers", prd: "PRDs", reference: "Reference", doc: "Docs" };

// Packets are declared by docs/packets/<slug>/packet.json. The navigator surfaces
// them as a top section so a high-level goal's whole doc set reads as one unit.
function loadPackets(root, doc) {
  const dir = join(root, doc.packetsDir || "docs/packets");
  const out = [];
  if (!existsSync(dir)) return out;
  for (const slug of readdirSync(dir)) {
    const mf = join(dir, slug, "packet.json");
    if (!existsSync(mf)) continue;
    try {
      const p = JSON.parse(readFileSync(mf, "utf8"));
      p.slug = p.slug || slug;
      p.docs = Array.isArray(p.docs) ? p.docs : [];
      out.push(p);
    } catch {
      /* skip a malformed manifest rather than crash the whole dashboard */
    }
  }
  out.sort((a, b) => (b.canonical ? 1 : 0) - (a.canonical ? 1 : 0));
  return out;
}

function packetPageHtml(p, byId, root, theme, brand) {
  const pageDir = join(root, "docs", "packets", p.slug);
  const groups = {};
  for (const d of p.docs) (groups[d.role || "doc"] = groups[d.role || "doc"] || []).push(d);
  const order = ["explainer", "prd", "reference", "doc"];
  const sections = order
    .filter((r) => groups[r])
    .map((r) => {
      const items = groups[r]
        .map((d) => {
          const e = byId.get(d.ref);
          if (!e) return `<li>${esc(d.ref)} <span class="chip">unregistered</span></li>`;
          const href = entryLink(e, pageDir, root);
          return `<li><a href="${escAttr(href)}">${esc(e.title || d.ref)}</a>${e.summary ? ` — <span class="small">${esc(e.summary)}</span>` : ""}</li>`;
        })
        .join("");
      return `<section class="section"><div class="section-head"><h2>${PACKET_ROLE_LABEL[r] || r}</h2><span class="section-count">${groups[r].length}</span></div><ul class="packet-docs">${items}</ul></section>`;
    })
    .join("\n");
  const canon = p.canonical ? `<span class="pk-canon">canonical</span>` : "";
  const title = esc(p.title || p.slug);
  const body = `<header>
<a class="back" href="../../index.html">&larr; Docs</a>
<div class="navpacket-h"><h1>◰ ${title}</h1>${canon}</div>
${p.goal ? `<p class="lede">${esc(p.goal)}</p>` : ""}
${p.summary ? `<p class="small">${esc(p.summary)}</p>` : ""}
</header>
${sections}`;
  return `<!doctype html>
<html lang="en" data-doc-kind="packet" data-doc-title="${escAttr(p.title || p.slug)}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title} — packet</title>
<style>
${theme}
${DASH_CSS}
</style>
</head>
<body>
<main>
${body}
</main>
</body>
</html>
`;
}

function renderPacketsSection(packets, byId, indexDir, root) {
  const cards = packets
    .map((p) => {
      const groups = {};
      for (const d of p.docs) (groups[d.role || "doc"] = groups[d.role || "doc"] || []).push(d);
      const order = ["explainer", "prd", "reference", "doc"];
      const roles = order
        .filter((r) => groups[r])
        .map((r) => {
          const lis = groups[r]
            .map((d) => {
              const e = byId.get(d.ref);
              const title = e ? e.title || d.ref : d.ref;
              if (!e) return `<li>${esc(title)} <span class="chip">unregistered</span></li>`;
              return `<li><a href="${escAttr(entryLink(e, indexDir, root))}">${esc(title)}</a></li>`;
            })
            .join("");
          return `<div class="nav-role"><div class="nav-role-h">${PACKET_ROLE_LABEL[r] || r}</div><ul>${lis}</ul></div>`;
        })
        .join("");
      const canon = p.canonical ? `<span class="pk-canon">canonical</span>` : "";
      return `<article class="card navpacket"><div class="navpacket-h"><h3><a href="${escAttr("packets/" + p.slug + "/")}">◰ ${esc(p.title || p.slug)}</a></h3>${canon}</div>${p.goal ? `<p class="small">${esc(p.goal)}</p>` : ""}<div class="nav-roles">${roles}</div></article>`;
    })
    .join("\n");
  return `<section class="section"><div class="section-head"><h2>Packets</h2><span class="section-count">${packets.length}</span></div><div class="docs">${cards}</div></section>`;
}

const FILTER_SCRIPT = `<script>
(function(){
  var q=document.querySelector('.navsearch'); if(!q) return;
  var cards=[].slice.call(document.querySelectorAll('a.card.doc'));
  q.addEventListener('input',function(){
    var v=q.value.trim().toLowerCase();
    cards.forEach(function(c){
      c.style.display = !v || (c.getAttribute('data-search')||'').indexOf(v)>=0 ? '' : 'none';
    });
    [].slice.call(document.querySelectorAll('.section')).forEach(function(sec){
      if(!sec.querySelector('a.card.doc')) return; // leave the Packets section alone
      var any=[].slice.call(sec.querySelectorAll('a.card.doc')).some(function(c){return c.style.display!=='none';});
      sec.style.display=any?'':'none';
    });
  });
})();
</script>`;

export async function run({ root, args }) {
  const config = loadConfig(root);
  const doc = config.doc || {};
  const catalogPath = doc.catalogPath || "docs/catalog.json";

  if (!catalogPath.endsWith(".json")) {
    process.stderr.write(
      `htw index: requires a JSON catalog — config.doc.catalogPath must end in .json (got "${catalogPath}").\n` +
        `The dashboard reads the JSON catalog written by 'htw register --all'.\n`,
    );
    return 1;
  }

  const catalogAbs = join(root, catalogPath);
  if (!existsSync(catalogAbs)) {
    process.stderr.write(`htw index: catalog not found at ${catalogPath}. Run 'htw register --all' first.\n`);
    return 1;
  }

  let entries;
  try {
    entries = JSON.parse(readFileSync(catalogAbs, "utf8"));
  } catch (e) {
    process.stderr.write(`htw index: ${catalogPath} is not valid JSON — ${e.message}\n`);
    return 1;
  }
  if (!Array.isArray(entries)) {
    process.stderr.write(`htw index: ${catalogPath} must be a JSON array of catalog entries.\n`);
    return 1;
  }

  const stage = makeStage(loadStages(config, root));
  const theme = themeCss(doc, root);
  const brand = config.brandName || "Docs";
  // Avoid the redundant "Docs — Docs" when the brand IS the default "Docs".
  const isDefaultBrand = brand.trim().toLowerCase() === "docs";
  const pageTitle = isDefaultBrand ? "Docs" : `${brand} — Docs`;
  const heading = isDefaultBrand ? "Docs" : `${brand} docs`;

  // The dashboard lives at docs/index.html; links are relative to its directory.
  const outAbs = join(root, "docs", "index.html");
  const indexDir = dirname(outAbs);
  const byId = new Map();
  for (const e of entries) if (e && e.id != null) byId.set(e.id, e);
  const packets = loadPackets(root, doc);
  for (const p of packets) {
    const pageDir = join(root, "docs", "packets", p.slug);
    mkdirSync(pageDir, { recursive: true });
    writeFileSync(join(pageDir, "index.html"), packetPageHtml(p, byId, root, theme, brand));
  }

  // Bucket entries into the canonical sections; unknown lifecycles fall into an
  // "Other" bucket rendered only when non-empty (never silently dropped).
  const buckets = new Map(SECTION_ORDER.map((s) => [s, []]));
  buckets.set("Other", []);
  for (const e of entries) {
    if (!e || typeof e !== "object") continue;
    const key = String(e.lifecycle || e.status || "").trim().toLowerCase();
    const section = LIFECYCLE_SECTION[key] || "Other";
    (buckets.get(section) || buckets.get("Other")).push(e);
  }

  const sectionsHtml = [...SECTION_ORDER, "Other"]
    .filter((name) => (buckets.get(name) || []).length > 0)
    .map((name) => {
      const items = buckets.get(name);
      const cards = items.map((e) => entryCard(e, indexDir, root, stage)).join("\n");
      return `<section class="section" data-section="${escAttr(name)}">
<div class="section-head"><h2>${esc(name)}</h2><span class="section-count">${items.length}</span></div>
<div class="docs">
${cards}
</div>
</section>`;
    })
    .join("\n");

  const total = entries.length;
  const body = sectionsHtml || `<p class="dash-empty">No docs registered yet. Render a source and run <code>htw register --all</code>.</p>`;

  const html = `<!doctype html>
<html lang="en" data-doc-kind="index">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(pageTitle)}</title>
<style>
${theme}
${DASH_CSS}
</style>
</head>
<body>
<main>
<header>
<h1>${esc(heading)}</h1>
<p class="dash-lede">${total} ${total === 1 ? "doc" : "docs"} across the How To Work lifecycle.</p>
<input class="navsearch" type="search" placeholder="Search docs…" aria-label="Search docs" autocomplete="off" />
</header>
${packets.length ? renderPacketsSection(packets, byId, indexDir, root) : ""}
${body}
${FILTER_SCRIPT}
</main>
</body>
</html>
`;

  mkdirSync(indexDir, { recursive: true });
  writeFileSync(outAbs, html);
  process.stdout.write(`wrote docs/index.html (${total} ${total === 1 ? "doc" : "docs"})\n`);
  return 0;
}
