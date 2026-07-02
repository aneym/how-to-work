---
name: htw
description: "/htw is the canonical How To Work entrypoint. Say what you want after it — \"write a doc on X\", \"scope Y\", \"grill me on Z\", \"update progress\", \"send it\" — and it bootstraps repo context and routes to the right protocol itself. Prefer /htw over /how-to-work, /how-to, /doc, /scope, /grill for any docs/PRD/workflow work."
version: 0.1.0
minEngine: "how-to-work >= 0.4.0 (Node >= 18)"
metadata:
  tags: [workflow, entrypoint, dispatcher, prd, doc, grill, htw]
---

# /htw — the one entrypoint

The author should never have to pick a sub-skill. `/htw <anything>` bootstraps, routes by intent, and applies the matching protocol. The long-form names (`/how-to-work`, `/how-to`, `/doc`, `/scope`, `/grill`) remain as aliases and as the deep protocol references.

## Bootstrap (always, before routing)

1. Read `.agents/skill-config/workflow/config.json` — ports, paths, `answerGate.mode`, Tailscale, agent-guidance keys. Never hardcode what it carries.
2. Run `npx --yes github:aneym/how-to-work doctor`. Exit 0: proceed. Exit 1: run `doctor --fix` (mechanical repairs — restamp, shims, re-render, stage sync), then proceed. Exit 2: mechanically clean but judgment items exist — mention them to the author; only switch into full `/htw-doctor` mode if they ask or the current task touches those docs.
3. Pull the full protocol for wherever you route: `npx --yes github:aneym/how-to-work skill <how-to-work|doc|grill|scope>`. Shims and this file are routing surfaces, not the law.

## Route by intent

| The author's ask sounds like…                                | Protocol | First moves |
| ------------------------------------------------------------ | -------- | ----------- |
| "write a doc on…", "explainer", "report", "map this system"  | `doc`    | `htw new report <slug>` → author source → `htw render <slug>` (auto-registers) |
| "scope…", "PRD for…", "should we build…", a fuzzy feature    | `scope` → `how-to-work` | `htw new prd <slug>` → grill the real forks → Draft PRD |
| "grill me", "what's blocking", open decisions on a doc       | `grill`  | cards in the doc → `htw grill ask --doc <slug> --apply` |
| "send it", "build it", "execute"                             | `how-to-work` send-it | gate check → `htw stage set <slug> approved`/`"in execution"` → worktree flow |
| "update progress/stage/ledger", "mark done"                  | atomic commands | `htw stage set` / `htw ledger add` — never hand-edit state/ledger/HTML |
| pasted answers ("Q1 approve…", shorthand, gate JSON)         | ingest   | `htw grill resolve <slug>` (stdin or --file) |
| "docs are broken/stale/messy", "clean up the docs"           | `htw-doctor` | `/htw-doctor` protocol |
| "link", "show me", handoff                                   | serving  | `htw serve` if needed → `htw link <path>` (it verifies the listener) |

Ambiguous asks: default to `scope` for anything that smells like new work, `doc` for anything that smells like understanding. One clarifying question beats a wrong artifact — but only when genuinely torn.

## Hard rules (engine-enforced, so don't fight them)

- Semantic `.doc.md` source only; generated HTML is never hand-edited (verify fails hand-authored dirs).
- `state.json` is the stage authority; `htw stage set` moves every surface atomically. Free-text stages are rejected — use the canonical lifecycle.
- `htw render` auto-registers; `htw verify` fails stale renders and stage divergence — re-render is never optional.
- After posting grill questions, START the gate (`htw grill ask --apply`); answers arriving in chat go through `htw grill resolve`, not manual edits.
- Serve before handoff; the primary link comes from `htw link` (Tailscale preferred), never a raw file path.
