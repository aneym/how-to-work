# Changelog

## 0.1.0

Initial release. A single zero-dependency engine bundling the grill protocol, scoping,
the how-we-work PRD lifecycle, and the `.doc.md` → HTML render engine.

- `htw` CLI (agent-facing): `init` · `check` · `new` · `render` · `register` · `index` · `verify` · `contract` · `serve` · `grill`.
- Gorgeous warm-editorial default theme; per-repo re-skin via `config.doc.themeFile` or `config.doc.themeTokens` (no engine fork).
- Portable loopback answer-gate (`none` / `local` / `custom` via an `onAnswer` callback).
- Per-repo config resolution: `.agents/skill-config/workflow` → `.claude/skill-config/...` → bundled defaults.
- Self-contained HTML output (PRD / Progress / Ledger tabs, stage bar, interactive grill cards, lifecycle dashboard).
