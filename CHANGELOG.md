# Changelog

## 0.2.0

Rendering completeness, a packet model, and a searchable navigator.

- Markdown: `###`/`####` headings, `_italic_` / `*italic*` (word-boundary safe), backslash escapes (`\), and GFM tables now render — they were emitted literally before.
- Question cards: compact layout; the comment box is collapsed by default (reveals on Disapprove or the inline Comment toggle); resolved questions always collapse into a <details> at the bottom, even alongside open ones.
- `answerGate.mode` is honored at render time: with no gate (`none`) the dead "Submit to agent" button is omitted, leaving Copy-answers as the round-trip.
- Packets: declare a goal's doc set in `docs/packets/<slug>/packet.json` (`{title, goal, canonical, docs:[{ref, role}]}`); member docs render a compact packet header (siblings grouped by role, current highlighted, canonical badge).
- Navigator (`htw index`): a search box with client-side filtering, plus a Packets section above the lifecycle groups.

## 0.1.0

Initial release. A single zero-dependency engine bundling the grill protocol, scoping,
the how-we-work PRD lifecycle, and the `.doc.md` → HTML render engine.

- `htw` CLI (agent-facing): `init` · `check` · `new` · `render` · `register` · `index` · `verify` · `contract` · `serve` · `grill`.
- Gorgeous warm-editorial default theme; per-repo re-skin via `config.doc.themeFile` or `config.doc.themeTokens` (no engine fork).
- Portable loopback answer-gate (`none` / `local` / `custom` via an `onAnswer` callback).
- Per-repo config resolution: `.agents/skill-config/workflow` → `.claude/skill-config/...` → bundled defaults.
- Self-contained HTML output (PRD / Progress / Ledger tabs, stage bar, interactive grill cards, lifecycle dashboard).
- `htw new` accepts the documented positional form (`new <kind> <slug>`) in addition to `--kind`/`--slug` flags.
