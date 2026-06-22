---
name: scope
description: One-line entrypoint that jumps straight into the How We Work scoping phase. Use when someone types `/scope <intent>` to turn a fuzzy idea into a draft HTML PRD with grill questions at the top — no working-doc dithering, no execution. Stops at a grilled draft awaiting answers.
version: 0.1.0
minEngine: "how-to-work >= 0.1.0 (Node >= 18)"
metadata:
  tags: [workflow, prd, scoping, grill, how-we-work, entrypoint]
---

# Scope

`/scope <intent>` is a thin entrypoint into the **`how-we-work`** skill. The text after `/scope` is the intent to scope, e.g. `/scope wrap our web app with electron`.

This skill changes only the _entry behavior_: skip the "should we make a doc?" deliberation and go straight to producing the canonical draft PRD surface plus the grill. Everything about _how_ the PRD is built — package shape, HTML shell, ledger timeline, catalog, serving, repo routing — is inherited verbatim from `how-we-work` and the **how-to-work** engine. Do not re-document or diverge from it; if the two ever conflict, `how-we-work` wins.

## Step 0 — Load config first

Same contract as `how-we-work`: before producing the surface, load the repo config and confirm the engine is current.

1. Probe (highest precedence first): `.agents/skill-config/workflow/config.json` (canonical) → `.claude/skill-config/workflow/config.json` (legacy) → `.agents/skill-config/doc/config.json` / `.claude/skill-config/doc/config.json` (legacy split, back-compat) → bundled package defaults.
2. Run `npx github:aneym/how-to-work check` (or `--online`); if it exits non-zero, run the printed `init` / `init --migrate` fix command before scaffolding. (These skills invoke the GitHub form `npx github:aneym/how-to-work …` because the package is not yet published to npm; once it is, this becomes `npx how-to-work@latest …`.)

Never hardcode a workspace's brand, host, paths, ports, or commands — read them from config and fall back to the engine's neutral defaults only when no config exists.

## What `/scope` does

Load and apply the full `how-we-work` contract, then run exactly the **scoping phase**:

1. **Read the intent** from the arguments. If empty, ask one line — "What should I scope?" — and stop.
2. **Route the repo** per `how-we-work` ("Serving and repo routing"): the configured main workflow surface by default for cross-cutting/workflow intents; the owning repo for product/repo-specific work. State the routing decision in one line.
3. **Pick a concise slug** (no `canonical-` prefix) and scaffold the default PRD package: `npx github:aneym/how-to-work new prd <slug>` writes the `.doc.md` source to `doc.prdsDir/<slug>/index.doc.md` (PRD / Progress / Ledger tabs) and also seeds empty `state.json` + `ledger.jsonl` alongside it. The fresh scaffold body is a `:::callout` thesis + `## Problem` + a `:::rows` decision block + a `:::resources` block — no question cards yet; you add the `:::questions` grill block in step 5. Then `render` emits `index.html` into the same `doc.prdsDir/<slug>/` directory (`state.json`/`ledger.jsonl` come from `new`, not `render`).
4. **Draft the PRD tab** from the intent: problem, goal, non-goals, scope, requirements, acceptance criteria, risks. Fill confidently where the intent is clear; mark genuine unknowns as TBD and convert each into a grill card rather than guessing.
5. **Grill at the top.** Put `Questions blocking the PRD` as sibling `qcard`s in one `qstack` at the top of the PRD tab, per the `grill` protocol (Problem / Question / Recommendation; stable `Q1…` IDs; batch only independent questions; no reply-shorthand line). Start the gate with `npx github:aneym/how-to-work grill ask --doc <slug> --base <answerGate.base>` unless `answerGate.mode` is `none` (then the Copy-answers button is the equivalent).
6. **Lifecycle = Draft PRD (Scoping).** Set `state.json` and the Progress tab to scoping; seed `ledger.jsonl` with the working-doc → draft-PRD events.
7. **Register, serve, verify.** `npx github:aneym/how-to-work register --all` updates the catalog; verify the browser-openable URL returns `200 text/html`. The engine owns the HTML shell and theme — no bespoke per-doc themes.
8. **Closeout** with the standard `how-we-work` block, PRD URL first (`canonicalUrlBase` when configured, else the served/`devUrlBase` URL).

## Where `/scope` stops

`/scope` ends at a **grilled draft awaiting answers** — lifecycle stays at **Draft PRD (Scoping)** (the stage step 6 sets), not yet at the **Ready for approval** stage, not approved, not executed. (The draft is ready for the author to _review and answer the grill_; it is deliberately not the "Ready for approval" lifecycle stage, which comes only after the answers land.)

- Do **not** start execution, send-it, worktrees, or any maker/checker loop. Those begin only after the author answers the grill and approves.
- Do **not** answer your own grill questions. Present them and stop.
- This rides on `main` as a PRD-surface update (per `how-we-work` "Execution: worktrees & branches" — trivial doc/PRD-surface updates may ride on `main`). The worktree discipline kicks in later, at send-it.

To continue past scoping, the author answers the grill (`all r`, `1r 2r`, `3 <custom>`) and then says approve / send it, which hands off to `how-we-work` / `send-it` as usual.
