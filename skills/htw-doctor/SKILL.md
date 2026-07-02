---
name: htw-doctor
description: "End-to-end docs-system repair. /htw-doctor diagnoses a repo's How To Work setup (engine/config drift, missing or stale interface shims, stale renders, catalog gaps, stage divergence, hand-authored HTML forks, rotting grill questions), applies every mechanical fix via the engine, and grills the author on the judgment calls. Run it when docs look wrong, after engine upgrades, or on any repo that has drifted."
version: 0.1.0
minEngine: "how-to-work >= 0.4.0 (Node >= 18)"
metadata:
  tags: [workflow, doctor, repair, drift, docs, htw]
---

# /htw-doctor — fix the docs system end to end

The deterministic doctor does everything mechanical; your job is the judgment remainder and closing the loop with the author. Never fix by hand what the doctor fixes by machine, and never decide by machine what the doctor marked as the author's call.

## Protocol

1. **Diagnose.** `npx --yes github:aneym/how-to-work doctor --json`. Exit codes: 0 healthy · 1 mechanical issues · 2 clean-but-judgment-pending.
2. **Mechanical pass.** On exit 1: `npx --yes github:aneym/how-to-work doctor --fix`, then re-run `--json`. The fixer restamps config (`init --migrate --force`), refreshes all interface shims, syncs divergent frontmatter stages FROM `state.json` (the authority), scaffolds missing `state.json`/`ledger.jsonl`, and re-renders + re-registers + re-indexes everything. If mechanical issues survive `--fix`, investigate before continuing — that is a real bug, not a judgment call.
3. **Grill the judgment items.** Everything in the report's `judgment` list is the author's call. Present them as grill cards — in a maintenance doc when the repo renders docs, else as direct questions — one card per item, with a real recommendation:
   - `hand-authored-prd` — a `docs/prds/<slug>/index.html` with no source. Options: **adopt** (reverse-scaffold `index.doc.md` from the HTML + `state.json` + `ledger.jsonl`, then re-render and diff), **archive** (move aside, note in ledger), **delete**. Recommend adopt for anything whose state.json moved in the last month.
   - `unmappable-stage` — ask which canonical stage the doc is really in, then `htw stage set <slug> "<stage>"`.
   - `open-questions` — unanswered grill cards. Ask: still relevant? Re-ask live (`htw grill ask --doc <slug> --apply`) or take answers in chat and `htw grill resolve <slug>`.
   - `legacy-shim` — old `how-we-work` shims; recommend removal (canonical entrypoint is `/htw`).
   - `not-initialized` — confirm the repo should use How To Work at all before running `init`.
4. **Apply answers atomically.** `htw stage set`, `htw grill resolve`, `htw ledger add`, file moves for archives — never hand-edit state/ledger/HTML.
5. **Closeout.** `doctor` must exit 0. Report: what was fixed mechanically, what the author decided, what changed, and the served docs-index URL from `htw link` (start `htw serve` if nothing is listening). If anything was deferred, say so explicitly.

## When to run

- Docs look stale, wrong, or missing from the index; links 404; stage bars contradict reality.
- After an engine upgrade (the ambient drift warning points here).
- Periodically on long-lived repos — doctor is idempotent and cheap when healthy.
