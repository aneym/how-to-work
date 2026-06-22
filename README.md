# how-to-work

A single, zero-dependency engine for **how to do work**: turn a fuzzy intent into a
beautiful, gradable PRD — grill the real decisions, scope it, track it through a
lifecycle, and render it as a self-contained HTML doc you can actually look at.

It bundles four things that are really one workflow:

- **Grill** — surface the genuine forks as interactive question cards; the human answers _in the doc_.
- **Scope** — turn intent into a Draft PRD (problem, goal, non-goals, decisions, acceptance).
- **Lifecycle** — Working doc → Draft PRD → Ready → Approved → In execution → Done, shown as a stage bar (no fake percentages).
- **Doc engine** — render concise `.doc.md` sources into gorgeous, self-contained HTML (PRD / Progress / Ledger tabs, components, a live answer-gate).

> **Designed for agents, not humans.** Humans only do two things: prompt an agent, and
> answer grill cards in the rendered doc. Agents drive the `htw` CLI — it's a terse,
> deterministic, machine-readable API, not a human UX.

## Quickstart

```bash
# always-latest, zero install (from GitHub):
npx github:aneym/how-to-work init        # scaffold .agents/skill-config/workflow/config.json
npx github:aneym/how-to-work new --kind prd --slug my-thing --title "My Thing"
npx github:aneym/how-to-work render docs/prds/my-thing/index.doc.md
npx github:aneym/how-to-work index       # lifecycle dashboard
npx github:aneym/how-to-work serve --answer-gate --port 8765
```

The package is **zero runtime dependencies** — Node built-ins + ESM only. Node ≥ 18.

## The CLI (`htw`)

| Command                     | What it does                                                                      |
| --------------------------- | --------------------------------------------------------------------------------- |
| `htw init`                  | Write the per-repo config bundle; stamp the engine version.                       |
| `htw check`                 | Validate engine version + config schema (CI-friendly, exits non-zero when stale). |
| `htw new`                   | Scaffold a `.doc.md` source (PRD / report / working-doc).                         |
| `htw render`                | Render `.doc.md` → self-contained HTML.                                           |
| `htw register`              | Update the docs catalog (`.json`, or splice a `.ts` catalog).                     |
| `htw index`                 | Emit a static lifecycle dashboard grouped by stage.                               |
| `htw verify`                | Structural + theme checks on a doc.                                               |
| `htw serve [--answer-gate]` | Loopback static server for `docs/`, optionally mounting the answer-gate.          |
| `htw grill ask`             | Open an ask, block until the human submits answers in the doc, return them.       |

## Gorgeous by default, re-skin per repo

A polished warm-editorial theme ships in the engine (real shadows, optical type scale,
tabular numerals, focus rings, restrained motion) — every doc looks great with zero
per-doc styling. To re-skin a repo, you don't fork the engine:

- `config.doc.themeFile` — replace the theme wholesale, **or**
- `config.doc.themeTokens` — a ~15-line `:root{}` patch overriding the design tokens.

All polish lives in the shared theme; your `.doc.md` stays small.

## The answer-gate

Grill cards POST to a same-origin `/api/hwq` endpoint. Three modes via
`config.answerGate.mode`:

- `none` — copy-answers button works with no server.
- `local` — ship the bundled zero-dependency loopback gate (`htw serve --answer-gate`).
- `custom` — wire your own delivery via the `onAnswer(ask)` callback (e.g. push answers to your own agent runtime).

## Config

One file per repo, in the repo (so it travels): `.agents/skill-config/workflow/config.json`
(falls back to `.claude/skill-config/...`, then bundled defaults). Everything host- or
brand-specific lives here — never in the engine.

## License

MIT © Alex Neyman
