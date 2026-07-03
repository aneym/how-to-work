#!/usr/bin/env node
/**
 * doc-kit — Homebase bot-agent doc generator.
 *
 * Turns semantic `.doc.md` source (JSON frontmatter + :::blocks + @tab markers) into native
 * Homebase HTML review surfaces, keeps src/modules/docs/catalog.ts in sync, and verifies the
 * result. The visual system is owned by .agents/skill-config/doc/templates/theme.css and inlined
 * into every generated doc. Agents write semantics; this script owns the chrome.
 *
 *   node scripts/doc-kit.mjs contract
 *   node scripts/doc-kit.mjs new --kind <report|working-doc|prd> --slug <slug> [--title "..."]
 *   node scripts/doc-kit.mjs render <source.doc.md ...| --all>
 *   node scripts/doc-kit.mjs register <source.doc.md ...| --all>
 *   node scripts/doc-kit.mjs verify <source.doc.md ...| --all>
 *
 * Node ESM, built-ins only.
 */
import {
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
  mkdirSync,
  statSync,
} from "node:fs";
import { dirname, join, isAbsolute, relative, sep } from "node:path";
import { loadConfig, PACKAGE_ROOT } from "./config.mjs";
import { loadStages } from "./stages.mjs";

const ROOT = process.cwd();

// SEAM-2: these were hardcoded module-level consts. They are now resolved from
// the per-repo config in configure() once ROOT is known. Defaults (in config.mjs
// BUILTIN_DEFAULTS) EQUAL the original Homebase hardcodes, so output never
// regresses when a repo ships no config. They stay `let` because configure()
// assigns them before any command runs.
let OVERLAY_DIR;
let THEME_PATH;
let THEME_TOKENS_PATH;
let CATALOG_PATH;
let SOURCES_DIR;
let PRDS_DIR;
let PLANS_DIR;
let DOCS_INDEX_ROUTE;
let BACK_LINK;
let PACKETS_DIR;
let BRAND_NAME;

// SEAM-1: the lifecycle is no longer read eagerly from the consuming repo's
// src/lib/stages.json (which ENOENT-crashed every non-Homebase repo at import).
// configure() loads it via stages.mjs — inline default unless config.doc.stagesPath
// overrides — into these lets, used by stageIndex()/renderStageBar() at run time.
let STAGE_SEQUENCE;
let STAGE_ALIASES;
// answerGate.mode gates the live "Submit to agent" button. "none" (or absent) =
// no live gate (static host / no agent listening) -> render Copy-answers only, so
// the doc never shows a button that posts into the void. "local"/"backend" show it.
let GATE_MODE;

// Resolve every config-driven path/route once ROOT is known, then load the
// lifecycle. Called from main before dispatch. No algorithmic change: with no
// repo config, every value equals the prior Homebase hardcode.
function configure() {
  const config = loadConfig(ROOT);
  const doc = config.doc || {};
  OVERLAY_DIR = doc.overlayDir ?? ".agents/skill-config/doc";
  CATALOG_PATH = doc.catalogPath ?? "src/modules/docs/catalog.ts";
  SOURCES_DIR = doc.sourcesDir ?? "docs/sources";
  PRDS_DIR = doc.prdsDir ?? "docs/prds";
  PLANS_DIR = doc.plansDir ?? "docs/plans";
  DOCS_INDEX_ROUTE = doc.docsIndexRoute ?? "/docs";
  BACK_LINK = `<a class="back" href="${DOCS_INDEX_ROUTE}">&larr; Docs</a>`;
  PACKETS_DIR = doc.packetsDir ?? "docs/packets";
  BRAND_NAME = config.brandName || "";
  THEME_PATH = resolveThemePath(doc);
  THEME_TOKENS_PATH = resolveThemeTokensPath(doc);

  const stages = loadStages(config, ROOT);
  STAGE_SEQUENCE = stages.sequence;
  STAGE_ALIASES = stages.aliases;
  GATE_MODE = (config.answerGate && config.answerGate.mode) || "none";
  return config;
}

// Two-tier theme override, resolved here (no engine fork; every component reads
// CSS custom properties, so the override is pure config). Precedence:
//   1. config.doc.themeFile  — FULL REPLACE: inline that CSS verbatim (Homebase
//      keeps its orange theme.css this way; payme-atlas could point at its
//      existing brand CSS). themeTokens is ignored when themeFile is set.
//   2. base + config.doc.themeTokens — TOKEN PATCH: the bundled (or repo-overlay)
//      base theme.css concatenated with a small repo-supplied :root{} block, so
//      a ~15-line patch re-skins the entire surface.
//   3. bundled default — the gorgeous warm-walnut theme shipped with the engine.
// Base path resolution for tiers 2/3: repo overlay theme if present (Homebase
// stays byte-identical), else the package theme (absolute — readText() honors
// isAbsolute per SEAM-4), so a bare repo with no overlay never crashes.
function resolveThemePath(doc) {
  if (doc.themeFile) return doc.themeFile;
  const overlayTheme = join(doc.overlayDir ?? ".agents/skill-config/doc", "templates", "theme.css");
  if (existsSync(join(ROOT, overlayTheme))) return overlayTheme;
  return join(PACKAGE_ROOT, "templates", "theme.css");
}

// The :root{} token patch (tier 2). Null when themeFile is set (full replace
// wins) or when no patch is configured / the file is missing — a stale config
// key must never crash a render. Returns the path string for readText(), which
// honors absolute vs ROOT-relative.
function resolveThemeTokensPath(doc) {
  if (doc.themeFile || !doc.themeTokens) return null;
  const abs = isAbsolute(doc.themeTokens) ? doc.themeTokens : join(ROOT, doc.themeTokens);
  return existsSync(abs) ? doc.themeTokens : null;
}

// Compose the final inlined theme CSS: base theme, plus the token patch appended
// when configured. The patch's later :root{} wins the cascade, re-skinning every
// component for free.
function themeCss() {
  const base = readText(THEME_PATH);
  if (!THEME_TOKENS_PATH) return base;
  return `${base}\n\n/* === config.doc.themeTokens override (base + :root patch) === */\n${readText(THEME_TOKENS_PATH)}\n`;
}

const KIND_REPORT = "report";
const KIND_WORKING = "working-doc";
const KIND_PRD = "prd";
const KINDS = [KIND_REPORT, KIND_WORKING, KIND_PRD];

const REQUIRED_FRONTMATTER = [
  "title",
  "kind",
  "slug",
  "date",
  "lifecycle",
  "summary",
  "tags",
  "stage",
  "nextAction",
];

const TAB_SCRIPT = `<script>
  const tabs = [...document.querySelectorAll(".tab")];
  const panels = [...document.querySelectorAll(".panel")];
  // Persist the active tab per-doc so a reload lands the reader back where they were.
  // Key is scoped by the stable doc slug (data-doc-source, set per render) and the
  // saved value is the tab's data-tab slug (stable across re-renders, not the index).
  const tabDocSlug =
    document.documentElement.getAttribute("data-doc-source") || location.pathname;
  const tabStoreKey = "htw-active-tab:" + tabDocSlug;
  function readSavedTab() {
    try {
      return localStorage.getItem(tabStoreKey) || "";
    } catch (e) {
      return "";
    }
  }
  function saveTab(id) {
    try {
      localStorage.setItem(tabStoreKey, id);
    } catch (e) {}
  }
  function activateTab(tab, persist) {
    tabs.forEach((t) => t.setAttribute("aria-selected", String(t === tab)));
    panels.forEach((p) => p.classList.toggle("active", p.id === tab.dataset.tab));
    if (persist !== false && tab.dataset.tab) saveTab(tab.dataset.tab);
  }
  function typingTarget(el) {
    return el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
  }
  tabs.forEach((tab) => tab.addEventListener("click", () => activateTab(tab)));
  document.addEventListener("keydown", (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || typingTarget(event.target)) return;
    if (!/^[1-9]$/.test(event.key)) return;
    const index = Number(event.key) - 1;
    if (!tabs[index]) return;
    event.preventDefault();
    activateTab(tabs[index]);
  });
  // Restore on load. Priority: URL hash (#tab=<slug-or-label>) > saved tab > default
  // (the first tab is already rendered active, so we only override when there's a match).
  (function restoreTab() {
    if (!tabs.length) return;
    function findTab(id) {
      if (!id) return null;
      var want = String(id).toLowerCase();
      return (
        tabs.find((t) => (t.dataset.tab || "").toLowerCase() === want) ||
        tabs.find((t) => (t.textContent || "").trim().toLowerCase() === want) ||
        null
      );
    }
    var hashMatch = /(?:^|[#&])tab=([^&]+)/.exec(location.hash || "");
    var hashId = hashMatch ? decodeURIComponent(hashMatch[1]) : "";
    var target = findTab(hashId) || findTab(readSavedTab());
    if (target && target.getAttribute("aria-selected") !== "true") {
      // Honor a hash deep-link without clobbering the saved tab; clicks still persist.
      activateTab(target, !hashId);
    }
  })();

  /* ----- nested (second-level) tabs, scoped per top-level tab ----- */
  (function () {
    var groups = [...document.querySelectorAll("[data-subtab-group]")];
    if (!groups.length) return;
    // Persist the active nested tab PER GROUP. The group is keyed by its parent
    // top-level tab slug, so restoring a parent tab also restores its last-active
    // nested tab: key = "htw-active-subtab:<docSlug>:<parentTabSlug>".
    function subStoreKey(parentSlug) {
      return "htw-active-subtab:" + tabDocSlug + ":" + parentSlug;
    }
    function readSavedSub(parentSlug) {
      try {
        return localStorage.getItem(subStoreKey(parentSlug)) || "";
      } catch (e) {
        return "";
      }
    }
    function saveSub(parentSlug, id) {
      try {
        localStorage.setItem(subStoreKey(parentSlug), id);
      } catch (e) {}
    }
    groups.forEach(function (group) {
      var parentSlug = group.getAttribute("data-subtab-group") || "";
      // Scope every query to THIS group so multiple nested groups never collide.
      var subtabs = [].slice.call(group.querySelectorAll(".subtab"));
      var subpanels = [].slice.call(group.querySelectorAll(".subpanel"));
      if (!subtabs.length) return;
      function activateSub(tab, persist) {
        var want = tab.getAttribute("data-subtab");
        subtabs.forEach(function (t) {
          t.setAttribute("aria-selected", String(t === tab));
        });
        subpanels.forEach(function (p) {
          p.classList.toggle(
            "active",
            p.getAttribute("data-subpanel") === want,
          );
        });
        if (persist !== false && want) saveSub(parentSlug, want);
      }
      subtabs.forEach(function (tab) {
        tab.addEventListener("click", function () {
          activateSub(tab);
        });
      });
      // Restore the last-active nested tab for this parent (no hash deep-link for
      // nested tabs; the first nested tab is already rendered active by default).
      var savedSub = readSavedSub(parentSlug);
      if (savedSub) {
        var match = subtabs.find(function (t) {
          return (t.getAttribute("data-subtab") || "") === savedSub;
        });
        if (match && match.getAttribute("aria-selected") !== "true")
          activateSub(match, false);
      }
    });
  })();

  /* ----- interactive question cards (How To Work review controls) ----- */
  (function () {
    var groups = document.querySelectorAll("[data-qstack]");
    if (!groups.length) return;
    var docKey = "hwq:" + location.pathname;
    var docTitle =
      document.documentElement.getAttribute("data-doc-title") ||
      document.title ||
      "this doc";
    function loadState() {
      try {
        return JSON.parse(localStorage.getItem(docKey) || "{}") || {};
      } catch (e) {
        return {};
      }
    }
    function saveState(s) {
      try {
        localStorage.setItem(docKey, JSON.stringify(s));
      } catch (e) {}
    }
    function numOf(qid) {
      var m = String(qid || "").match(/[0-9]+/);
      return m ? m[0] : String(qid || "");
    }
    function legacyCopy(text, done) {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.top = "-1000px";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      var ok = false;
      try {
        ok = document.execCommand("copy");
      } catch (e) {
        ok = false;
      }
      document.body.removeChild(ta);
      if (ok) {
        if (done) done();
      } else {
        window.prompt("Copy these answers:", text);
      }
    }
    function copyText(text, btn) {
      function flash() {
        if (!btn) return;
        var prev = btn.getAttribute("data-label") || btn.textContent;
        btn.setAttribute("data-label", prev);
        btn.textContent = "Copied ✓";
        btn.classList.add("copied");
        setTimeout(function () {
          btn.textContent = btn.getAttribute("data-label") || "Copy answers";
          btn.classList.remove("copied");
        }, 1500);
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(flash, function () {
          legacyCopy(text, flash);
        });
      } else {
        legacyCopy(text, flash);
      }
    }
    var state = loadState();
    groups.forEach(function (group) {
      var cards = [].slice.call(group.querySelectorAll("[data-qcard]"));
      var answerable = cards.filter(function (c) {
        return c.querySelector("[data-qactions]");
      });
      if (!answerable.length) return;
      var countEl = group.querySelector("[data-qcount]");
      var copyBtn = group.querySelector("[data-qcopy]");
      var clearBtn = group.querySelector("[data-qclear]");
      var submitBtn = group.querySelector("[data-qsubmit]");
      var askingBanner = group.querySelector("[data-qasking]");
      var lastSubmittedAt = 0;

      function isAnswered(card) {
        var s = state[card.getAttribute("data-qid")];
        if (!s) return false;
        var hasComment = !!(s.comment && s.comment.trim());
        // A typed comment alone is a custom answer; disapprove needs a comment;
        // approve stands on its own.
        if (!s.decision) return hasComment;
        if (s.decision === "disapprove") return hasComment;
        return true;
      }
      function hasAnyInput() {
        return answerable.some(function (card) {
          var s = state[card.getAttribute("data-qid")];
          return s && (s.decision || (s.comment && s.comment.trim()));
        });
      }
      function render() {
        var answered = 0;
        answerable.forEach(function (card) {
          var qid = card.getAttribute("data-qid");
          var s = state[qid] || {};
          var ap = card.querySelector('[data-decide="approve"]');
          var rj = card.querySelector('[data-decide="disapprove"]');
          if (ap) ap.setAttribute("aria-pressed", String(s.decision === "approve"));
          if (rj) rj.setAttribute("aria-pressed", String(s.decision === "disapprove"));
          var ta = card.querySelector("[data-qcomment]");
          if (ta && document.activeElement !== ta) ta.value = s.comment || "";
          var needsComment =
            s.decision === "disapprove" && !(s.comment && s.comment.trim());
          if (ta) ta.setAttribute("data-required", String(needsComment));
          var showComment =
            card.__showComment ||
            s.decision === "disapprove" ||
            !!(s.comment && s.comment.trim());
          if (ta) ta.hidden = !showComment;
          var cb = card.querySelector("[data-qcommentbtn]");
          if (cb) cb.setAttribute("aria-expanded", String(showComment));
          var done = isAnswered(card);
          if (done) answered++;
          card.setAttribute("data-state", done ? "answered" : "open");
          var tag = card.querySelector("[data-qtag]");
          if (tag)
            tag.textContent = done
              ? "answered"
              : card.getAttribute("data-qtagopen") || "open";
        });
        if (countEl)
          countEl.textContent = answered + " / " + answerable.length + " answered";
        if (copyBtn) copyBtn.disabled = answered === 0;
        if (submitBtn) submitBtn.disabled = answered === 0;
      }
      function buildPayload() {
        var lines = [];
        var shorthand = [];
        var n = 0;
        answerable.forEach(function (card) {
          if (!isAnswered(card)) return;
          n++;
          var qid = card.getAttribute("data-qid");
          var s = state[qid] || {};
          var title = card.getAttribute("data-qtitle") || "";
          var comment = (s.comment || "").trim();
          var flat = comment.replace(/\\s+/g, " ");
          if (s.decision === "approve") {
            lines.push(
              qid +
                " — " +
                title +
                ": APPROVE (accept recommendation)." +
                (comment ? " Note: " + comment : ""),
            );
            shorthand.push(comment ? numOf(qid) + "r — " + flat : numOf(qid) + "r");
          } else if (s.decision === "disapprove") {
            lines.push(qid + " — " + title + ": DISAPPROVE — " + comment);
            shorthand.push(numOf(qid) + " " + flat);
          } else {
            lines.push(qid + " — " + title + ": CUSTOM — " + comment);
            shorthand.push(numOf(qid) + " " + flat);
          }
        });
        var header =
          "Re: " +
          docTitle +
          " — answers to " +
          n +
          " of " +
          answerable.length +
          " questions";
        return (
          header +
          "\\n\\n" +
          lines.join("\\n") +
          "\\n\\nShorthand: " +
          shorthand.join("  |  ")
        );
      }
      answerable.forEach(function (card) {
        var qid = card.getAttribute("data-qid");
        [].slice
          .call(card.querySelectorAll("[data-decide]"))
          .forEach(function (btn) {
            btn.addEventListener("click", function () {
              var s = state[qid] || {};
              var d = btn.getAttribute("data-decide");
              s.decision = s.decision === d ? null : d;
              state[qid] = s;
              saveState(state);
              render();
              clearSubmittedReflection();
              if (s.decision === "disapprove") {
                var ta = card.querySelector("[data-qcomment]");
                if (ta) ta.focus();
              }
            });
          });
        var ta = card.querySelector("[data-qcomment]");
        if (ta) {
          ta.addEventListener("input", function () {
            var s = state[qid] || {};
            s.comment = ta.value;
            state[qid] = s;
            saveState(state);
            render();
            clearSubmittedReflection();
          });
        }
        var cbtn = card.querySelector("[data-qcommentbtn]");
        if (cbtn) {
          cbtn.addEventListener("click", function () {
            card.__showComment = !card.__showComment;
            render();
            if (card.__showComment) {
              var t = card.querySelector("[data-qcomment]");
              if (t) t.focus();
            }
          });
        }
      });
      if (copyBtn) {
        copyBtn.addEventListener("click", function () {
          if (copyBtn.disabled) return;
          copyText(buildPayload(), copyBtn);
        });
      }
      function buildStructured() {
        var out = [];
        answerable.forEach(function (card) {
          if (!isAnswered(card)) return;
          var qid = card.getAttribute("data-qid");
          var s = state[qid] || {};
          var comment = (s.comment || "").trim();
          out.push({
            id: qid,
            title: card.getAttribute("data-qtitle") || "",
            decision: s.decision || "custom",
            comment: comment,
          });
        });
        return out;
      }
      if (submitBtn) {
        submitBtn.addEventListener("click", function () {
          if (submitBtn.disabled) return;
          var f = window.fetch;
          if (!f) {
            submitBtn.textContent = "No transport";
            setTimeout(function () {
              submitBtn.textContent = "Submit to agent";
            }, 2000);
            return;
          }
          var body = JSON.stringify({
            doc: docTitle,
            docKey: location.pathname,
            total: answerable.length,
            answers: buildStructured(),
            payload: buildPayload(),
          });
          submitBtn.textContent = "Sending…";
          f("/api/hwq/submit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: body,
          }).then(
            function (r) {
              return r
                .json()
                .catch(function () {
                  return {};
                })
                .then(function (j) {
                  return { ok: !!(r && r.ok), body: j || {} };
                });
            },
          ).then(
            function (result) {
              var delivery = result.body && result.body.delivery;
              var retrying = delivery && delivery.status === "error";
              submitBtn.textContent = retrying
                ? "Saved, retrying"
                : result.ok
                  ? "Sent ✓"
                  : "Sent";
              submitBtn.classList.add("copied");
              setAsking(false); // optimistic: stop lighting up
              setTimeout(function () {
                submitBtn.classList.remove("copied");
                submitBtn.classList.add("done");
                submitBtn.textContent = retrying ? "Saved, retrying" : "Submitted ✓";
              }, 1800);
            },
            function () {
              submitBtn.textContent = "Submit failed";
              setTimeout(function () {
                submitBtn.textContent = "Submit to agent";
              }, 2200);
            },
          );
        });
      }
      function setAsking(on, prompt) {
        var groupEl = group;
        if (on) {
          groupEl.classList.add("asking");
          if (askingBanner) {
            askingBanner.hidden = false;
            var txt = askingBanner.querySelector("[data-qasking-text]");
            if (txt)
              txt.textContent =
                prompt && prompt.trim()
                  ? "The agent is asking: " + prompt.trim()
                  : "The agent is waiting for your answers — review and hit Submit.";
          }
        } else {
          groupEl.classList.remove("asking");
          if (askingBanner) askingBanner.hidden = true;
        }
      }
      function reflectSubmitted(ts) {
        lastSubmittedAt = ts || lastSubmittedAt;
        if (
          submitBtn &&
          !submitBtn.disabled &&
          !submitBtn.classList.contains("copied")
        ) {
          submitBtn.textContent = "Submitted ✓";
          submitBtn.classList.add("done");
        }
      }
      function clearSubmittedReflection() {
        if (submitBtn && submitBtn.classList.contains("done")) {
          submitBtn.classList.remove("done");
          submitBtn.textContent = "Submit to agent";
        }
      }
      var pollFetch = window.fetch;
      if (pollFetch && window.setInterval) {
        var statusUrl =
          "/api/hwq/status?key=" + encodeURIComponent(location.pathname);
        var checkStatus = function () {
          pollFetch(statusUrl)
            .then(function (r) {
              return r.json();
            })
            .then(
              function (s) {
                if (!s || !s.ok) return;
                setAsking(!!s.waiting, s.prompt);
                if (!s.waiting && s.delivery && s.delivery.status === "error") {
                  if (submitBtn && !submitBtn.classList.contains("copied")) {
                    submitBtn.textContent = "Saved, retrying";
                    submitBtn.classList.add("done");
                  }
                } else if (!s.waiting && s.hasSubmission)
                  reflectSubmitted(s.submittedAt);
              },
              function () {},
            );
        };
        checkStatus();
        window.setInterval(checkStatus, 3000);
      }
      if (clearBtn) {
        clearBtn.addEventListener("click", function () {
          if (hasAnyInput() && !window.confirm("Clear your answers on this doc?"))
            return;
          answerable.forEach(function (card) {
            delete state[card.getAttribute("data-qid")];
          });
          saveState(state);
          render();
        });
      }
      render();
    });
  })();
</script>`;

// ---------------------------------------------------------------------------
// small utilities
// ---------------------------------------------------------------------------

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Escape for an HTML attribute value (adds quote escaping). */
function escAttr(s) {
  return esc(s).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Allow only safe URL schemes; neutralize javascript:/data:/etc. */
function safeUrl(href) {
  const h = String(href ?? "").trim();
  if (/^(https?:|mailto:|tel:|#|\/|\.{0,2}\/)/i.test(h)) return h;
  if (/^[a-z][\w.+-]*:/i.test(h)) return "#"; // some other scheme -> drop
  return h; // bare relative path (e.g. state.json)
}

/** Neutralize the :::html escape hatch: it is for bespoke SVG diagrams, not scripts. */
function sanitizeRawHtml(html) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<script\b[^>]*\/?>/gi, "")
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "")
    .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, "")
    .replace(
      /((?:href|src|xlink:href)\s*=\s*)("|')\s*javascript:[^"']*\2/gi,
      "$1$2#$2",
    );
}

/** Inline markdown: **bold**, `code`, [text](href). Escapes HTML first. */
function inline(s) {
  // NUL-delimited placeholders: bare `E<n>`/`C<n>` tokens collided with real
  // prose (AC1, E2E, C4, EC2 …) and the restore passes rewrote it into
  // `<code>undefined</code>`. NUL can never appear in escaped source text (we
  // strip any stray one first), so these placeholders are collision-proof.
  let out = esc(s).replace(/\u0000/g, "");
  // Protect backslash-escaped punctuation (\$, \*, \_ …) so it neither triggers
  // emphasis nor keeps its backslash — restored as the literal char at the end.
  const escLit = [];
  out = out.replace(/\\([\\`*_{}\[\]()#+\-.!$~])/g, (_m, ch) => {
    escLit.push(ch);
    return `\u0000E${escLit.length - 1}\u0000`;
  });
  // Protect inline code so emphasis/link rules never reach inside it (snake_case,
  // a*b inside backticks must survive verbatim).
  const codeLit = [];
  out = out.replace(/`([^`]+?)`/g, (_m, c) => {
    codeLit.push(c);
    return `\u0000C${codeLit.length - 1}\u0000`;
  });
  out = out.replace(/\*\*([^*]+?)\*\*/g, (_m, c) => `<strong>${c}</strong>`);
  // Emphasis only at word boundaries, so intraword _ / * (identifiers, math) stay literal.
  out = out.replace(
    /(^|[\s(["'])\*(?!\s)([^*]+?)\*(?=[\s)\]"'.,;:!?]|$)/g,
    (_m, p, c) => `${p}<em>${c}</em>`,
  );
  out = out.replace(
    /(^|[\s(["'])_(?!\s)([^_]+?)_(?=[\s)\]"'.,;:!?]|$)/g,
    (_m, p, c) => `${p}<em>${c}</em>`,
  );
  out = out.replace(
    /\[([^\]]+?)\]\(([^)\s]+?)\)/g,
    (_m, t, h) => `<a href="${escAttr(safeUrl(h))}">${t}</a>`,
  );
  out = out.replace(/\u0000C(\d+)\u0000/g, (_m, i) => `<code>${codeLit[+i]}</code>`);
  out = out.replace(/\u0000E(\d+)\u0000/g, (_m, i) => escLit[+i]);
  return out;
}

function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function humanize(s) {
  return String(s ?? "")
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function readText(p) {
  // SEAM-4: honor absolute paths so a package-bundled theme (resolved against
  // PACKAGE_ROOT) inlines correctly; repo-relative paths still resolve against ROOT.
  return readFileSync(isAbsolute(p) ? p : join(ROOT, p), "utf8");
}

function die(msg) {
  console.error(`doc-kit: ${msg}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// source parsing
// ---------------------------------------------------------------------------

function parseSource(srcPath) {
  // Honor absolute paths (agents naturally pass them) — join(ROOT, abs) would
  // double the path and ENOENT-crash. Resolve like readText (SEAM-4), and turn
  // a missing file into a clean die() instead of an unhandled stack trace.
  const onDisk = isAbsolute(srcPath) ? srcPath : join(ROOT, srcPath);
  if (!existsSync(onDisk)) die(`${srcPath}: no such file`);
  const raw = readFileSync(onDisk, "utf8");
  const lines = raw.split("\n");
  if (lines[0].trim() !== "---")
    die(`${srcPath}: must start with a --- frontmatter fence`);
  let i = 1;
  const fmLines = [];
  while (i < lines.length && lines[i].trim() !== "---") {
    fmLines.push(lines[i]);
    i++;
  }
  if (i >= lines.length) die(`${srcPath}: unterminated frontmatter`);
  let data;
  try {
    // Tolerate trailing commas (formatters and agents add them; JSON.parse rejects them).
    const cleaned = fmLines.join("\n").replace(/,(\s*[}\]])/g, "$1");
    data = JSON.parse(cleaned);
  } catch (e) {
    die(`${srcPath}: frontmatter is not valid JSON — ${e.message}`);
  }
  const body = lines.slice(i + 1).join("\n");
  return { data, body, srcPath };
}

const LIFECYCLES = ["active", "scoping", "idea", "archive", "implemented"];

/** Returns a list of frontmatter problems (empty = valid). Guards the slug against path traversal. */
function validateFrontmatter(data) {
  const errs = [];
  if (data.redirectTo) {
    for (const k of ["title", "kind", "slug", "date"])
      if (!data[k]) errs.push(`missing/empty frontmatter "${k}"`);
    if (data.slug && !/^[a-z0-9][a-z0-9-]*$/.test(data.slug))
      errs.push(`slug must be kebab-case (got "${data.slug}")`);
    if (!/^(https?:|#|\/|\.{0,2}\/)/.test(String(data.redirectTo)))
      errs.push("redirectTo must be a URL or path");
    return errs;
  }
  for (const k of REQUIRED_FRONTMATTER)
    if (data[k] == null || data[k] === "")
      errs.push(`missing/empty frontmatter "${k}"`);
  if (data.kind && !KINDS.includes(data.kind))
    errs.push(`kind must be one of ${KINDS.join("|")}`);
  if (data.lifecycle && !LIFECYCLES.includes(data.lifecycle))
    errs.push(`lifecycle must be one of ${LIFECYCLES.join("|")}`);
  if (data.slug && !/^[a-z0-9][a-z0-9-]*$/.test(data.slug))
    errs.push(`slug must be kebab-case [a-z0-9-] (got "${data.slug}")`);
  if (data.id && !/^[a-z0-9][a-z0-9-]*$/.test(data.id))
    errs.push(`id must be kebab-case [a-z0-9-] (got "${data.id}")`);
  if (data.tags != null && !Array.isArray(data.tags))
    errs.push("tags must be an array");
  if (
    data.progress != null &&
    !(
      Number.isInteger(data.progress) &&
      data.progress >= 0 &&
      data.progress <= 100
    )
  )
    errs.push("progress must be an integer 0-100 or null");
  return errs;
}

/**
 * Tokenize a body region (already split out of any @tab) into nodes:
 *  {type:"h2",text} | {type:"block",name,opts,raw[]} | {type:"code",text} | {type:"prose",lines[]}
 */
function parseNodes(text) {
  const lines = text.split("\n");
  const nodes = [];
  let prose = [];
  const flushProse = () => {
    if (prose.length && prose.some((l) => l.trim() !== ""))
      nodes.push({ type: "prose", lines: prose });
    prose = [];
  };
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    const headingMatch = line.match(/^(#{2,4}) +(.*)$/);
    if (headingMatch) {
      flushProse();
      nodes.push({ type: "h" + headingMatch[1].length, text: headingMatch[2].trim() });
      i++;
    } else if (/^:::[A-Za-z]/.test(trimmed)) {
      flushProse();
      const m = trimmed.match(/^:::([A-Za-z][\w-]*)\s*(.*)$/);
      const name = m[1];
      let opts = {};
      const optStr = m[2].trim();
      const raw = [];
      if (optStr.startsWith("{")) {
        // formatter-merged openers like `:::rows {"variant":"phase"} 0. Foo :: Bar`.
        let depth = 0;
        let end = -1;
        let inStr = null;
        for (let k = 0; k < optStr.length; k++) {
          const ch = optStr[k];
          if (inStr) {
            if (ch === "\\") k++;
            else if (ch === inStr) inStr = null;
            continue;
          }
          if (ch === '"' || ch === "'") inStr = ch;
          else if (ch === "{") depth++;
          else if (ch === "}") {
            depth--;
            if (depth === 0) {
              end = k;
              break;
            }
          }
        }
        if (end !== -1) {
          try {
            opts = JSON.parse(
              optStr.slice(0, end + 1).replace(/,(\s*[}\]])/g, "$1"),
            );
          } catch {
            opts = {};
          }
          const trailing = optStr.slice(end + 1).trim();
          if (trailing) raw.push(trailing);
        }
      } else if (optStr) {
        raw.push(optStr); // no JSON opts — keep trailing text as first content line
      }
      i++;
      while (i < lines.length && lines[i].trim() !== ":::") {
        raw.push(lines[i]);
        i++;
      }
      i++; // skip closing :::
      nodes.push({ type: "block", name, opts, raw });
    } else if (/^```/.test(trimmed)) {
      flushProse();
      const raw = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i].trim())) {
        raw.push(lines[i]);
        i++;
      }
      i++; // skip closing fence
      nodes.push({ type: "code", text: raw.join("\n") });
    } else {
      prose.push(line);
      i++;
    }
  }
  flushProse();
  return nodes;
}

/** Split a body into ordered tab regions by @tab markers. Returns [{name, text}] plus loose text. */
function splitTabs(body) {
  const lines = body.split("\n");
  const regions = [];
  let current = { name: null, lines: [] };
  for (const line of lines) {
    // A top-level divider is `@tab Name` but NOT `@@tab Name` (the nested marker).
    const m = line.match(/^@tab\s+(.+)$/);
    if (m) {
      regions.push(current);
      current = { name: m[1].trim(), lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  regions.push(current);
  const loose = regions.find((r) => r.name === null);
  const named = regions
    .filter((r) => r.name !== null)
    .map((r) => ({ name: r.name, text: r.lines.join("\n") }));
  return { loose: loose ? loose.lines.join("\n") : "", named };
}

/**
 * Split ONE top-level tab region into nested tab panels by `@@tab <Name>` markers.
 * Returns null when the region contains no `@@tab` marker, so a region without
 * nested tabs renders exactly as before (no nested bar, no behavior change).
 * When present: text before the first `@@tab` is "loose" and joins the first
 * nested panel (mirrors splitTabs' loose-into-first-tab rule), so authors can
 * still write intro prose above the nested bar.
 */
function splitNestedTabs(text) {
  const lines = text.split("\n");
  if (!lines.some((l) => /^@@tab\s+.+$/.test(l))) return null;
  const regions = [];
  let current = { name: null, lines: [] };
  for (const line of lines) {
    const m = line.match(/^@@tab\s+(.+)$/);
    if (m) {
      regions.push(current);
      current = { name: m[1].trim(), lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  regions.push(current);
  const loose = regions.find((r) => r.name === null);
  const looseText = loose ? loose.lines.join("\n") : "";
  const named = regions.filter((r) => r.name !== null);
  if (!named.length) return null; // defensive: only the loose region -> no nesting
  return named.map((r, idx) => ({
    name: r.name,
    text:
      idx === 0 && looseText.trim()
        ? looseText + "\n" + r.lines.join("\n")
        : r.lines.join("\n"),
  }));
}

/**
 * Render the content of a single top-level tab. If it contains `@@tab` markers,
 * emit a nested (secondary) tab bar + nested panels scoped to this parent tab;
 * otherwise render the nodes flat exactly as before. `parentSlug` scopes the
 * nested group so the TAB_SCRIPT can persist the active nested tab per parent.
 */
// Attention-volume law: a tab that has grown past comfortable reading gets an
// in-tab section nav (anchor rail) generated from its ## sections, so long
// content is navigable instead of one raw scroll. Thresholds: 6+ sections
// always, or 3+ sections once the tab passes ~1200 words.
function withSectionNav(html) {
  const matches = [
    ...html.matchAll(/<section id="([^"]+)" data-doc-section="[^"]*">\n<h2>([\s\S]*?)<\/h2>/g),
  ];
  if (!matches.length) return html;
  const words = html.replace(/<[^>]*>/g, " ").split(/\s+/).filter(Boolean).length;
  if (!(matches.length >= 6 || (matches.length >= 3 && words >= 1200))) return html;
  // Anchors join with a newline (not "") so the nav degrades to a readable,
  // whitespace-separated list even in a repo whose overlay theme.css hasn't
  // caught up with a new engine release and doesn't style .secnav yet — the
  // default bundled theme still turns this into a proper flex/gap chip row.
  const links = matches
    .map((m) => `<a href="#${m[1]}">${m[2].replace(/<[^>]+>/g, "")}</a>`)
    .join("\n");
  return `<nav class="secnav" aria-label="On this tab">${links}</nav>\n${html}`;
}

function renderTabContent(text, parentSlug) {
  const nested = splitNestedTabs(text);
  if (!nested) return withSectionNav(renderNodes(parseNodes(text)));
  const bar = nested
    .map(
      (n, idx) =>
        `<button class="subtab" role="tab" aria-selected="${idx === 0 ? "true" : "false"}" data-subtab="${slugify(n.name)}">${esc(n.name)}</button>`,
    )
    .join("");
  const panels = nested
    .map(
      (n, idx) =>
        `<section id="${parentSlug}--${slugify(n.name)}" class="subpanel${idx === 0 ? " active" : ""}" role="tabpanel" data-subpanel="${slugify(n.name)}">\n${withSectionNav(renderNodes(parseNodes(n.text)))}\n</section>`,
    )
    .join("\n");
  return `<div class="subtabgroup" data-subtab-group="${parentSlug}"><div class="subtabs" role="tablist" aria-label="Nested sections">${bar}</div>${panels}</div>`;
}

// ---------------------------------------------------------------------------
// record parsing (questions / ledger)
// ---------------------------------------------------------------------------

function parseRecords(rawLines) {
  const records = [];
  let cur = null;
  for (const line of rawLines) {
    const start = line.match(/^\s*-\s+(\w[\w-]*)\s*:\s*(.*)$/);
    const cont = line.match(/^\s+(\w[\w-]*)\s*:\s*(.*)$/);
    if (start) {
      if (cur) records.push(cur);
      cur = {};
      cur[start[1]] = start[2].trim();
    } else if (cont && cur) {
      cur[cont[1]] = cont[2].trim();
    } else if (cur && line.trim()) {
      // continuation of previous value
      const keys = Object.keys(cur);
      if (keys.length) cur[keys[keys.length - 1]] += " " + line.trim();
    }
  }
  if (cur) records.push(cur);
  return records;
}

// ---------------------------------------------------------------------------
// block rendering
// ---------------------------------------------------------------------------

function isTableChunk(chunk) {
  return (
    chunk.length >= 2 &&
    chunk[0].includes("|") &&
    /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/.test(chunk[1])
  );
}
// Minimal GFM table: first row = header, second = --- separator (optional :align:),
// rest = body. Renders a real <table> instead of the literal-pipe paragraph the
// engine used to emit.
function renderTable(rows) {
  const cells = (line) =>
    line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
  const aligns = cells(rows[1]).map((c) => {
    const l = c.startsWith(":");
    const r = c.endsWith(":");
    return l && r ? "center" : r ? "right" : l ? "left" : "";
  });
  const sty = (i) => (aligns[i] ? ` style="text-align:${aligns[i]}"` : "");
  const thead = `<thead><tr>${cells(rows[0]).map((c, i) => `<th${sty(i)}>${inline(c)}</th>`).join("")}</tr></thead>`;
  const tbody = `<tbody>${rows.slice(2).map((r) => `<tr>${cells(r).map((c, i) => `<td${sty(i)}>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody>`;
  return `<table>${thead}${tbody}</table>`;
}
function renderProse(lines) {
  // group by blank lines into paragraphs / lists
  const chunks = [];
  let buf = [];
  for (const l of lines) {
    if (l.trim() === "") {
      if (buf.length) (chunks.push(buf), (buf = []));
    } else buf.push(l);
  }
  if (buf.length) chunks.push(buf);
  return chunks
    .map((chunk) => {
      if (isTableChunk(chunk)) return renderTable(chunk);
      if (chunk.every((l) => /^\s*-\s+/.test(l))) {
        return `<ul>${chunk.map((l) => `<li>${inline(l.replace(/^\s*-\s+/, ""))}</li>`).join("")}</ul>`;
      }
      if (chunk.every((l) => /^\s*\d+\.\s+/.test(l))) {
        return `<ol>${chunk.map((l) => `<li>${inline(l.replace(/^\s*\d+\.\s+/, ""))}</li>`).join("")}</ol>`;
      }
      return `<p>${inline(chunk.join(" "))}</p>`;
    })
    .join("\n");
}

function splitRow(line) {
  const idx = line.indexOf("::");
  if (idx === -1) return null;
  return [line.slice(0, idx).trim(), line.slice(idx + 2).trim()];
}

const TONE_CLASS = { green: "status", amber: "warn", red: "warn" };
const TONE_STYLE = { red: ' style="color:var(--red)"' };

function emphasis(value) {
  // leading [..] -> {span, rest}
  const m = value.match(/^\[([^\]]+)\]\s*(.*)$/);
  if (!m) return { span: "", rest: value };
  let inner = m[1];
  let tone = null;
  const tm = inner.match(/^(green|amber|red):\s*(.*)$/);
  if (tm) {
    tone = tm[1];
    inner = tm[2];
  } else {
    const k = inner.toLowerCase();
    if (/^(decided|done|recommended|resolved|accepted)/.test(k)) tone = "green";
    else if (/^(open|warn|caution|start|pending)/.test(k)) tone = "amber";
    else if (/^(risk|blocker|failed)/.test(k)) tone = "red";
    else tone = "green";
  }
  const cls = TONE_CLASS[tone] || "status";
  const style = TONE_STYLE[tone] || "";
  return {
    span: `<span class="${cls}"${style}>${inline(inner)}</span> `,
    rest: m[2],
  };
}

function renderCards(rawLines) {
  const cards = [];
  let cur = null;
  for (const line of rawLines) {
    const h = line.match(/^###\s+(.*)$/);
    if (h) {
      if (cur) cards.push(cur);
      cur = { title: h[1].trim(), body: [] };
    } else if (cur) {
      cur.body.push(line);
    }
  }
  if (cur) cards.push(cur);
  const inner = cards
    .map((c) => {
      const body = c.body.filter((l) => l.trim()).join(" ");
      return `<div class="card"><h3>${inline(c.title)}</h3>${body ? `<p>${inline(body)}</p>` : ""}</div>`;
    })
    .join("");
  return `<div class="grid">${inner}</div>`;
}

function renderResources(rawLines) {
  const rows = [];
  let parent = null;
  for (const line of rawLines) {
    if (!line.trim()) continue;
    const indented = /^\s{2,}\S/.test(line);
    const pair = splitRow(line.trim());
    // A bare line with no "::" is an unlinked parent label — plain text, and a
    // valid anchor for indented children. Previously these were silently
    // dropped (splitRow -> null -> continue), which orphaned the first child as
    // a top-level row and silently lost the rest. Only skip a bare line when it
    // is indented (a malformed child has no href to link).
    if (!pair && indented) continue;
    const [label, href] = pair || [line.trim(), ""];
    if (indented && parent) {
      parent.children.push({ label, href });
    } else {
      parent = { label, href, children: [] };
      rows.push(parent);
    }
  }
  const inner = rows
    .map((r) => {
      let value;
      if (r.href) value = `<a href="${esc(r.href)}">${inline(r.label)}</a>`;
      else if (r.children.length)
        value = r.children
          .map((c) => `<a href="${esc(c.href)}">${inline(c.label)}</a>`)
          .join(" · ");
      else value = inline(r.label);
      return `<div class="row"><div class="label">${inline(r.label)}</div><div>${value}</div></div>`;
    })
    .join("");
  return `<div class="rows">${inner}</div>`;
}

function renderQuestions(rawLines) {
  const records = parseRecords(rawLines);
  const open = records.filter((q) => !q.answer);
  const resolved = records.filter((q) => q.answer);
  const answerableCount = open.length;
  // One question card. Open cards get live controls; the comment box is collapsed
  // by default (most answers are a one-tap Approve) and reveals on Disapprove or
  // via the inline Comment toggle — that keeps the stack compact.
  const renderCard = (q) => {
    const id = q.id ? `<span class="qid">${esc(q.id)}.</span> ` : "";
    const tag = q.tag ? `<span class="qtag" data-qtag>${esc(q.tag)}</span>` : "";
    const question = q.question ? `<p class="qq">${inline(q.question)}</p>` : "";
    const rec = q.recommendation
      ? `<p class="qrec"><strong>Recommendation:</strong> ${inline(q.recommendation)}</p>`
      : "";
    const qidAttr = ` data-qcard data-qid="${escAttr(q.id || "")}"`;
    if (q.answer) {
      const ans = `<p class="qanswer"><strong>Answer:</strong> ${inline(q.answer)}</p>`;
      return `<article class="qcard"${qidAttr}><div class="qhead"><span class="qtitle">${id}${inline(q.title || "")}</span>${tag}</div>${question}${rec}${ans}</article>`;
    }
    const plainTitle = String(q.title || "")
      .replace(/\*\*/g, "")
      .replace(/`/g, "");
    const meta = ` data-qtitle="${escAttr(plainTitle)}" data-qtagopen="${escAttr(q.tag || "open")}"`;
    const controls = `<div class="qactions" data-qactions><button type="button" class="qbtn qapprove" data-decide="approve" aria-pressed="false">Approve</button><button type="button" class="qbtn qreject" data-decide="disapprove" aria-pressed="false">Disapprove</button><button type="button" class="qbtn qcommentbtn" data-qcommentbtn aria-expanded="false">Comment</button></div><textarea class="qcomment" data-qcomment rows="2" placeholder="Comment / custom answer…" hidden></textarea>`;
    return `<article class="qcard"${qidAttr}${meta}><div class="qhead"><span class="qtitle">${id}${inline(q.title || "")}</span>${tag}</div>${question}${rec}${controls}</article>`;
  };
  // Resolved questions always live in a collapsed <details> at the bottom — even
  // when open ones remain — since users rarely re-read settled decisions.
  const resolvedBlock = resolved.length
    ? `<details class="qresolved"><summary>${resolved.length} question${resolved.length === 1 ? "" : "s"} resolved &#10003;</summary><div class="qstack">${resolved.map(renderCard).join("")}</div></details>`
    : "";
  if (answerableCount === 0) return resolvedBlock;
  const openInner = open.map(renderCard).join("");
  // The live "Submit to agent" button only renders when a gate is wired
  // (answerGate.mode !== "none"). On a static host / no listening agent there is
  // no endpoint, so Copy-answers is the round-trip and a dead button is omitted.
  const liveGate = GATE_MODE && GATE_MODE !== "none";
  const submitBtn = liveGate
    ? `<button type="button" class="qsubmit" data-qsubmit disabled>Submit to agent</button>`
    : "";
  const bar = `<div class="qbar" data-qbar><span class="qcount" data-qcount>0 / ${answerableCount} answered</span><div class="qbar-actions"><button type="button" class="qclear" data-qclear>Clear</button><button type="button" class="qcopy" data-qcopy disabled>Copy answers</button>${submitBtn}</div></div>`;
  const banner = liveGate
    ? `<div class="qasking" data-qasking hidden><span class="qdot"></span><span data-qasking-text>The agent is waiting for your answers — review and hit Submit.</span></div>`
    : "";
  return `<div class="qreview" data-qstack>${banner}${bar}<div class="qstack">${openInner}</div></div>${resolvedBlock}`;
}
function renderLedgerRecords(records) {
  const renderEvent = (e) => {
    const body = e.body ? `<p>${inline(e.body)}</p>` : "";
    const who = e.who ? ` · ${esc(e.who)}` : "";
    return `<div class="event"><strong>${inline(e.title || "")}</strong>${body}<p class="small">${esc(e.when || "")}${who}</p></div>`;
  };
  // Attention-volume law: a long-lived ledger is an archive, not a read. Keep
  // the newest 3 days of events (records arrive reverse-chron) expanded and
  // roll everything older into one <details>. Undated events stay visible —
  // hiding what we can't date would silently bury information.
  const dayOf = (e) => {
    const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(e.when || ""));
    return m ? m[1] : null;
  };
  const days = [...new Set(records.map(dayOf).filter(Boolean))].sort().reverse();
  if (records.length <= 10 || days.length < 4)
    return `<div class="timeline">${records.map(renderEvent).join("")}</div>`;
  const keep = new Set(days.slice(0, 3));
  const recent = records.filter((e) => !dayOf(e) || keep.has(dayOf(e)));
  const older = records.filter((e) => dayOf(e) && !keep.has(dayOf(e)));
  const recentHtml = `<div class="timeline">${recent.map(renderEvent).join("")}</div>`;
  if (!older.length) return recentHtml;
  return `${recentHtml}<details class="tlmore"><summary>${older.length} earlier event${older.length === 1 ? "" : "s"} (before ${days[2]})</summary><div class="timeline">${older.map(renderEvent).join("")}</div></details>`;
}

function renderProgressBlock(opts, rawLines) {
  const percent = opts.percent;
  const note = opts.note || "";
  const bar =
    percent != null
      ? `<div class="bar" aria-label="${percent} percent complete"><div class="fill" style="width:${percent}%"></div></div>`
      : "";
  const overall = `<section class="card"><h3>Overall</h3>${bar}<p class="small" style="margin-top:8px">${inline(note)}</p></section>`;
  const cards = renderCards(rawLines);
  const hasCards = /<div class="card">/.test(cards);
  return (
    overall +
    (hasCards
      ? `<div class="grid" style="margin-top:12px">${cards.replace(/^<div class="grid">/, "").replace(/<\/div>$/, "")}</div>`
      : "")
  );
}

// Content-workspace status pill. A small colored chip authored in the .doc.md
// source ("drafted" until a piece moves) so a content doc is scannable at a
// glance. Tokens reused from the theme: drafted = muted/neutral (no color
// class), ready = accent, scheduled = amber/warning, posted = green/success.
// Unknown values fall back to the neutral "drafted" look so a typo never breaks.
const STATUS_PILL = {
  drafted: { label: "Drafted", cls: "" },
  ready: { label: "Ready", cls: "ready" },
  scheduled: { label: "Scheduled", cls: "scheduled" },
  posted: { label: "Posted", cls: "posted" },
};
function statusPill(value) {
  const key = String(value ?? "drafted")
    .trim()
    .toLowerCase();
  const def = STATUS_PILL[key] || STATUS_PILL.drafted;
  const cls = def.cls ? ` ${def.cls}` : "";
  return `<span class="statuspill${cls}" data-status="${escAttr(key)}">${esc(def.label)}</span>`;
}

// :::status {"label":"X thread","value":"scheduled"}  — standalone pill row, for
// when a status marker is wanted outside a :::copy panel (e.g. a heading line).
function renderStatusBlock(opts, raw) {
  const label = opts.label || raw.filter((l) => l.trim()).join(" ").trim();
  const labelHtml = label
    ? `<span class="statuslabel">${inline(label)}</span>`
    : "";
  return `<div class="statusrow">${labelHtml}${statusPill(opts.value)}</div>`;
}

// :::copy {"label":"X thread","status":"drafted"}  — a content-workspace panel:
// a header (label + optional status pill + Copy button) over the raw block text
// shown as readable, line-break-preserving prose. The Copy button copies the
// EXACT raw text (not the rendered HTML) via the inlined COPY_SCRIPT, which
// reads the byte-faithful payload off the panel's data-copy attribute.
function renderCopyBlock(opts, raw) {
  // Trim only leading/trailing blank lines; preserve interior blank lines and
  // every line break (this is post/thread text, not code).
  const lines = [...raw];
  while (lines.length && lines[0].trim() === "") lines.shift();
  while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
  const rawText = lines.join("\n");
  const label = opts.label || "Content";
  const pill = opts.status ? statusPill(opts.status) : "";
  // Visible body: escape for HTML but keep newlines (CSS white-space:pre-wrap on
  // .copybody renders them). The exact clipboard payload rides the data-copy
  // attribute (escAttr-encoded), so it round-trips verbatim regardless of what
  // the body contains — no </script> break-out, no DOM re-escaping.
  const bodyHtml = esc(rawText);
  const payload = escAttr(rawText);
  return `<div class="copyblock" data-copyblock data-copy="${payload}"><div class="copyhead"><span class="copylabel">${inline(label)}</span><div class="copymeta">${pill}<button type="button" class="copybtn" data-copybtn>Copy</button></div></div><div class="copybody">${bodyHtml}</div></div>`;
}

function renderBlock(node) {
  const { name, opts, raw } = node;
  switch (name) {
    case "callout": {
      const tone = opts.tone || "accent";
      const style = tone !== "accent" ? ` style="color:var(--${tone})"` : "";
      const strong = opts.strong
        ? `<strong${style}>${esc(opts.strong)}</strong> `
        : "";
      const body = inline(raw.filter((l) => l.trim()).join(" "));
      return `<div class="callout">${strong}${body}</div>`;
    }
    case "rows": {
      const cls = opts.variant === "phase" ? "row phase" : "row";
      const inner = raw
        .filter((l) => l.trim())
        .map((l) => {
          const pair = splitRow(l);
          if (!pair) return "";
          return `<div class="${cls}"><div class="label">${inline(pair[0])}</div><div>${inline(pair[1])}</div></div>`;
        })
        .join("");
      return `<div class="rows">${inner}</div>`;
    }
    case "decisions": {
      // Attention-volume law: a human should never wade through the full
      // decision log. Agent-call rows ("… (agent call, reversible)") always
      // collapse; author decisions keep only the newest 5 visible (rows are
      // appended chronologically, so the tail is the fresh context).
      const rows = raw
        .filter((l) => l.trim())
        .map((l) => splitRow(l))
        .filter(Boolean);
      const renderRow = ([label, value]) => {
        const { span, rest } = emphasis(value);
        return `<div class="row"><div class="label">${inline(label)}</div><div>${span}${inline(rest)}</div></div>`;
      };
      const isAgentCall = ([, value]) => /\bagent call\b/i.test(value);
      const MAX_VISIBLE = 5;
      let visible = rows.filter((r) => !isAgentCall(r)).slice(-MAX_VISIBLE);
      if (!visible.length) visible = rows.slice(-2); // all agent calls: keep the newest two
      const visibleSet = new Set(visible);
      const collapsed = rows.filter((r) => !visibleSet.has(r));
      const visibleHtml = `<div class="rows">${visible.map(renderRow).join("")}</div>`;
      if (!collapsed.length) return visibleHtml;
      const agentN = collapsed.filter(isAgentCall).length;
      const label = `${collapsed.length} more decision${collapsed.length === 1 ? "" : "s"}${agentN ? ` (${agentN} agent call${agentN === 1 ? "" : "s"})` : ""}`;
      return `${visibleHtml}<details class="dmore"><summary>${label}</summary><div class="rows">${collapsed.map(renderRow).join("")}</div></details>`;
    }
    case "cards":
      return renderCards(raw);
    case "copy":
      return renderCopyBlock(opts, raw);
    case "status":
      return renderStatusBlock(opts, raw);
    case "questions":
      return renderQuestions(raw);
    case "progress":
      return renderProgressBlock(opts, raw);
    case "ledger":
      return renderLedgerRecords(parseRecords(raw));
    case "resources":
      return renderResources(raw);
    case "html":
      return sanitizeRawHtml(raw.join("\n"));
    default:
      console.error(
        `doc-kit: unknown block :::${name} (passing through as note)`,
      );
      return `<p class="small">[unknown block: ${esc(name)}]</p>`;
  }
}

// Unique section anchor ids for the whole page (tabs can repeat section names).
// Reset per assemblePage so `render --all` docs don't leak counters into each other.
const SECTION_IDS = new Map();
function sectionAnchor(slug) {
  const n = (SECTION_IDS.get(slug) || 0) + 1;
  SECTION_IDS.set(slug, n);
  return n === 1 ? `s-${slug}` : `s-${slug}-${n}`;
}

/** Render a list of nodes, wrapping content under each ## into <section data-doc-section>. */
function renderNodes(nodes) {
  let html = "";
  let inSection = false;
  const closeSection = () => {
    if (inSection) {
      html += "\n</section>";
      inSection = false;
    }
  };
  for (const node of nodes) {
    if (node.type === "h2") {
      closeSection();
      html += `\n<section id="${sectionAnchor(slugify(node.text))}" data-doc-section="${slugify(node.text)}">\n<h2>${inline(node.text)}</h2>`;
      inSection = true;
    } else if (node.type === "h3" || node.type === "h4") {
      html += `\n<${node.type}>${inline(node.text)}</${node.type}>`;
    } else {
      let chunk = "";
      if (node.type === "prose") chunk = renderProse(node.lines);
      else if (node.type === "code")
        chunk = `<pre><code>${esc(node.text)}</code></pre>`;
      else if (node.type === "block") chunk = renderBlock(node);
      if (chunk) html += "\n" + chunk;
    }
  }
  closeSection();
  return html.trim();
}

// ---------------------------------------------------------------------------
// PRD auto-generation from state.json / ledger.jsonl
// ---------------------------------------------------------------------------

function readJsonMaybe(p) {
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

// state.json for a PRD source (null for non-PRDs / missing). state.json is the
// stage AUTHORITY everywhere — render, catalog, verify — with frontmatter as a
// derived mirror.
function stateForSource(src, data) {
  if (data.kind !== KIND_PRD) return null;
  const dir = dirname(isAbsolute(src) ? src : join(ROOT, src));
  return readJsonMaybe(join(dir, data.statePath || "state.json"));
}

// SEAM-1: the canonical How To Work lifecycle (sequence + aliases) is loaded in
// configure() via stages.mjs — the inline default unless config.doc.stagesPath
// overrides it — into module-level STAGE_SEQUENCE / STAGE_ALIASES. A PRD renders
// the stage bar by DEFAULT (opt out only via frontmatter "stageBar": false); its
// `stage` is matched (with aliases) to one of these and drawn as an elegant
// monochrome segmented bar + status text, in place of a progress %.
function stageIndex(stage) {
  if (!stage) return -1;
  const raw = String(stage).trim().toLowerCase();
  // Try verbatim, with a trailing parenthetical stripped ("draft prd (scoping)"),
  // and with underscores/dashes normalized to spaces (so a state.status like
  // "in_execution" resolves through the same alias table).
  for (const k of [
    raw,
    raw.replace(/\s*\([^)]*\)\s*$/, "").trim(),
    raw.replace(/[_-]+/g, " ").trim(),
  ]) {
    if (!k) continue;
    if (k in STAGE_ALIASES) return STAGE_ALIASES[k];
    const i = STAGE_SEQUENCE.findIndex((s) => s.toLowerCase() === k);
    if (i !== -1) return i;
  }
  return -1;
}
function renderStageBar(stage, fallback) {
  let idx = stageIndex(stage);
  // Self-heal: agents keep authoring free-form descriptive `stage` strings that
  // don't map to the canonical lifecycle (which would render a blank bar). When
  // that happens, fall back to the canonical position derived from the doc's
  // state.status so the header always renders a real stage.
  if (idx < 0 && fallback != null) idx = stageIndex(fallback);
  if (idx < 0) return null;
  const total = STAGE_SEQUENCE.length;
  const segs = STAGE_SEQUENCE.map((_s, i) => {
    const cls = i < idx ? "seg done" : i === idx ? "seg current" : "seg todo";
    return `<i class="${cls}" aria-hidden="true"></i>`;
  }).join("");
  const label = STAGE_SEQUENCE[idx];
  return `<div class="stageline" role="group" aria-label="Stage ${idx + 1} of ${total}: ${escAttr(label)}"><span class="stagebar">${segs}</span><span class="stagestatus"><b>${esc(label)}</b><span class="stagestep">${idx + 1} / ${total}</span></span></div>`;
}

// The lifecycle stage bar is the default progress indicator for every PRD.
// Opt out only with frontmatter "stageBar": false. (Graceful fallback: if a
// doc's `stage` doesn't map to the lifecycle, renderStageBar returns null and
// callers fall back to the existing % bar.)
function stageBarOn(data) {
  return Boolean(data) && data.kind === KIND_PRD && data.stageBar !== false;
}

function autoWorkTicket(state) {
  const ticket = state?.workTicket;
  if (!ticket || !ticket.href) return "";
  const ticketId = ticket.ticketId || "linked ticket";
  const source = ticket.source ? ` · ${humanize(ticket.source)}` : "";
  const updated = ticket.lastBackfilledAt
    ? ` · Backfilled ${new Date(ticket.lastBackfilledAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
    : "";
  return `<section class="card"><h3>Work ticket</h3><p><a href="${escAttr(safeUrl(ticket.href))}">${esc(ticketId)}</a></p>${source || updated ? `<p class="small">Execution object${esc(source)}${esc(updated)}</p>` : ""}</section>`;
}

function autoProgress(state, fmProgress, data) {
  // state.json is the stage AUTHORITY; frontmatter is a derived mirror. (The
  // old precedence let a stale frontmatter stage win on every surface.)
  const stageBar = stageBarOn(data)
    ? renderStageBar(state?.stage ?? data.stage, state?.status)
    : null;
  if (!state) return `<p class="small">No state.json found.</p>`;
  const percent =
    state.progressPct ?? state.progress?.percent ?? fmProgress ?? null;
  const status = state.status;
  const phase = state.phase;
  const activeState = state.activeState ?? state.progress?.phase;
  const nextAction = state.next_action ?? state.progress?.next_action;
  const items = Array.isArray(state.items) ? state.items : null;
  const acceptance = Array.isArray(state.acceptance_criteria)
    ? state.acceptance_criteria
    : null;

  // Stage bar (when opted in) replaces the progress %. It already carries the
  // status text, so no separate "% complete" note is rendered beneath it.
  const bar = stageBar
    ? stageBar
    : percent != null
      ? `<div class="bar" aria-label="${percent} percent complete"><div class="fill" style="width:${percent}%"></div></div>`
      : "";
  const note = stageBar
    ? ""
    : percent != null
      ? `${percent}% complete.`
      : status
        ? `Status: ${status}.`
        : "";
  let html = `<section class="card"><h3>Overall</h3>${bar}${note ? `<p class="small" style="margin-top:8px">${esc(note)}</p>` : ""}</section>`;
  html += autoWorkTicket(state);

  const stateRows = [
    ["Status", status],
    ["Phase", phase],
    ["Active state", activeState],
    ["Next action", nextAction],
  ].filter(([, v]) => v != null && v !== "");
  if (stateRows.length) {
    html += `\n<section data-doc-section="current-state"><h2>Current state</h2><div class="rows">${stateRows
      .map(
        ([k, v]) =>
          `<div class="row"><div class="label">${k}</div><div>${inline(String(v))}</div></div>`,
      )
      .join("")}</div></section>`;
  }
  if (items && items.length) {
    html += `\n<section data-doc-section="work-items"><h2>Work items</h2><div class="grid">${items
      .map((it) => {
        const meta = [it.status, it.owner].filter(Boolean).join(" · ");
        return `<article class="card"><h3>${inline(it.title || it.id || "")}</h3>${meta ? `<p class="small">${esc(meta)}</p>` : ""}${it.evidence ? `<p>${inline(it.evidence)}</p>` : ""}</article>`;
      })
      .join("")}</div></section>`;
  }
  if (acceptance && acceptance.length) {
    html += `\n<section data-doc-section="acceptance-criteria"><h2>Acceptance criteria</h2><ul>${acceptance
      .map((a) => `<li>${inline(String(a))}</li>`)
      .join("")}</ul></section>`;
  }
  return html;
}

function autoLedger(ledgerText, ledgerLabel = "ledger.jsonl") {
  if (!ledgerText) return `<p class="small">No ledger.jsonl found.</p>`;
  let dropped = 0;
  const events = ledgerText
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        dropped++;
        return null;
      }
    })
    .filter(Boolean)
    .map((e) => ({
      when: e.ts ?? e.time ?? e.when ?? e.timestamp ?? "",
      title: humanize(e.event ?? e.kind ?? e.type ?? e.title ?? ""),
      who: e.actor ?? e.who ?? "",
      body: e.summary ?? e.note ?? e.body ?? e.description ?? "",
    }));
  if (dropped)
    console.error(
      `doc-kit: WARNING — ${dropped} malformed line(s) skipped in ${ledgerLabel}`,
    );
  events.sort((a, b) => String(b.when).localeCompare(String(a.when)));
  return renderLedgerRecords(events);
}

// ---------------------------------------------------------------------------
// page assembly
// ---------------------------------------------------------------------------

function deriveChips(data, state) {
  let chips = [];
  if (Array.isArray(data.chips) && data.chips.length) {
    chips = [...data.chips];
  } else if (data.kind === KIND_PRD && state) {
    // When the stage bar is on (the PRD default), it carries status/progress as
    // an elegant bar in the header, so the machine-y Status/Phase/Progress chips
    // are suppressed.
    if (!stageBarOn(data)) {
      if (state.status) chips.push(`Status: ${state.status}`);
      if (state.phase) chips.push(`Phase: ${state.phase}`);
      const pct = state.progressPct ?? state.progress?.percent ?? data.progress;
      if (pct != null) chips.push(`Progress: ${pct}%`);
    }
  }
  // The "Updated" freshness chip applies to every PRD with state — even when the
  // frontmatter sets a custom `chips` array (otherwise it silently vanishes).
  if (data.kind === KIND_PRD && state) {
    const updated =
      state.lastUpdated ?? state.updated_at ?? data.updatedAt ?? data.date;
    if (updated) {
      const d = new Date(updated);
      if (
        !isNaN(d) &&
        !chips.some((c) => typeof c === "string" && c.startsWith("Updated "))
      ) {
        chips.push(
          `Updated ${d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`,
        );
      }
    }
  }
  // extraChips append to whatever was derived (keeps auto-derived freshness)
  if (Array.isArray(data.extraChips)) chips.push(...data.extraChips);
  return chips;
}

function routeFor(data) {
  if (data.href) return data.href;
  // SEAM-6: routes derive from the resolved dir constants (default "docs/prds" /
  // "docs/plans"), so they stay byte-identical for Homebase yet follow config.plansDir.
  return data.kind === KIND_PRD
    ? `/${PRDS_DIR}/${data.slug}/`
    : `/${PLANS_DIR}/${data.slug}.html`;
}

function outputPathFor(data) {
  return data.kind === KIND_PRD
    ? `${PRDS_DIR}/${data.slug}/index.html`
    : `${PLANS_DIR}/${data.slug}.html`;
}

function assemblePage(parsed) {
  const { data, body, srcPath } = parsed;
  SECTION_IDS.clear();
  const theme = themeCss();
  const packetBar = renderPacketBar(data);

  // A doc that has been subsumed by another (one topic = one evolving artifact). Emit a themed
  // redirect to the canonical surface; it keeps the old URL reachable and out of the catalog.
  if (data.redirectTo) {
    const header = `<header>
${BACK_LINK}
<h1>${esc(data.title)}</h1>
<p class="lede">${inline(data.summary)}</p>
</header>
<div class="callout"><strong>Moved.</strong> This doc has been folded into its canonical surface. <a href="${escAttr(safeUrl(data.redirectTo))}">Open it &rarr;</a></div>`;
    const head = `<meta http-equiv="refresh" content="0; url=${escAttr(safeUrl(data.redirectTo))}" />`;
    return wrapDoc(data, theme, header, "", "", head);
  }

  const tabbed =
    data.kind === KIND_PRD ||
    (Array.isArray(data.tabs) && data.tabs.length > 0);

  // PRD machine state
  let state = null;
  let ledgerText = null;
  if (data.kind === KIND_PRD) {
    const dir = dirname(isAbsolute(srcPath) ? srcPath : join(ROOT, srcPath));
    state = readJsonMaybe(join(dir, data.statePath || "state.json"));
    const lp = join(dir, data.ledgerPath || "ledger.jsonl");
    if (existsSync(lp)) ledgerText = readFileSync(lp, "utf8");
  }

  const chips = deriveChips(data, state)
    .map((c) => `<span class="chip">${esc(c)}</span>`)
    .join("");

  let main = "";
  let script = "";
  if (tabbed) {
    const tabNames =
      Array.isArray(data.tabs) && data.tabs.length
        ? data.tabs
        : ["PRD", "Progress", "Ledger"];
    const { loose, named } = splitTabs(body);
    const namedMap = new Map(named.map((n) => [n.name.toLowerCase(), n.text]));

    // Resolve each requested tab (in tabs[] order) to its rendered content and
    // whether it is actually present. tabs[] drives ORDER + inclusion:
    //  - the FIRST tab is the main tab — the body BEFORE the first @tab divider;
    //  - any other name matching an `@tab <Name>` section renders that section
    //    (all :::blocks / headings / code render inside it);
    //  - Progress / Ledger auto-generate from state.json / ledger.jsonl for PRDs;
    //  - a name with neither an @tab section nor an auto-generator is omitted
    //    (no empty button or panel) rather than rendered blank.
    const resolved = tabNames
      .map((name, idx) => {
        const key = name.toLowerCase();
        const authored = namedMap.get(key);
        const parentSlug = slugify(name);
        let content = "";
        let present = false;
        if (idx === 0 && !authored) {
          content = renderTabContent(
            (loose ? loose + "\n" : "") +
              (namedMap.get(tabNames[0].toLowerCase()) || ""),
            parentSlug,
          );
          present = true; // main tab always shown (carries the lede body)
        } else if (authored != null) {
          content = renderTabContent(authored, parentSlug);
          present = true;
        } else if (data.kind === KIND_PRD && key === "progress") {
          content = autoProgress(state, data.progress, data);
          present = true;
        } else if (data.kind === KIND_PRD && key === "ledger") {
          content = autoLedger(ledgerText, data.ledgerPath || "ledger.jsonl");
          present = true;
        }
        return { name, content, present };
      })
      .filter((t) => t.present);

    const tabsHtml = resolved
      .map(
        (t, idx) =>
          `<button class="tab" role="tab" aria-selected="${idx === 0 ? "true" : "false"}" data-tab="${slugify(t.name)}">${esc(t.name)}</button>`,
      )
      .join("");

    const panels = resolved
      .map(
        (t, idx) =>
          `<section id="${slugify(t.name)}" class="panel${idx === 0 ? " active" : ""}" role="tabpanel">\n${t.content}\n</section>`,
      )
      .join("\n");

    main = `${panels}`;
    const stageBarHeader = stageBarOn(data)
      ? renderStageBar(state?.stage ?? data.stage, state?.status) || ""
      : "";
    const header = `<header>
${BACK_LINK}${packetBar}
<h1>${esc(data.title)}</h1>
<p class="lede">${inline(data.summary)}</p>
${stageBarHeader}
<div class="chips">${chips}</div>
<div class="tabs" role="tablist" aria-label="${esc(data.title)} sections">${tabsHtml}</div>
</header>`;
    script = "\n" + TAB_SCRIPT;
    return wrapDoc(data, theme, header, main, script);
  }

  // flat report
  main = withSectionNav(renderNodes(parseNodes(body)));
  const header = `<header>
${BACK_LINK}${packetBar}
<h1>${esc(data.title)}</h1>
<p class="lede">${inline(data.summary)}</p>
<div class="chips">${chips}</div>
</header>`;
  return wrapDoc(data, theme, header, main, "");
}

// Doc live-reload: every generated doc polls its own file mtime and refreshes
// when re-rendered, so all open surfaces update without a manual reload. Skips
// reloading while a field is focused so it never interrupts typing.
const RELOAD_SCRIPT = `<script>
  (function () {
    var f = window.fetch;
    if (!f || !window.setInterval) return;
    var url = "/api/hwq/docrev?path=" + encodeURIComponent(location.pathname);
    var rev = null;
    function typing() {
      var el = document.activeElement;
      return el && (el.tagName === "TEXTAREA" || el.tagName === "INPUT" || el.isContentEditable);
    }
    function check() {
      f(url).then(function (r) { return r.json(); }).then(function (j) {
        if (!j || !j.ok || !j.mtime) return;
        if (rev === null) { rev = j.mtime; return; }
        if (j.mtime !== rev && !typing()) location.reload();
      }, function () {});
    }
    window.setInterval(check, 2000);
    check();
  })();
</script>`;

// Copyable content blocks (:::copy). Tiny, inlined, no deps: each Copy button
// grabs the EXACT raw text off its panel's data-copy attribute (never the
// rendered HTML) and writes it to the clipboard via navigator.clipboard, with a
// brief "Copied ✓" state. Falls back to a hidden-textarea execCommand copy when
// the async Clipboard API is unavailable (older/insecure contexts).
const COPY_SCRIPT = `<script>
  (function () {
    var blocks = [].slice.call(document.querySelectorAll("[data-copyblock]"));
    if (!blocks.length) return;
    function legacyCopy(text) {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.top = "-1000px";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      var ok = false;
      try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      return ok;
    }
    function flash(btn) {
      if (btn.__t) clearTimeout(btn.__t);
      btn.textContent = "Copied ✓";
      btn.classList.add("copied");
      btn.__t = setTimeout(function () {
        btn.textContent = "Copy";
        btn.classList.remove("copied");
      }, 1500);
    }
    blocks.forEach(function (block) {
      var btn = block.querySelector("[data-copybtn]");
      if (!btn) return;
      btn.addEventListener("click", function () {
        var text = block.getAttribute("data-copy") || "";
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(
              function () { flash(btn); },
              function () { if (legacyCopy(text)) flash(btn); }
            );
          } else if (legacyCopy(text)) {
            flash(btn);
          }
        } catch (e) {
          if (legacyCopy(text)) flash(btn);
        }
      });
    });
  })();
</script>`;

function wrapDoc(data, theme, header, main, script, extraHead = "") {
  return `<!doctype html>
<html lang="en" data-doc-title="${escAttr(data.title)}" data-doc-kind="${escAttr(data.kind)}" data-doc-date="${escAttr(data.date)}" data-doc-source="${escAttr(data.slug)}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
${extraHead ? extraHead + "\n" : ""}<title>${esc(data.title)}</title>
<style>
${theme}
</style>
</head>
<body>
<main>
${header}
${main}
</main>${script}
${COPY_SCRIPT}
${RELOAD_SCRIPT}
</body>
</html>
`;
}

// ---------------------------------------------------------------------------
// discovery
// ---------------------------------------------------------------------------

function discoverSources() {
  const out = [];
  const sdir = join(ROOT, SOURCES_DIR);
  if (existsSync(sdir)) {
    for (const f of readdirSync(sdir))
      if (f.endsWith(".doc.md")) out.push(`${SOURCES_DIR}/${f}`);
  }
  const pdir = join(ROOT, PRDS_DIR);
  if (existsSync(pdir)) {
    for (const slug of readdirSync(pdir)) {
      const p = `${PRDS_DIR}/${slug}/index.doc.md`;
      if (existsSync(join(ROOT, p))) out.push(p);
    }
  }
  return out.sort();
}

// A bare slug is the natural thing for an agent to pass ("render chat-stack").
// Resolve it against the PRD and sources dirs before giving up, and die with
// every path we tried instead of the old bare "no such file".
function resolveSourceArg(a) {
  if (existsSync(isAbsolute(a) ? a : join(ROOT, a))) return a;
  if (!a.includes("/") && !a.endsWith(".md")) {
    const prd = `${PRDS_DIR}/${a}/index.doc.md`;
    if (existsSync(join(ROOT, prd))) return prd;
    const src = `${SOURCES_DIR}/${a}.doc.md`;
    if (existsSync(join(ROOT, src))) return src;
    die(`${a}: not found — tried ${a}, ${prd}, ${src}`);
  }
  return a; // parseSource reports the missing path itself
}

function resolveArgsToSources(args) {
  if (args.includes("--all")) return discoverSources();
  return args.filter((a) => !a.startsWith("--")).map(resolveSourceArg);
}

// ---------------------------------------------------------------------------
// catalog register
// ---------------------------------------------------------------------------

function catalogId(data) {
  return data.id || data.slug;
}

function catalogEntry(data, state) {
  const href = routeFor(data);
  const sourcePath = outputPathFor(data);
  const lifecycle = data.lifecycle;
  const fields = [
    `    id: ${JSON.stringify(catalogId(data))},`,
    `    title: ${JSON.stringify(data.title)},`,
    `    summary: ${JSON.stringify(data.summary)},`,
    `    href: ${JSON.stringify(href)},`,
    `    sourcePath: ${JSON.stringify(sourcePath)},`,
    `    updatedAt: ${JSON.stringify(data.updatedAt || data.date)},`,
    `    tags: ${JSON.stringify(data.tags)},`,
    `    status: ${JSON.stringify(lifecycle)},`,
    `    lifecycle: ${JSON.stringify(lifecycle)},`,
    `    stage: ${JSON.stringify(state?.stage ?? data.stage)},`,
    `    nextAction: ${JSON.stringify(state?.next_action ?? data.nextAction)},`,
    `    progress: ${data.progress == null ? "null" : Number(data.progress)},`,
  ];
  return `  {\n${fields.join("\n")}\n  }`;
}

/** Find [start,end) index spans of each top-level {…} object inside the array literal. */
function findEntrySpans(src, arrStart, arrEnd) {
  const spans = [];
  let depth = 0;
  let inStr = null;
  let objStart = -1;
  for (let i = arrStart; i < arrEnd; i++) {
    const c = src[i];
    if (inStr) {
      if (c === "\\") i++;
      else if (c === inStr) inStr = null;
      continue;
    }
    if (c === "/" && src[i + 1] === "/") {
      while (i < arrEnd && src[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      i += 2;
      while (i < arrEnd && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      inStr = c;
      continue;
    }
    if (c === "{") {
      if (depth === 0) objStart = i;
      depth++;
    } else if (c === "}") {
      depth--;
      if (depth === 0 && objStart !== -1) {
        spans.push([objStart, i + 1]);
        objStart = -1;
      }
    }
  }
  return spans;
}

function registerOne(data, srcText, state) {
  const marker = "REVIEW_DOCS: ReviewDoc[] = [";
  const mIdx = srcText.indexOf(marker);
  if (mIdx === -1)
    die(`catalog: could not find "${marker}" in ${CATALOG_PATH}`);
  // The array's opening "[" is the marker's last char. (Do NOT indexOf("[") — that would match
  // the "[]" inside the "ReviewDoc[]" type annotation.)
  const arrStart = mIdx + marker.length - 1;
  // find the matching closing ] for this array
  let depth = 0;
  let inStr = null;
  let arrEnd = -1;
  for (let i = arrStart; i < srcText.length; i++) {
    const c = srcText[i];
    if (inStr) {
      if (c === "\\") i++;
      else if (c === inStr) inStr = null;
      continue;
    }
    if (c === "/" && srcText[i + 1] === "/") {
      while (i < srcText.length && srcText[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && srcText[i + 1] === "*") {
      i += 2;
      while (
        i < srcText.length &&
        !(srcText[i] === "*" && srcText[i + 1] === "/")
      )
        i++;
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      inStr = c;
      continue;
    }
    if (c === "[") depth++;
    else if (c === "]") {
      depth--;
      if (depth === 0) {
        arrEnd = i;
        break;
      }
    }
  }
  if (arrEnd === -1) die("catalog: could not find end of REVIEW_DOCS array");

  const spans = findEntrySpans(srcText, arrStart + 1, arrEnd);
  const entryText = catalogEntry(data, state);
  // does an entry with this id exist?
  for (const [s, e] of spans) {
    const obj = srcText.slice(s, e);
    const idm = obj.match(/\bid:\s*["']([^"']+)["']/);
    if (idm && idm[1] === catalogId(data)) {
      // replace in place (preserve indentation: strip our leading 2 spaces on first line)
      const replacement = entryText.replace(/^ {2}/, "");
      return {
        text: srcText.slice(0, s) + replacement + srcText.slice(e),
        action: "updated",
      };
    }
  }
  // append before arrEnd. Ensure a trailing comma after the last entry.
  const head = srcText.slice(0, arrEnd);
  const tail = srcText.slice(arrEnd);
  const trimmedHead = head.replace(/\s*$/, "");
  const needsComma = !trimmedHead.endsWith(",") && !trimmedHead.endsWith("[");
  const insertion = `${needsComma ? "," : ""}\n${entryText},\n`;
  return { text: trimmedHead + insertion + tail, action: "added" };
}

// ---------------------------------------------------------------------------
// commands
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// packets + navigator
// ---------------------------------------------------------------------------

let _packetCache = null;
function loadPackets() {
  if (_packetCache) return _packetCache;
  const out = [];
  const dir = join(ROOT, PACKETS_DIR);
  if (existsSync(dir)) {
    for (const slug of readdirSync(dir)) {
      const mf = join(dir, slug, "packet.json");
      if (!existsSync(mf)) continue;
      const data = readJsonMaybe(mf);
      if (!data) continue;
      data.slug = data.slug || slug;
      data.docs = Array.isArray(data.docs) ? data.docs : [];
      out.push(data);
    }
  }
  _packetCache = out;
  return out;
}

let _packetIndexCache = null;
function packetIndex() {
  if (_packetIndexCache) return _packetIndexCache;
  const byRef = new Map();
  for (const p of loadPackets())
    for (const d of p.docs)
      if (d && d.ref && !byRef.has(d.ref)) byRef.set(d.ref, { packet: p, role: d.role || "doc" });
  _packetIndexCache = { byRef };
  return _packetIndexCache;
}

let _catalogMapCache = null;
function loadCatalogMap() {
  if (_catalogMapCache) return _catalogMapCache;
  const m = new Map();
  const abs = join(ROOT, CATALOG_PATH);
  if (CATALOG_PATH.endsWith(".json") && existsSync(abs)) {
    const arr = readJsonMaybe(abs);
    if (Array.isArray(arr)) for (const e of arr) if (e && e.id != null) m.set(e.id, e);
  }
  _catalogMapCache = m;
  return m;
}

const ROLE_LABEL = { explainer: "Explainers", prd: "PRDs", reference: "Reference", doc: "Docs" };
function shortTitle(t) {
  const x = String(t || "");
  return x.length > 42 ? x.slice(0, 40).trimEnd() + "…" : x;
}

// Slim packet header on every member doc: packet name + grouped sibling links
// (current highlighted) so a reader always sees the whole goal's doc set.
function renderPacketBar(data) {
  const id = catalogId(data);
  const hit = packetIndex().byRef.get(id);
  if (!hit) return "";
  const { packet } = hit;
  const cat = loadCatalogMap();
  const groups = {};
  for (const d of packet.docs) (groups[d.role || "doc"] = groups[d.role || "doc"] || []).push(d);
  const order = ["explainer", "prd", "reference", "doc"];
  const sections = order
    .filter((r) => groups[r])
    .map((r) => {
      const links = groups[r]
        .map((d) => {
          const meta = cat.get(d.ref);
          const title = shortTitle((meta && meta.title) || d.ref);
          if (d.ref === id)
            return `<span class="pk-cur" aria-current="page">${esc(title)}</span>`;
          const href = meta && meta.href ? meta.href : "#";
          return `<a href="${escAttr(href)}">${esc(title)}</a>`;
        })
        .join('<span class="pk-sep">·</span>');
      return `<span class="pk-role"><b>${ROLE_LABEL[r] || r}</b> ${links}</span>`;
    })
    .join("");
  const canon = packet.canonical
    ? `<span class="pk-canon" title="Canonical, long-living">canonical</span>`
    : "";
  const pkHref = relative(
    dirname(outputPathFor(data)),
    join(PACKETS_DIR, packet.slug, "index.html"),
  )
    .split(sep)
    .join("/");
  return `<nav class="packetbar" aria-label="Packet: ${escAttr(packet.title || packet.slug)}"><a class="pk-name" href="${escAttr(pkHref)}">◰ ${esc(packet.title || packet.slug)}</a>${canon}<span class="pk-docs">${sections}</span></nav>`;
}

function cmdContract() {
  const out = `Homebase doc kit — agent contract
==================================
Write semantic .doc.md SOURCE, never HTML. scripts/doc-kit.mjs renders it with the
canonical theme (.agents/skill-config/doc/templates/theme.css). Docs are native Homebase
review surfaces; default links use https://your-docs-host/...

KINDS (source -> generated html -> route)
  report       docs/sources/<slug>.doc.md      -> docs/plans/<slug>.html        -> /docs/plans/<slug>.html
  working-doc  docs/sources/<slug>.doc.md      -> docs/plans/<slug>.html        -> /docs/plans/<slug>.html   (tabbed via @tab)
  prd          docs/prds/<slug>/index.doc.md   -> docs/prds/<slug>/index.html   -> /docs/prds/<slug>/
               (tabbed: Progress + Ledger auto-generate from state.json / ledger.jsonl,
                plus optional custom @tab sections — see CUSTOM TABS;
                state.json/ledger.jsonl/resources.json/artifacts are preserved.)

FRONTMATTER (JSON between the first two --- fences)
  required: title, kind, slug, date, lifecycle, summary, tags[], stage, nextAction
  optional: progress, chips[], tabs[], updatedAt, owner, href, statePath, ledgerPath, resourcesPath, stageBar
  lifecycle: active | scoping | idea | archive | implemented

STAGE BAR (PRDs)
  Every kind:"prd" doc renders a lifecycle STAGE BAR as its progress indicator
  instead of a %: Working doc -> Draft PRD -> Ready for approval -> Approved ->
  In execution -> Done. The sequence + aliases come from src/lib/stages.json
  (single source of truth, shared with the app); the active segment is chosen by
  matching frontmatter \`stage\` (alias-tolerant). Default ON for PRDs — set
  frontmatter "stageBar": false to opt out and fall back to a progress %. If
  \`stage\` doesn't map to the lifecycle, it also falls back to the % bar.

CUSTOM TABS (split a long PRD/working-doc into explainer tabs)
  A doc can be split into multiple tabs instead of one long scroll. Body BEFORE
  the first \`@tab\` divider is the main tab (named by tabs[0], default "PRD"); each
  \`@tab <Name>\` section becomes its own tab and renders the full block vocabulary
  (:::callout/:::rows/:::decisions/:::questions/:::html, code, headings) inside it.
  Frontmatter \`tabs[]\` controls tab ORDER and inclusion, e.g.
    "tabs": ["PRD", "Realtime", "Progress", "Ledger"]
  -> 4 buttons in that order; "Realtime" renders the \`@tab Realtime\` section, while
  Progress + Ledger still AUTO-generate from state.json / ledger.jsonl (for PRDs)
  even with no @tab section. A name in tabs[] that has neither an @tab section nor
  an auto-generator is omitted (no empty tab). Tabs switch with the 1..9 number
  keys; the first tab is shown by default. Omit \`tabs\`/\`@tab\` for the classic
  single-scroll PRD (PRD / Progress / Ledger).

NESTED TABS (a second level inside one top-level tab)
  Inside any top-level \`@tab\` region, add \`@@tab <Name>\` (double-at) markers to
  give that one panel its own secondary tab bar — e.g. a piece's panel showing
  "X thread" / "LinkedIn" / "Article". Everything after a \`@@tab Name\` line, up to
  the next \`@@tab\`, the next top-level \`@tab\`, or EOF, is one nested panel; text
  before the first \`@@tab\` (intro prose) joins the first nested panel. A top-level
  \`@tab\` region with NO \`@@tab\` markers renders exactly as before. The active
  nested tab is persisted per parent tab, so reopening a parent restores its last
  nested tab. Example:
    @tab Piece A
    @@tab X thread
    ...thread draft...
    @@tab LinkedIn
    ...linkedin post...
    @@tab Article
    ...long-form...

BLOCKS (:::name [json-opts] ... :::)
  :::callout {"tone":"green","strong":"Verdict:"}   panel; tone accent|green|amber|red
  :::rows                Label :: value             definition rows ({"variant":"phase"} for roadmap)
  :::cards               ### Title + body           2-6 parallel concept cards
  :::copy {"label":"X thread","status":"drafted"}   copyable content panel: label + status pill + Copy button over readable, line-break-preserving text (status: drafted|ready|scheduled|posted)
  :::status {"label":"X thread","value":"scheduled"}   standalone status pill row (value: drafted|ready|scheduled|posted)
  :::decisions           Label :: [Decided] reason  decision rows (green/amber/red emphasis)
  :::questions           - id/title/tag/question/recommendation/answer   blocking question cards
  :::progress {"percent":61,"note":"..."}           bar + ### Done/Next/Risk cards
  :::ledger              - title/when/who/body       reverse-chron timeline
  :::resources           Label :: href              resource/artifact tree (indent for children)
  :::html                ...                         raw passthrough (bespoke SVG only)
  @tab <Name>            tab divider (PRD/working-doc — see CUSTOM TABS); ## Heading; - / 1. lists; \`code\`; **bold**; [t](url)
  @@tab <Name>           nested tab divider inside a top-level @tab region (see NESTED TABS)

COMMANDS
  node scripts/doc-kit.mjs new --kind <kind> --slug <slug> [--title "..."]
  node scripts/doc-kit.mjs render  <source | --all>
  node scripts/doc-kit.mjs register <source | --all>
  node scripts/doc-kit.mjs verify  <source | --all>

RULES: don't hand-edit generated .html (edit source, re-render); don't invent a theme;
register every durable doc; keep PRD machine truth in state.json/ledger.jsonl.`;
  console.log(out);
}

function cmdNew(args) {
  // Accept the documented positional form (`new <kind> <slug>`) as well as the
  // explicit flags. htw --help advertises positional args, but only flags worked
  // before — so the documented form failed for every cross-project consumer.
  const positional = args.filter((a) => !a.startsWith("--"));
  const kind = argValue(args, "--kind") || positional[0];
  const slug = argValue(args, "--slug") || positional[1];
  const title = argValue(args, "--title") || humanize(slug || "");
  if (!KINDS.includes(kind))
    die(`new: --kind must be one of ${KINDS.join(", ")}`);
  if (!slug) die("new: --slug is required");
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug))
    die(
      `new: --slug must be kebab-case [a-z0-9][a-z0-9-]* (lowercase letters, digits, hyphens; start alphanumeric), got "${slug}"`,
    );
  const out =
    kind === KIND_PRD
      ? `${PRDS_DIR}/${slug}/index.doc.md`
      : `${SOURCES_DIR}/${slug}.doc.md`;
  const abs = join(ROOT, out);
  if (existsSync(abs)) die(`new: ${out} already exists`);
  const fm = {
    title,
    kind,
    slug,
    date: "<YYYY-MM-DD>",
    lifecycle: "scoping",
    summary: "One-line summary for the catalog card.",
    tags: ["/doc"],
    stage: "Working doc",
    nextAction: "What Alex does next.",
    progress: null,
  };
  if (kind !== KIND_REPORT) fm.tabs = ["PRD", "Progress", "Ledger"];
  if (kind === KIND_PRD) {
    fm.statePath = "state.json";
    fm.ledgerPath = "ledger.jsonl";
  }
  let starter = `---\n${JSON.stringify(fm, null, 2)}\n---\n\n`;
  if (kind === KIND_PRD) {
    starter += `:::callout {"tone":"accent","strong":"Thesis:"}\nWhat this PRD is and why it matters.\n:::\n\n## Problem\n\nDescribe the problem.\n\n## Decision direction\n\n:::rows\nSource of truth :: ...\n:::\n\n## Artifacts\n\n:::resources\nState JSON :: state.json\nLedger :: ledger.jsonl\n:::\n`;
  } else if (kind === KIND_WORKING) {
    starter += `@tab PRD\n\n## Problem\n\nDescribe the problem.\n\n@tab Progress\n\n:::progress {"percent":0,"note":"0% complete."}\n### Done\n...\n### Next\n...\n:::\n\n@tab Ledger\n\n:::ledger\n- title: Doc created\n  when: <YYYY-MM-DD>\n  who: bot\n  body: ...\n:::\n`;
  } else {
    starter += `:::callout {"tone":"green","strong":"Verdict:"}\nThe recommendation.\n:::\n\n## Summary\n\nLead with the conclusion.\n`;
  }
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, starter);
  console.log(`created ${out}`);
  // PRD preserved files: scaffold empty state.json + ledger.jsonl so `htw verify`
  // passes on a freshly-created doc before the author populates them.
  if (kind === KIND_PRD) {
    const dir = dirname(abs);
    const stateAbs = join(dir, fm.statePath || "state.json");
    const ledgerAbs = join(dir, fm.ledgerPath || "ledger.jsonl");
    if (!existsSync(stateAbs)) {
      writeFileSync(
        stateAbs,
        JSON.stringify({ stage: "Scoping", status: "Scoping", progressPct: 0, next_action: "Fill in the PRD." }, null, 2) + "\n",
      );
      console.log(`  + ${join(dirname(out), fm.statePath || "state.json")} (scaffold)`);
    }
    if (!existsSync(ledgerAbs)) {
      writeFileSync(ledgerAbs, "");
      console.log(`  + ${join(dirname(out), fm.ledgerPath || "ledger.jsonl")} (scaffold)`);
    }
  }
}

function cmdRender(args) {
  // Default to --all when called with no arguments (common "render everything" workflow).
  const sources = resolveArgsToSources(args.length ? args : ["--all"]);
  if (!sources.length) die("render: no .doc.md sources found — run `htw new` first");
  for (const src of sources) {
    const parsed = parseSource(src);
    const errs = validateFrontmatter(parsed.data);
    if (errs.length) die(`${src}: ${errs.join("; ")}`);
    const html = assemblePage(parsed);
    const out = outputPathFor(parsed.data);
    mkdirSync(dirname(join(ROOT, out)), { recursive: true });
    writeFileSync(join(ROOT, out), html);
    console.log(`rendered ${src} -> ${out}`);
  }
  // Render auto-registers: a rendered-but-uncatalogued doc was the #1 way docs
  // vanished from the navigator (whole repos with 0 of 5 PRDs registered). The
  // .ts splice path stays manual — it edits app source, which render must not.
  if (CATALOG_PATH.endsWith(".json")) {
    registerJsonCatalog(sources);
  } else {
    console.log(
      `render: note — catalog ${CATALOG_PATH} is a .ts splice; run \`htw register\` to update it`,
    );
  }
}

// SEAM-5 JSON catalog (the public default — docs/catalog.json). The same fields
// the TS splice writes, but as a plain object the static `htw index` dashboard
// (and any non-React host) can read with JSON.parse. No TypeScript, no framework.
function jsonCatalogEntry(data, state) {
  return {
    id: catalogId(data),
    kind: data.kind,
    title: data.title,
    summary: data.summary,
    href: routeFor(data),
    sourcePath: outputPathFor(data),
    updatedAt: state?.lastUpdated?.slice?.(0, 10) || data.updatedAt || data.date,
    tags: data.tags,
    status: data.lifecycle,
    lifecycle: data.lifecycle,
    // state.json is the stage authority; frontmatter is the fallback mirror.
    stage: (state?.stage ?? data.stage) ?? null,
    nextAction: (state?.next_action ?? data.nextAction) ?? null,
    progress: data.progress == null ? null : Number(data.progress),
  };
}

// Upsert-by-id into a JSON array catalog, then write it back sorted by id so the
// output is deterministic (clean git diffs). Creates the file/dir if absent.
function registerJsonCatalog(sources) {
  const abs = join(ROOT, CATALOG_PATH);
  let catalog = [];
  if (existsSync(abs)) {
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(abs, "utf8"));
    } catch (e) {
      die(`register: ${CATALOG_PATH} is not valid JSON — ${e.message}`);
    }
    if (!Array.isArray(parsed))
      die(`register: ${CATALOG_PATH} must be a JSON array of catalog entries`);
    catalog = parsed;
  }
  const byId = new Map();
  for (const e of catalog) if (e && e.id != null) byId.set(e.id, e);
  for (const src of sources) {
    const { data } = parseSource(src);
    if (data.redirectTo) {
      console.log(`skipped ${data.slug} (redirect to ${data.redirectTo})`);
      continue;
    }
    const errs = validateFrontmatter(data);
    if (errs.length) die(`${src}: ${errs.join("; ")}`);
    const entry = jsonCatalogEntry(data, stateForSource(src, data));
    console.log(`${byId.has(entry.id) ? "updated" : "added"} ${data.slug}`);
    byId.set(entry.id, entry);
  }
  const out = [...byId.values()].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, JSON.stringify(out, null, 2) + "\n");
}

function cmdRegister(args) {
  const sources = resolveArgsToSources(args);
  if (!sources.length) die("register: provide a source path or --all");

  // SEAM-5 dual-path: a `.json` catalogPath (public default, docs/catalog.json)
  // src/modules/docs/catalog.ts) keeps the in-place TypeScript splice below.
  if (CATALOG_PATH.endsWith(".json")) return registerJsonCatalog(sources);

  // .ts splice path. If the configured TS catalog is absent (a non-Homebase repo
  // that never repointed catalogPath), skip with a warning instead of crashing.
  if (!existsSync(join(ROOT, CATALOG_PATH))) {
    console.warn(
      `register: catalog ${CATALOG_PATH} not found — skipping. ` +
        `Set doc.catalogPath to a .json path (e.g. docs/catalog.json) to emit a JSON catalog.`,
    );
    return;
  }

  let text = readText(CATALOG_PATH);
  for (const src of sources) {
    const { data } = parseSource(src);
    if (data.redirectTo) {
      console.log(`skipped ${data.slug} (redirect to ${data.redirectTo})`);
      continue;
    }
    const errs = validateFrontmatter(data);
    if (errs.length) die(`${src}: ${errs.join("; ")}`);
    const res = registerOne(data, text, stateForSource(src, data));
    text = res.text;
    console.log(`${res.action} ${data.slug}`);
  }
  writeFileSync(join(ROOT, CATALOG_PATH), text);
}

function cmdVerify(args) {
  const asJson = args.includes("--json");
  const say = asJson ? () => {} : console.log;
  const positional = args.filter((a) => !a.startsWith("--"));
  const verifyAll = args.includes("--all") || positional.length === 0;
  // Default to --all when called with no positional sources.
  const sources = verifyAll ? discoverSources() : positional.map(resolveSourceArg);
  if (!sources.length) die("verify: no .doc.md sources found — run `htw new` first");
  const report = { ok: true, theme: { ok: true, fails: [] }, docs: [], unmanaged: [] };
  // Catalog: read the TS source as text (regex check) OR parse the JSON array
  // (SEAM-5) so a `.json` catalog is verified by id/href, not a TS-shaped regex.
  const catalogIsJson = CATALOG_PATH.endsWith(".json");
  let catalog = "";
  let jsonCatalog = [];
  if (existsSync(join(ROOT, CATALOG_PATH))) {
    catalog = readText(CATALOG_PATH);
    if (catalogIsJson) {
      try {
        const parsed = JSON.parse(catalog);
        if (Array.isArray(parsed)) jsonCatalog = parsed;
      } catch {
        /* leave jsonCatalog empty -> every doc reports "no catalog entry" */
      }
    }
  }
  let anyFail = false;

  // Theme sanity: a stray "*/" inside a CSS comment (e.g. a glob like prds/*/index.html) closes
  // the comment early and corrupts :root, silently killing all custom properties. Catch that:
  // after stripping /* */ comments, the theme must start at :root and have balanced braces.
  const themeStripped = readText(THEME_PATH)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .trim();
  const opens = (themeStripped.match(/{/g) || []).length;
  const closes = (themeStripped.match(/}/g) || []).length;
  if (!themeStripped.startsWith(":root")) {
    report.theme.fails.push(
      "CSS does not start at :root after stripping comments (stray */ in a comment?)",
    );
  } else if (opens !== closes) {
    report.theme.fails.push(`unbalanced braces (${opens} { vs ${closes} })`);
  }
  if (report.theme.fails.length) {
    report.theme.ok = false;
    anyFail = true;
    for (const f of report.theme.fails) say(`FAIL theme.css: ${f}`);
  } else {
    say(`PASS theme.css (CSS parses, ${opens} rules balanced)`);
  }

  // Bypass detection (--all only): a PRD dir whose index.html has no
  // index.doc.md source is a hand-authored fork the engine cannot regenerate —
  // its render silently lies as state.json keeps advancing underneath it.
  if (verifyAll) {
    const pdirAbs = join(ROOT, PRDS_DIR);
    if (existsSync(pdirAbs)) {
      for (const slug of readdirSync(pdirAbs)) {
        const d = join(pdirAbs, slug);
        let isDir = false;
        try {
          isDir = statSync(d).isDirectory();
        } catch {
          /* ignore */
        }
        if (!isDir) continue;
        if (existsSync(join(d, "index.html")) && !existsSync(join(d, "index.doc.md")))
          report.unmanaged.push(`${PRDS_DIR}/${slug}`);
      }
    }
    for (const u of report.unmanaged) {
      anyFail = true;
      say(
        `FAIL ${u}: hand-authored PRD dir (index.html with no index.doc.md source) — recreate the source (\`htw new prd <slug>\` + migrate content) or archive the dir; generated HTML must be derivable`,
      );
    }
  }

  for (const src of sources) {
    const fails = [];
    let data;
    try {
      data = parseSource(src).data;
    } catch (e) {
      say(`FAIL ${src}: ${e.message}`);
      report.docs.push({ src, ok: false, fails: [e.message] });
      anyFail = true;
      continue;
    }
    fails.push(...validateFrontmatter(data));
    const out = outputPathFor(data);
    const outAbs = join(ROOT, out);
    if (data.redirectTo) {
      // redirect stub: only needs to exist and point at its canonical surface
      if (!existsSync(outAbs)) fails.push(`generated HTML missing: ${out}`);
      else if (!readFileSync(outAbs, "utf8").includes(String(data.redirectTo)))
        fails.push(`redirect target ${data.redirectTo} not present in ${out}`);
      report.docs.push({ src, ok: !fails.length, fails });
      if (fails.length) {
        anyFail = true;
        say(`FAIL ${src}\n   - ${fails.join("\n   - ")}`);
      } else {
        say(`PASS ${src} (redirect -> ${data.redirectTo})`);
      }
      continue;
    }
    if (!existsSync(outAbs)) fails.push(`generated HTML missing: ${out}`);
    else {
      const html = readFileSync(outAbs, "utf8");
      for (const attr of [
        "data-doc-title",
        "data-doc-kind",
        "data-doc-date",
        "data-doc-source",
      ])
        if (!html.includes(attr)) fails.push(`missing hook ${attr}`);
      // SEAM-10: dropped the Homebase-specific #ff5500 brand fingerprint (a host
      // theme is configurable now); the structural .qcard assertion stays as the
      // portable style-drift guard.
      if (!html.includes(".qcard"))
        fails.push("theme.css fingerprint missing (style drift)");
    }
    const route = routeFor(data);
    const expected =
      data.kind === KIND_PRD
        ? `/${PRDS_DIR}/${data.slug}/`
        : `/${PLANS_DIR}/${data.slug}.html`;
    if (route !== expected)
      fails.push(`route ${route} != expected ${expected}`);
    // catalog
    if (catalogIsJson) {
      const entry = jsonCatalog.find((e) => e && e.id === catalogId(data));
      if (!entry) fails.push("no catalog entry");
      else if (entry.href !== route)
        fails.push(`catalog href mismatch (expected ${route}, got ${entry.href})`);
    } else {
      const entryRe = new RegExp(
        `id:\\s*["']${catalogId(data).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`,
      );
      if (!entryRe.test(catalog)) fails.push("no catalog entry");
      else if (
        !catalog.includes(`href: ${JSON.stringify(route)}`) &&
        !catalog.includes(`href: '${route}'`)
      )
        fails.push(`catalog href mismatch (expected ${route})`);
    }
    // prd preserved files
    if (data.kind === KIND_PRD) {
      const dir = dirname(isAbsolute(src) ? src : join(ROOT, src));
      for (const f of [
        data.statePath || "state.json",
        data.ledgerPath || "ledger.jsonl",
      ])
        if (!existsSync(join(dir, f)))
          fails.push(`preserved file missing: ${f}`);
    }
    // stage authority: state.json is truth. Divergent or unmappable stages are
    // exactly how "Draft PRD" bars sat over "In execution" work for weeks.
    if (data.kind === KIND_PRD) {
      const st = stateForSource(src, data);
      const fmIdx = stageIndex(data.stage);
      const stIdx = st && st.stage != null ? stageIndex(st.stage) : -2;
      if (stIdx >= 0 && fmIdx !== stIdx)
        fails.push(
          `stage divergence: frontmatter "${data.stage}" vs state.json "${st.stage}" — state.json is authoritative; run \`htw stage set ${data.slug} "${STAGE_SEQUENCE[stIdx]}"\` to sync every surface`,
        );
      if (fmIdx < 0 && stIdx < 0)
        fails.push(
          `stage "${data.stage}" does not map to the lifecycle (${STAGE_SEQUENCE.join(" → ")})`,
        );
    }
    // staleness: a rendered surface older than its inputs is a lie the reader
    // cannot detect. Any input newer than the output fails.
    if (existsSync(outAbs)) {
      const outM = statSync(outAbs).mtimeMs;
      const srcAbs = isAbsolute(src) ? src : join(ROOT, src);
      const inputs = [["source", srcAbs]];
      if (data.kind === KIND_PRD) {
        const dir = dirname(srcAbs);
        inputs.push(
          ["state.json", join(dir, data.statePath || "state.json")],
          ["ledger.jsonl", join(dir, data.ledgerPath || "ledger.jsonl")],
        );
      }
      for (const [label, p] of inputs) {
        if (existsSync(p) && statSync(p).mtimeMs > outM + 1500) {
          fails.push(
            `stale render: ${out} is older than ${label} — run \`htw render ${data.slug}\``,
          );
          break;
        }
      }
    }
    report.docs.push({ src, ok: !fails.length, fails });
    if (fails.length) {
      anyFail = true;
      say(`FAIL ${src}\n   - ${fails.join("\n   - ")}`);
    } else {
      say(`PASS ${src}`);
    }
  }
  report.ok = !anyFail;
  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(
      anyFail ? "verify: FAILED" : `verify: OK (${sources.length} docs)`,
    );
  }
  if (anyFail) process.exit(1);
}

function argValue(args, flag) {
  const i = args.indexOf(flag);
  return i !== -1 && i + 1 < args.length ? args[i + 1] : null;
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

const [, , cmd, ...rest] = process.argv;
// Resolve config-driven paths + lifecycle before any command runs (SEAM-1/2).
configure();
switch (cmd) {
  case "contract":
    cmdContract();
    break;
  case "new":
    cmdNew(rest);
    break;
  case "render":
    cmdRender(rest);
    break;
  case "register":
    cmdRegister(rest);
    break;
  case "verify":
    cmdVerify(rest);
    break;
  default:
    console.log(
      "usage: node scripts/doc-kit.mjs <contract|new|render|register|verify> [...]",
    );
    if (cmd && cmd !== "--help" && cmd !== "-h") process.exit(1);
}
