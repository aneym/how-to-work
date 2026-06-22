# how-to-work — QA loop report

Goal (set 2026-06-22): make the skill amazing + Hermes-ready by speccing every feature, testing it, fixing every error, and retesting. Source of truth: [`features.csv`](features.csv).

## Result: loop complete — 0 open errors

| Phase          | Outcome                                                                                                                                                      |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **1 · Spec**   | 131 features enumerated with code-grounded user stories + expected behavior (CLI, components, theme, answer-gate, config, skill protocol, Hermes-readiness). |
| **2 · Test**   | Every feature executed against the engine: **116 pass · 7 errors · 7 partial** (14 issues) → [`errors.md`](errors.md).                                       |
| **3 · Fix**    | All 14 issues fixed + the open-questions-to-top requirement.                                                                                                 |
| **4 · Retest** | All 15 fixes **verified**, **zero regressions** (full CLI smoke + all examples re-rendered clean).                                                           |

**Final status:** 116 tested-pass · 14 verified · 1 verified-by-design · **0 open errors/partials**.

## What got fixed

- **Open questions render first, resolved demoted** (highest-value-at-top) — `renderQuestions` partitions open-before-resolved, stable within each group.
- **`render <absolute-path>` no longer crashes** — path resolution honors absolute paths; a missing path gives a clean error + nonzero exit, not a stack trace.
- **`new` validates the slug** (kebab-case) before any filesystem write.
- **`grill ask` timeout display** shows real seconds (`3s`) instead of `0m` for sub-minute timeouts.
- **Dark-mode-safe** answered-card shadow (token-driven `color-mix`).
- **Resource tree** no longer drops children under a bare parent label.
- **Skill docs synced to the engine** — `answerGate` modes `none|local|custom` (not `hermes`), the real question-wrapper class (`qreview`/`data-qstack`), correct scaffold paths + scope-stop stage, and the `npx github:aneym/how-to-work` invocation form (with a note to switch to `@latest` once published).
- **`/` root** intentionally serves the docs index (deliberate alias; traversal stays confined to `docs/`).

## Hermes-readiness (first-class test axis)

Verified the agent-as-driver path: zero-dependency, machine-readable/deterministic CLI (clean stdout/stderr split, meaningful exit codes), `npx github:` always-latest invocation, the `custom` `onAnswer` answer-gate delivery seam, and the four `SKILL.md` bodies shipped in the package and synced to real engine behavior.
