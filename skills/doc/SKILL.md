---
name: doc
description: "Create polished, workspace-native HTML docs: system explainers, PR/code reviews, research reports, review/decision packets, status pages, and custom editors. Reads a per-repo config bundle for brand, style, output paths, docs host, and scaffold/verify/serve commands. Primarily for understanding, review, and sharing — not execution work orders."
version: 0.1.0
minEngine: "how-to-work >= 0.1.0 (Node >= 18)"
---

If the user invoked this skill with trailing text, treat that text as the input for this workflow.

# Doc Skill

Create a self-contained HTML artifact that explains, reviews, or surfaces something clearly. `/doc` is for understanding, review, and sharing. `/prd` (or the repo's PRD / send-it workflow) is for execution planning with owners and work lanes.

This is the shared user-level workflow. Repo-specific voice, template, output path, docs host, and verification details belong in a repo-local config bundle, **not** in this skill. Never hardcode any one workspace's brand, host, theme, paths, ports, or commands here.

The deeper job of `/doc` is knowledge compilation: turn evidence, code reading, and useful answers into durable repo knowledge instead of one-off chat output. HTML is the scannable surface. Canonical Markdown, indexes, and logs are the compounding memory layer.

## Step 0 — Load config first

**Before producing or updating any doc, load the repo's config and confirm the engine is current.** The **how-to-work** engine resolves and deep-merges the config for you; you only need to know where it lives so you never hardcode a path, host, theme, or command.

1. Probe order (highest precedence first — the engine merges all that exist):
   1. `.agents/skill-config/workflow/config.json` — canonical unified config (wins)
   2. `.claude/skill-config/workflow/config.json` — legacy location
   3. `.agents/skill-config/doc/config.json` — legacy split (back-compat fallback)
   4. `.claude/skill-config/doc/config.json` — legacy split (back-compat fallback)
   5. the engine's bundled `config/defaults.json` — neutral generic defaults when the repo ships none
2. Validate / sync: run `npx github:aneym/how-to-work check` (add `--online` to compare against the latest published engine). It checks engine-version drift and config-schema drift and prints the exact `init` / `init --migrate` fix command. Run the printed command before proceeding when it exits non-zero. If there is no config yet, `npx github:aneym/how-to-work init` stamps one. (These skills invoke the GitHub form `npx github:aneym/how-to-work …` because the package is not yet published to npm; once it is, this becomes `npx how-to-work@latest …`.)

It tells you the brand and style to follow, the output paths, the docs host URL for links, the templates to reuse, and the scaffold/render/verify/serve commands to run. Do not invent these — read them from config and fall back to the neutral defaults in this skill only when no config exists.

If present, treat the merged config as the repo overlay. It may define:

| Field                                 | Meaning                                                                                                                                           |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `brandName`                           | Brand/workspace label stamped into generated templates (`{{BRAND}}`).                                                                             |
| `styleName` / `styleSummary`          | The local tone and visual system the author/renderer must follow.                                                                                 |
| `instructions`                        | One-screen overlay instruction to apply before authoring (e.g. "do not hand-write HTML; run the engine").                                         |
| `doc.themeFile`                       | Repo-local theme override (wins over the engine's bundled theme). `null` ⇒ use the package's gorgeous default theme.                              |
| `doc.sourcesDir`                      | Where `.doc.md` semantic sources live.                                                                                                            |
| `doc.prdsDir`                         | Where rendered PRD packages land.                                                                                                                 |
| `doc.plansDir`                        | Where plan/PRD kinds land (reserved — not for `/doc` explainers).                                                                                 |
| `doc.catalogPath`                     | The durable-doc registry the engine upserts (a `.json` catalog, or a host-specific module path).                                                  |
| `doc.docsIndexRoute`                  | Public route prefix the lifecycle dashboard links under.                                                                                          |
| `doc.stagesPath`                      | Repo-local lifecycle-stage source; `null` ⇒ the engine's built-in 6-stage lifecycle.                                                              |
| `canonicalUrlBase`                    | Public docs host base for links handed back in replies. `null` ⇒ use the served / `devUrlBase` URL.                                               |
| `devUrlBase`                          | Local/dev URL base for opening the doc in a browser.                                                                                              |
| `serve.command` / `serve.host` / `serve.port` | How to serve durable docs. `htw init` picks a stable project-specific port so many product docs servers can run at once.                    |
| `serve.tailscale`                     | Optional Tailscale docs sharing config. When `enabled: true`, the Tailscale URL is the primary browser link to verify and send.                    |
| `answerGate.base` / `answerGate.mode` | Where grill answers are submitted/polled, and the gate mode (`none` \| `local` \| `custom`).                                                      |
| `livingExamples`                      | Existing docs/patterns to imitate before inventing a new shape.                                                                                   |
| `knowledgeCompiler`                   | Repo rules for canonical docs, domain logs, source packets, contradiction handling, generated indexes, and which machine-state files to preserve. |

The shared skill defines the workflow. The repo config defines how that workflow should look and where artifacts should land. Agent-guidance fields (`styleName`, `styleSummary`, `livingExamples`, any `banned` list) are for AI readers; the engine ignores keys it does not recognize, so host-private or legacy-shaped keys are inert.

### The engine owns rendering

The **how-to-work** engine OWNS how an artifact becomes a native doc: theme, the semantic component vocabulary, source/output paths, catalog registration, and verification. In a repo that uses it:

1. Author **semantic source** (`.doc.md`: JSON frontmatter + `:::block` components + `@tab`), not HTML — never hand-write a theme or boilerplate the engine already owns.
2. Use the engine's commands: `npx github:aneym/how-to-work new <kind> <slug>` to scaffold, `render` to emit self-contained HTML, `register --all` to update the catalog, `index` to regenerate the lifecycle dashboard, `verify` to validate, `contract` to print the authoring contract.
3. Hand back links using the configured docs host. Use `npx github:aneym/how-to-work link <rendered-html-path>`; it prefers `serve.tailscale` when enabled, then `canonicalUrlBase`, then `devUrlBase`.

The shared skill still owns workflow semantics (what artifact should exist, lifecycle, question protocol, knowledge-compiler classes, closeout). The engine owns rendering.

## When To Invoke

- User types `/doc <topic>`.
- User asks "how does X work?"
- User asks for a shareable explainer, report, research brief, PR explainer, system map, or visual walkthrough.
- User asks for a review packet, decision packet, status page, or workflow dashboard they will act from.
- User wants a custom one-off editor/viewer for structured data.

Skip if:

- The user wants an implementation plan with ownership, work order, or verification gates. Use `/prd` or the repo's PRD/send-it workflow.
- The answer is a short chat explanation.
- The target is a canonical policy doc that should stay easy to diff in Markdown.

## Output Locations

Use the repo config's `doc.*` paths first. If no repo config exists, use:

| Doc type                 | Default path                                                                |
| ------------------------ | --------------------------------------------------------------------------- |
| System explainer         | `docs/explainers/YYYY-MM-DD-<slug>.html`                                    |
| PR/code review artifact  | `docs/reviews/YYYY-MM-DD-<slug>.html`                                       |
| Research/report artifact | `docs/reports/YYYY-MM-DD-<slug>.html`                                       |
| Review/decision packet   | `docs/reviews/YYYY-MM-DD-<slug>.html` unless the repo config says otherwise |
| Custom editor/viewer     | `tmp/doc-artifacts/YYYY-MM-DD-<slug>.html` unless the user asks to keep it  |

Reserve `doc.plansDir` (default `docs/plans/`) for PRDs and the repo's plan/PRD kinds. `/doc` artifacts are project memory, but they are not claimable implementation plans.

## Date & Time Rule

User-facing dates and times must be readable. Raw ISO timestamps are fine in data files, JSON, hidden `data-*` attributes, logs, schemas, and machine state — they should **not** be the primary visible label in chips, headings, cards, tables, review packets, or status summaries.

Prefer labels like:

```text
Updated Jun 14, 2026, 8:15 PM ET
Wed, Jun 17, 2026, 8:00 PM ET
Today, 2:05 PM ET
Yesterday, 9:14 PM
```

For deadlines, scheduled events, approvals, or anything the reader may act on, include an absolute date, time, and timezone. Default to `America/New_York` / `ET` unless the repo config sets a timezone or the user specifies otherwise. Format dynamic timestamps at render time with `Intl.DateTimeFormat` or a small local helper, and preserve the machine value in an attribute such as `data-updated-at`. When updating an existing live doc, find visible ISO strings (e.g. `2026-06-01T02:05:31Z`) and replace the visible label with a readable format while keeping the original value in data.

## Review & Decision Packets

When the doc is something the reader will act on — approve, send back, prioritize, or unblock — make the **first screen carry the whole decision**, not a pointer to a transcript.

First-screen packet:

- the one exact ask (approve / update / send-back / decision needed)
- the recommendation and why now
- latest result and visual evidence when relevant
- what changed and how it was verified
- risks / open questions
- changed files or artifacts, owning thread, and progress
- an editable local path to the artifact

If a richer presentation helps the reader act, pair a Markdown packet (`review.md`) with the HTML packet (`review.html`).

If the evidence is not ready, the doc should say `missing review packet/evidence` and list what is missing. **Do not fake a complete approval packet.** Only promote work into a pinned attention thread when a human response is immediately useful (approval, send-back, taste judgment, access, prioritization, or a real blocker). Intermediate worker evidence stays in the worker ledger or task record until it becomes an exact decision packet.

## Stateful PRD Packages (config-gated)

`/doc` does not author execution work orders. But when the repo config declares a `prd` kind and the user asks for a PRD — or a planning/grill session is converging into one — produce the **stateful package the engine defines**, not a standalone HTML file. The shape (read the repo's actual paths from `doc.prdsDir`):

```text
docs/prds/<slug>/
  index.html        # PRD with tabs: PRD, Progress, Ledger
  state.json        # current machine-readable state (source of truth)
  ledger.jsonl      # append-only work timeline
  resources.json    # artifact/resource tree
  artifacts/        # generated outputs/evidence
docs/adr/YYYY-MM-DD-<slug>.md   # decisions that should survive the chat
```

Progress and Ledger tabs render from `state.json` / `ledger.jsonl`, not from manually invented prose. Treat `state.json`, `ledger.jsonl`, `resources.json`, and `artifacts/` as machine state — never hand-edit them. When the user says "send it" (or the repo's equivalent), hand off to the repo's configured PRD/maker-checker workflow (e.g. a `send-it` skill) rather than driving the loop from here.

## Linked Plan Workflow

When the user says something like "plan and link this please" after a discussion:

1. Create a concise local HTML decision packet (thesis, operating model, phases, guardrails, open questions, next action).
2. Verify the file exists and has non-zero bytes.
3. Serve it using the repo config's `serve.command` (or `npx github:aneym/how-to-work serve`); prefer the repo's configured `serve.port` and existing Tailscale route over creating a new public surface.
4. Verify the shared URL returns `200` and `Content-Type: text/html` before declaring it done.
5. Keep the final reply terse: the Tailscale/public browser link plus verification facts, not a localhost URL, raw filepath, or restatement of the whole doc.

## Canonical Escalation

HTML docs are visual companions by default. When the user asks to make a doc canonical, or when a working artifact has become durable architecture/product policy:

1. Create or update the repo's canonical Markdown hub from config, typically under the configured canonical root (e.g. `docs/<domain>/`).
2. Put durable decisions in focused Markdown files such as `README.md`, `architecture.md`, `canonical-<concept>.md`, `systems/<name>.md`, or `contracts/<name>.md`.
3. Preserve the HTML/report/plan as a companion or historical artifact.
4. Add a short entry to the relevant `log.md` when the repo uses one.
5. Update the companion artifact and future docs to link back to the canonical domain doc.

Do not leave the only source of truth in a date-stamped HTML explainer, report, plan, or investigation once the user has promoted it to canonical.

## Knowledge Compiler Mode

Use this mode whenever a `/doc` artifact changes how future agents should understand the repo or domain.

The output must classify each conclusion:

| Class              | Meaning                                                                                        | Required handling                                                                                               |
| ------------------ | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Raw evidence       | Source material, investigation notes, screenshots, traces, transcripts, generated reports      | Keep as dated artifact or source packet. Do not treat as current truth by default.                              |
| Compiled knowledge | Durable architecture, product policy, contracts, runbooks, metric definitions, operating rules | Update the focused canonical Markdown or module doc. Link the HTML/report as supporting evidence.               |
| Chronology         | Meaningful decision, migration, ingest, audit, or doc promotion event                          | Append the domain `log.md` when the repo uses logs.                                                             |
| Navigation         | New or moved durable docs                                                                      | Update the relevant hub/index/manifest, such as `README.md` or `llms.txt`, when the repo owns one.              |
| Unresolved state   | Contradictions, stale claims, weak evidence, gaps, or owner-required decisions                 | Record them explicitly in the artifact and, for durable domains, in the canonical doc or log as open questions. |

Compiler workflow:

1. Read the repo's canonical index first, if it exists (e.g. `knowledgeCompiler.indexPath`).
2. Treat plans, reports, audits, investigations, chat transcripts, and generated HTML as source evidence unless a repo rule marks them canonical.
3. Write the visual HTML for human scanning only when it helps.
4. Promote lasting conclusions into canonical Markdown in the same change.
5. Add provenance links from canonical claims back to evidence artifacts or source files.
6. Append a log entry for durable promotions, contradictions resolved, or operating-model changes.
7. Run the repo's doc reader/checker/index commands when configured.
8. Never hand-edit machine-state files the config lists under `knowledgeCompiler.preserve`.

This is the Karpathy-style wiki rule in repo-doc form: raw material stays preserved, compiled knowledge stays current, and the agent maintains the connective tissue.

## Reusable Assets

Author semantic `.doc.md` and let the engine render — do not write HTML from scratch. The polish lives in the engine's shared theme and HTML emission, so the markup stays tiny and the output is gorgeous for free.

| Asset                             | Use                                                                                                                                                                                                  |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| the engine's bundled `templates/` | The default theme plus the component templates (`prd`, `working-doc`, `progress`, `ledger`, `question-card`, `resource-tree`, `decision-table`, `report`). The repo's `doc.themeFile` wins when set. |
| the package's `components.md`     | The semantic component vocabulary (`:::cards`, `:::rows`, `:::decisions`, `:::questions`, `:::progress`, `:::ledger`, `:::resources`, `:::html`, `@tab`).                                            |
| the package's `tokens.md`         | The design tokens and how to re-skin a whole repo with one short theme-tokens file.                                                                                                                  |
| `examples/kitchen-sink.doc.md`    | A rendered component gallery to imitate before inventing a new shape.                                                                                                                                |
| `livingExamples` (config)         | Existing repo docs/patterns to imitate first.                                                                                                                                                        |

If the repo config points at a living pattern library, treat that as the richer source of examples. When the local doc system gains a reusable component, CSS pattern, visual recipe, or workflow principle, improve the engine or repo config rather than forcing the old shape.

## Principles

| Principle                        | Means                                                                                                                                                                                                                                  |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Concise first screen             | The first viewport answers what this is, why it matters, and what the reader should remember (or decide).                                                                                                                              |
| Visuals over prose               | Default system explainers include a first-screen sketch, a system map, a path walkthrough, and a state/decision diagram before long prose.                                                                                             |
| Financial reports are dashboards | For money, runway, spend, exposure, or planning reports, lead with charted numbers: balance picture, cash/runway bars, scenario ranges, controllability buckets, and caveats. Prose supports the charts; it does not carry the report. |
| Evidence-grounded                | Read the relevant code/docs first. Do not invent file names, runtime behavior, APIs, or data shapes.                                                                                                                                   |
| Workspace-native                 | Apply the repo's configured visual style, voice, brand labels, commands, and artifact locations.                                                                                                                                       |
| Readable dates                   | Visible dates/times are human-readable with timezone; ISO stays in machine data only.                                                                                                                                                  |
| System-aware theme               | Durable HTML docs should support system light/dark mode with `color-scheme: light dark` and a `prefers-color-scheme: dark` CSS block.                                                                                                  |
| Mobile-dense by default          | Durable HTML docs must read well on phone screens: compact hero, no page-level horizontal scroll, horizontal chip nav, scroll-contained wide tables/diagrams, safe-area padding, and dense cards with restrained type.                 |
| Hierarchy over boxes             | Use headings, rows, and dividers for ordinary content. Cards are for truly bounded objects (one decision packet, one evidence object, one repeated item, one alert), not for every section.                                            |
| Selectable details               | File paths, commands, payloads, and snippets stay as real text, not screenshots.                                                                                                                                                       |
| Progressive drill-down           | Start with a 3000-foot view, then make explainer cards open linkable HTML pages. If a canonical deeper doc already exists, link to that real doc instead of creating a thin duplicate companion page.                                  |
| Canonical when promoted          | If a doc becomes operating policy or architecture, escalate it into canonical Markdown and keep the HTML as the visual companion.                                                                                                      |
| Export when interactive          | Every custom editor ends with copy-as-JSON, copy-as-prompt, copy diff, or copy command list.                                                                                                                                           |
| Compile, do not re-derive        | Durable conclusions should be filed into canonical docs, indexes, and logs so future agents read the compiled layer before raw artifacts.                                                                                              |
| Preserve uncertainty             | Contradictions, stale claims, weak provenance, and open questions must be visible rather than smoothed into confident prose.                                                                                                           |
| Improve the kit                  | If a doc needs a reusable component, CSS pattern, visual recipe, or use case that is not in the engine, add it to the engine or repo config instead of forcing the old shape.                                                          |

## Concision Rules

- Max 6-8 main sections unless the user asks for depth.
- Max 2 short paragraphs per section.
- If a section has more than 4 lines of prose, convert it into cards, a table, or a diagram.
- For financial reports, every major recommendation needs a visual or numeric decision surface: scenario bars, waterfall, allocation chart, runway gap chart, spend category chart, or control matrix. Do not bury spend options in paragraphs.
- On mobile, preserve information density: reduce hero height, keep nav on one horizontal scroll row, tighten section/card padding, keep metrics in 2 columns when they fit, and make only the wide element scroll instead of the whole page.
- Every table, diagram, flow, code block, and long path must be wrapped or styled so it cannot force page-level horizontal scrolling on screens down to 360px wide.
- Use `scroll-margin-top` on sections/headings and visible `:focus-visible` states for links, buttons, and summaries.
- Every system explainer should have at least two real visuals: a flow/system map plus a state, decision, timeline, or ownership diagram.
- If the doc has more than 3 subtopics, add a drill-down index: high-level cards at the top that link to real, linkable `.html` pages. Prefer existing canonical docs first; create a new companion page only when no suitable deeper doc exists.
- Each companion or canonical drill-down page should include a short summary, evidence, file/snippet links, and a way back to its parent/orchestrator when it is part of a nested set.
- Orchestrator docs should be routing surfaces: explain how systems relate, then link to the real deeper docs for each system, feature, or example set.
- Do not make explainer/drill-down cards link to `#section` anchors in the same document. Same-page anchors are allowed only for sticky tables of contents, back-to-top links, or small local controls.
- Put exhaustive details in appendices or collapsible sections.
- Prefer concrete labels over meta narration. Do not write "This document explains..." when the heading already says that.
- Lead each section with the conclusion, then evidence.

## Doc Type Selection

| User ask                              | Kind               | Default sections                                                                       |
| ------------------------------------- | ------------------ | -------------------------------------------------------------------------------------- |
| "how subscription cancellation works" | `system-explainer` | Summary, surface map, runtime flow, state model, code map, gotchas, verification hooks |
| "review this PR"                      | `pr-review`        | Summary, diff tour, architecture impact, findings, verification, reviewer checklist    |
| "research X"                          | `research-report`  | Executive summary, source map, findings, tradeoffs, recommendation, appendix           |
| "make me a tool to edit X"            | `custom-editor`    | Editor, validation, preview, export, source data                                       |

These are shared built-in kinds. If the repo config defines its own kind taxonomy, follow that — and the engine's `contract` command is authoritative for kind names and how a kind maps to source/output paths and public routes.

## Process

1. Classify the doc. Pick one kind from Doc Type Selection (or the repo's kinds). If ambiguous, choose the smallest useful kind.
2. **Load repo config** (Step 0) and apply its style, brand, output paths, docs host, templates, examples, and commands.
3. Investigate.
   - For repo topics, use that repo's canonical docs/search helpers when they exist.
   - Read nearby `CLAUDE.md` / `AGENTS.md` guidance for the relevant package.
   - Use `rg` for symbols, endpoints, files, and existing docs.
   - For third-party systems, fetch official docs.
   - Separate raw evidence from current canonical knowledge before writing.
4. Pick visuals. Use the repo's living examples and the package's component gallery to choose only visuals that clarify the topic.
5. Scaffold. Use `npx github:aneym/how-to-work new <kind> <slug>` (or the repo's configured scaffold command). Do not leave placeholder diagrams or placeholder file paths in the final artifact.
6. Fill the artifact. Author semantic `.doc.md`; keep the main path concise; put exhaustive refs in appendices. Render user-facing dates readably.
7. Compile durable knowledge. If the result changes future repo understanding, update the affected canonical Markdown, hub/index, log, and companion links before handoff.
8. Verify.
   - HTML file exists in the right location with non-zero bytes.
   - No broken local asset references.
   - Important file paths and commands are selectable text.
   - `npx github:aneym/how-to-work verify` passes (plus any repo-configured checks).
   - Durable HTML docs support system light/dark mode when the repo requires it.
   - Mobile viewport check passes at 390px wide: no body-level horizontal scroll, no clipped nav text, tables/diagrams scroll inside their own containers, and the first screen shows real content instead of only oversized hero chrome.
   - If served, the URL returns `200 OK` and `Content-Type: text/html`.
9. Provide the link. Use the repo's configured serve/link commands when present; `serve.tailscale.enabled` wins over `canonicalUrlBase`, and `devUrlBase` is only the fallback. End with the browser URL and absolute editor path to the HTML file. Keep the reply terse — do not restate the artifact contents in chat.

## Required HTML Hooks

Durable docs include:

| Hook               | Purpose                                                                |
| ------------------ | ---------------------------------------------------------------------- |
| `data-doc-title`   | Human title                                                            |
| `data-doc-kind`    | The doc kind (one of the shared kinds, or the repo's configured kinds) |
| `data-doc-date`    | `YYYY-MM-DD`                                                           |
| `data-doc-source`  | Main topic or source branch/path                                       |
| `data-doc-section` | Stable section ids on each section                                     |

## Anti-Patterns

- Writing a giant essay in HTML, or pasting a long chat dump into a page.
- The generic AI-report scaffold. These tells make every doc look machine-stamped regardless of brand: a sticky pill-nav topbar, tiny uppercase eyebrow kickers above every section, numbered section markers as scaffolding ("01 · Summary"), grids of identical badge cards, side-stripe (`border-left`) callouts, gradient text, and clamp()-inflated 60px+ hero headings. Docs are editorial documents, not app shells: masthead, headline, dek, prose at a readable measure, evidence as minimal tables and bespoke diagrams. Numbers and cards earn their place only when the content genuinely is a sequence or a set of unlike things.
- Raw ISO timestamps as the primary visible date label.
- Wrapping ordinary sections in cards just to make them feel designed.
- Faking a complete approval/decision packet when the evidence is not ready.
- Recreating CSS from scratch when the engine already owns the theme and templates.
- Treating the current templates as a ceiling. They are defaults; improve them when a better reusable pattern appears.
- Hardcoding one repo's brand, commands, hosts, ports, or paths in this shared user-level skill.
- Hiding useful facts inside screenshots or canvas-only drawings.
- Adding interaction that does not help compare, decide, validate, or export.
- Restating the entire artifact in the final chat message after providing the link, or asking whether the user wants a linked doc after they already asked for one.
- Turning a `/doc` explainer into an implementation PRD. If the doc starts needing owners and work lanes, switch to `/prd` or the repo's PRD/send-it workflow.
