# Changelog

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
