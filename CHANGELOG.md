# Changelog

## 0.4.0

The determinism release: the CLI now enforces what the skills used to beg agents to remember, `/htw` becomes the one entrypoint, and `htw doctor` repairs a drifted repo end to end.

- **`/htw` is the canonical invocation** — a dispatcher skill that bootstraps repo context and routes intent (doc / scope / grill / send-it / stage / ledger) itself. Long-form names stay as aliases. New `htw skill <name>` prints any bundled canonical skill so agents always read current law.
- **`htw doctor [--fix] [--json]`** — one command diagnoses engine/config drift, missing or stale interface shims, stale renders, catalog gaps, stage divergence, missing preserved files, hand-authored PRD dirs, and rotting open questions; `--fix` applies every mechanical repair; judgment items are surfaced for the author (driven by the new `/htw-doctor` skill). Exit codes: 0 healthy · 1 mechanical · 2 judgment-pending.
- **`state.json` is the stage authority.** Render, catalog, and verify prefer it over frontmatter; `htw verify` FAILS on divergent or lifecycle-unmappable stages. New atomic `htw stage set <slug> <stage>` (alias-tolerant) moves state + frontmatter + ledger + render + catalog in one transaction; `htw stage get` shows each surface.
- **Atomic ledger + answer ingestion.** `htw ledger add <slug> <event>` appends the one canonical event shape ({ts, event, actor, summary}) and re-renders. `htw grill resolve <slug>` applies pasted answers (Copy-answers packet, shorthand, or gate JSON) to the questions block, decisions, ledger, state, and the rendered page; `htw grill ask --apply` does the same automatically when the gate delivers.
- **Attention-volume law in the renderer:** agent-call decisions collapse behind a count chip (max 5 author decisions visible), ledgers roll up past the newest 3 days, long tabs grow an auto-generated in-tab section nav (`.secnav`).
- **Pipeline enforcement:** `htw render` auto-registers (JSON catalogs) and accepts bare slugs; `htw verify` fails stale renders (any input newer than the output) and hand-authored PRD dirs, and grew `--json`; `htw link` probes the URL before you hand it out (`--strict` for CI).
- **Drift can no longer hide:** every state-changing command runs a <5ms stamp check and prints one warning line with the exact fix; interface shims are version-stamped GENERATED pointers (`/htw`, `/htw-doctor`, plus aliases) that `doctor` audits like config; `htw check` fix strings are pinned to the GitHub ref — the stale npm registry can never be suggested as an upgrade (it was a downgrade).
- **`inline()` corruption fixed:** prose containing `AC1`/`E2E`/`C4`-style tokens no longer renders as `<code>undefined</code>` (NUL-delimited placeholders). Golden-behavior test suite added (17 new cases across render, lifecycle, doctor).

## 0.3.6

- **One canonical docs server per project.** `htw serve` now binds this project's deterministic git-root-derived port (FNV-1a hash of the main-worktree path into `serve.portRange`) instead of a stamped `serve.port`. The derived port wins over a stale or colliding baked value; `serve.port` is only a default now. Pin a fixed port with `--port <n>` or `serve.pinPort: true`.
- New `htw serve --status` lists every active How-To-Work docs server and the repo root that owns it, read from a shared `~/.htw/servers.json` registry (override with `$HTW_HOME`). Entries are written on bind, removed on release, and dead-pid ghosts are pruned on every read.
- `htw serve` refuses to squat a port another project already owns in the registry, printing the owner and this project's derived port (a non-htw process on the port still surfaces as the usual `EADDRINUSE`).
- The port derivation keys off the git **common-dir**, so a repo and all its linked worktrees resolve to the same canonical port.
- Restamp safety: `htw init --migrate --force` now folds the repo's existing canonical unified config at highest precedence (and refreshes the derived docs port), so restamping preserves brand/style/`answerGate.mode`/`serve.tailscale` instead of resetting them to the generic starter.

## 0.3.5

- Grill card style law: cards are written for the author as decision-maker — two to four plain sentences, no jargon; technical evidence stays in the doc body, the card carries only the human fork.

## 0.3.4

- Attention-ordering law across the workflow skills: whatever the author must read or act on renders at the very top — open grill questions first (nothing above the question stack), then decisions, then content; split into tabs when a section earns it.
- Grill hygiene law: cards never include questions that are obvious or already carry a high-confidence agent recommendation — the agent decides those, logs `[Decided] … (agent call, reversible)` in Decisions, and reserves the grill for forks only the author's taste, risk tolerance, or private context can settle.

## 0.3.3

- Renamed the canonical workflow skill from `how-we-work` to `how-to-work`, matching the package, CLI, and generated `/how-to-work` command.
- Kept `how-we-work` as a legacy alias that redirects agents to `how-to-work` instead of preserving two competing workflow concepts.
- Updated `/scope`, `/grill`, generated interface shims, and docs copy to describe `how-to-work` as the one blessed invocation.

## 0.3.2

- `htw init` now installs project-local `how-to-work` skills and `/how-to-work` plus `/how-to` slash-command shims for `.codex`, `.claude`, and `.agents`.
- New `htw interfaces [--force]` command installs or refreshes those interface files without rewriting repo config.

## 0.3.1

- `htw init` now writes a stable project-specific docs port (`serve.port`, `devUrlBase`) so multiple product docs servers can run at once instead of fighting over `8765`.
- New `htw link [path]` command prints the browser URL for a rendered doc and prefers configured Tailscale (`serve.tailscale.enabled`) over localhost.
- Skills now require agents to serve docs and hand back the Tailscale/public URL first; raw HTML paths and localhost links are fallback-only.
- Starter configs now use `/docs` as the docs index route to match the bundled server.

## 0.3.0

- `htw init` now seeds the canonical **How-To-Work** packet (a doc-about-docs explainer + an authoring cheatsheet) into a fresh repo and builds it, so every project starts with the same searchable reference set. Opt out with `--no-seed`.
- New `htw packet` command: list packets and validate that every member ref resolves to a registered catalog id (the CLI/CI gate behind the navigator's "unregistered" flag).

## 0.2.1

- serve: serve the `docs/` tree at both `/docs/*` and bare root paths (`/explainers/x`, `/prds/x/`) so existing links and habits don't 404.
- Packets are clickable: `htw index` generates a per-packet landing page (`docs/packets/<slug>/index.html`) listing member docs by role; the navigator packet card title and the in-doc packet header link to it.

## 0.2.0

Rendering completeness, a packet model, and a searchable navigator.

- Markdown: `###`/`####` headings, `_italic_` / `*italic*` (word-boundary safe), backslash escapes (`\), and GFM tables now render — they were emitted literally before.
- Question cards: compact layout; the comment box is collapsed by default (reveals on Disapprove or the inline Comment toggle); resolved questions always collapse into a <details> at the bottom, even alongside open ones.
- `answerGate.mode` is honored at render time: with no gate (`none`) the dead "Submit to agent" button is omitted, leaving Copy-answers as the round-trip.
- Packets: declare a goal's doc set in `docs/packets/<slug>/packet.json` (`{title, goal, canonical, docs:[{ref, role}]}`); member docs render a compact packet header (siblings grouped by role, current highlighted, canonical badge).
- Navigator (`htw index`): a search box with client-side filtering, plus a Packets section above the lifecycle groups.

## 0.1.0

Initial release. A single zero-dependency engine bundling the grill protocol, scoping,
the How To Work PRD lifecycle, and the `.doc.md` → HTML render engine.

- `htw` CLI (agent-facing): `init` · `check` · `new` · `render` · `register` · `index` · `verify` · `contract` · `serve` · `grill`.
- Gorgeous warm-editorial default theme; per-repo re-skin via `config.doc.themeFile` or `config.doc.themeTokens` (no engine fork).
- Portable loopback answer-gate (`none` / `local` / `custom` via an `onAnswer` callback).
- Per-repo config resolution: `.agents/skill-config/workflow` → `.claude/skill-config/...` → bundled defaults.
- Self-contained HTML output (PRD / Progress / Ledger tabs, stage bar, interactive grill cards, lifecycle dashboard).
- `htw new` accepts the documented positional form (`new <kind> <slug>`) in addition to `--kind`/`--slug` flags.
