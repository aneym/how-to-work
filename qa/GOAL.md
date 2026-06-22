# how-to-work QA loop — GOAL

## Objective

Make the how-to-work kit amazing and Hermes-ready by driving **every enumerated feature**
through a closed loop: **spec → test → fix → retest**. The engine, the answer-gate, the
theme, the config system, and the four skills must each do exactly what their user story
and code-derived expected behavior claim — verified, not assumed.

## Canonical artifact

`qa/features.csv` is the **single source of truth** the whole loop reads and updates.
Columns: `id,area,feature,user_story,expected_behavior,hermes_relevance,status,error_notes`.
99 features, IDs `F001`–`F099`, grouped by area (cli, theme, gate, config, skill, hermes).
Every row starts at `status="spec'd"` with empty `error_notes`. The loop mutates only the
`status` and `error_notes` columns — never the spec columns, never the IDs.

Status values: `spec'd` → `testing` → `verified` (passed) or `failed` (broke; reason in
`error_notes`) → back to `testing` after a fix. A row is done only at `verified`.

## The four phases

1. **Spec** (done) — compile each feature's user story + code-derived expected behavior +
   Hermes relevance into `qa/features.csv`. This phase produced the canonical artifact.
2. **Test** — for each row, write/run the smallest check that proves the expected behavior
   (CLI invocation + exit-code/stdout assertion, HTTP probe against the gate, render+grep on
   theme/HTML output, config-merge assertion, skill-doc/engine-support cross-check). Flip the
   row to `testing`, then `verified` on pass or `failed` (with the exact symptom in
   `error_notes`) on fail.
3. **Fix** — for every `failed` row, fix the engine/skill/theme/config so the real behavior
   matches the spec. Never edit the spec to match a bug — fix the code. Audit sibling rows for
   the same class of defect.
4. **Retest** — re-run the check for each fixed row; only `verified` closes it. Re-run the
   whole suite after any cross-cutting fix to catch regressions.

## Done condition

Every feature row in `qa/features.csv` has `status=verified` and zero open errors
(`error_notes` empty on all rows). At that point the kit is proven against its own spec and
ready to hand to Hermes.

## On wake / recovery

Read `qa/features.csv` first — it is the live state, not chat. Find the first row whose
`status` is not `verified` (scan in order: `failed` rows first, then `testing`, then `spec'd`).
Resume the phase that row is in. The rendered status surface is `docs/plans/status.html`
(regenerate with `node bin/htw.mjs render qa/status.doc.md`). Do not re-derive the feature
list from memory — the CSV is authoritative.
