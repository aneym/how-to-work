---
{
  "title": "how-to-work QA — Feature Status",
  "kind": "report",
  "slug": "status",
  "date": "2026-06-22",
  "lifecycle": "active",
  "summary": "Canonical inventory of the how-to-work kit's enumerated features (99 across six areas), with a live status rollup driving the spec → test → fix → retest loop.",
  "tags": ["qa", "how-to-work", "hermes", "spec"],
  "stage": "Phase 1 complete — spec'd",
  "nextAction": "Phase 2: write the smallest check per feature; flip rows spec'd → testing → verified."
}
---

This is the human-readable surface over `qa/features.csv` — the single source of truth for
the QA loop. Every feature carries a user story, code-derived expected behavior, and a Hermes
relevance note. The loop drives each row spec → test → fix → retest until all 99 are verified.

:::callout {"tone":"green","strong":"Phase 1 complete:"}
99 features compiled and de-duplicated across six areas, IDs **F001–F099**, every row at
`status="spec'd"` with no open errors. The CSV is the artifact the whole loop reads and updates.
:::

## Feature inventory by area

:::rows
cli :: **17 features** (F001–F017) — engine command surface: version/help/root, new, render, register, index, verify, contract, serve (×3), grill ask (×5)
theme :: **12 features** (F018–F029) — walnut light/dark token ramp, self-hosted fonts, and the polish layer (focus rings, stagger/crossfade animations, hover lift)
gate :: **12 features** (F030–F041) — the answer-gate server: delivery modes, the seven HWQ routes, loopback guard, file-backed store, onAnswer backoff, the answer contract
config :: **27 features** (F042–F068) — six-level config probe + deep merge, every `doc.*` / `answerGate.*` key, the three-tier theme cascade, and the full init / check surface
skill :: **25 features** (F069–F093) — the four SKILL.md protocols (how-to-work, grill, scope, doc): config-first, PRD scaffold, 6-stage lifecycle, grill loop, send-it ritual, closeout
hermes :: **6 features** (F094–F099) — the Hermes-readiness contract: npx always-latest, zero deps, stdout/stderr split, deterministic exit codes, config purity, packaged skills
:::

## Status rollup

:::progress {"percent":0,"note":"0 of 99 features verified. Spec complete; tests next. Percent here is verified/total — it climbs only as rows reach status=verified."}
### Spec'd — 99
All rows compiled with user story + expected behavior + Hermes relevance. Awaiting the test phase.

### Testing — 0
No checks have been run yet. Phase 2 flips rows here, then to verified or failed.

### Verified — 0
Done condition: all 99 rows verified and `error_notes` empty on every row.
:::

## Loop artifacts

:::resources
features.csv (canonical spreadsheet) :: ./features.csv
GOAL.md (loop goal + recovery prompt) :: ./GOAL.md
:::
