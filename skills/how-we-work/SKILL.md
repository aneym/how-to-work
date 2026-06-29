---
name: how-we-work
description: Canonical workflow for turning fuzzy intent into a working HTML PRD, grilling decisions, tracking progress, and sending approved work through maker/checker loops. Use when starting non-trivial planning, architecture/workflow design, PRD creation, durable background work, or saying send it. Almost all How We Work / specing work should create or update an HTML surface the author can follow along in.
version: 0.1.0
minEngine: "how-to-work >= 0.1.0 (Node >= 18)"
metadata:
  tags: [workflow, prd, doc, send-it, progress, ledger]
---

# How We Work

## Step 0 — Load config first

This skill drives the **how-to-work** engine. Before scaffolding, grilling, rendering, serving, or sending anything, load the repo's config and confirm the engine is current. The engine resolves and deep-merges the config for you; you only need to know where it lives so you never hardcode a path, host, theme, port, or command.

1. Probe order (highest precedence first — the engine merges all that exist):
   1. `.agents/skill-config/workflow/config.json` — canonical unified config (wins)
   2. `.claude/skill-config/workflow/config.json` — legacy location
   3. `.agents/skill-config/doc/config.json` / `.claude/skill-config/doc/config.json` — legacy split (back-compat fallback)
   4. the engine's bundled `config/defaults.json` — neutral generic defaults when the repo ships none
2. Validate / sync: run `npx github:aneym/how-to-work check` (add `--online` to compare against the latest published engine). It checks engine-version drift and config-schema drift and prints the exact `init` / `init --migrate` fix command. Run the printed command when it exits non-zero. If there is no config yet, `npx github:aneym/how-to-work init` stamps one. (These skills invoke the GitHub form `npx github:aneym/how-to-work …` because the package is not yet published to npm; once it is, this becomes `npx how-to-work@latest …`.)

The keys this workflow reads: `brandName`; `doc.{sourcesDir, prdsDir, plansDir, catalogPath, docsIndexRoute, themeFile, stagesPath}`; `answerGate.{base, mode}`; `canonicalUrlBase`; `devUrlBase`; `serve.{command, host, port, portRange, tailscale}`; and the optional agent-guidance fields `workOsLinking`, `dataSpine`, `executionEnv`, `styleName`, `styleSummary`, `livingExamples`. Generic semantics belong in this skill; repo-specific output paths, docs host, catalog adapter, examples, validation commands, theme tokens, Tailscale URL, and execution environment belong in that in-repo config bundle. `npx github:aneym/how-to-work init` writes it — edit the config rather than forking this skill.

Never hardcode a workspace's brand, host, paths, ports, data spine, or commands. Read them from config; fall back to the engine's neutral defaults only when no config exists.

## Core rule

A working doc is a proto-PRD. Create one canonical HTML PRD artifact early, then mature the same artifact instead of splitting thinking and execution into disconnected files.

Treat focus and completion as a daily loop, not as generic reminders. Opening/closeout systems should force a Top 3 outcome choice, name what to ignore, close the loop at night, and preserve state for the next morning. Avoid productivity theater: every check-in should either sharpen today's outcomes, surface a blocker, or update tomorrow's first move.

When writing PRDs or prioritizing work, be **self-aware of the current goals and the latest snapshot** when they exist (today's Top 3 / focus and the work snapshot) and assign priority relative to them — never in a vacuum. Produce a **walkable order**, not a flat list: highest-priority context first, so the day is a path you move through room to room. Support **focus-scoped re-ranking** — when the author chooses to drive one project, the items they need to respond to _there_ float to the top and other contexts recede until the focus changes.

Almost all `/how-we-work` specing work should create or update an HTML surface the author can follow along in. Do not keep substantial specing only in chat, markdown, or internal notes unless the author explicitly asks for a text-only pass.

Lifecycle:

1. Working doc
2. Draft PRD
3. Ready for approval
4. Approved
5. In execution
6. Done

Default package:

```text
docs/prds/<slug>/        # <slug> under config doc.prdsDir
  index.doc.md    # semantic source        (created by `new`)
  state.json      # machine-readable state  (seeded by `new`)
  ledger.jsonl    # reverse-chron events     (seeded by `new`)
  index.html      # author-facing surface: PRD / Progress / Ledger tabs (emitted by `render`)
  artifacts/      # created during execution (send-it), not by new/render
  workers/        # created during execution (send-it), not by new/render
  checks/         # created during execution (send-it), not by new/render
```

Scaffold it with `npx github:aneym/how-to-work new prd <slug>` (writes `index.doc.md` + empty `state.json`/`ledger.jsonl`); render with `render` (emits `index.html`); update the catalog with `register --all`. The `artifacts/`, `workers/`, and `checks/` subdirs are not created by `new`/`render` — they appear during execution. The resource/artifact tree is authored as a `:::resources` block inside `index.doc.md`; there is no separate `resources.json`.

App features with user-created durable data should use the repo's configured durable data spine (config `dataSpine`) from v1. `state.json` and `ledger.jsonl` track PRD/workloop execution; they are not the app database. `localStorage` is acceptable only for visual spikes or disposable review state.

- Keep PRD slugs concise. Do not prefix slugs with `canonical-`; canonical status is implied by the PRD package and workflow. Example: use `agent-defaults-skills-manifest`, not `canonical-agent-defaults-skills-manifest`.

## PRD review and approval order

Review PRDs dependency-first, not oldest-first:

1. Resolve upstream/platform primitives first. If a new upstream PR or platform feature may obsolete a custom design, check it out or inspect it before approving implementation.
2. Approve the enabling PRD next, for example local sync or a safe dogfood lane.
3. Update and approve the system PRD after the primitive is proven.
4. Implement lower-level defaults/tooling PRDs last, using the hardened workflow instead of manual one-off execution.

When the author says a PRD "needs to be reframed after we checkout" a linked PR, do that in this order: checkout a clean worktree, verify PR status/files, reframe the PRD, update state/ledger, regenerate the HTML surface, then verify the served link.

## Required surfaces

- **PRD tab:** problem, goal, non-goals, decisions, scope, requirements, acceptance criteria, risks, open blockers.
- **Progress tab:** current state, lifecycle stage (phase), task/resource tree, worker runs, blockers, next action.
- **Ledger tab:** reverse-chron events from the first working-doc decision through execution closeout.
- **Design system:** the engine owns the PRD shell and theme — warm neutral background, compact header, chips, exactly PRD/Progress/Ledger tabs, no blue focus ring, `1/2/3` keyboard tab shortcuts, question cards, the stage bar (lifecycle stage indicator), and the left-rail dot ledger timeline. The repo's `doc.themeFile` wins when set; otherwise the bundled default theme applies. Do not generate bespoke one-off PRD themes or alternate ledger cards.
- **Docs index:** a lifecycle dashboard for working artifacts, with filters/counts for Active, Scoping, Ideas, and Archive. Active work should surface ahead of merely recent scoping docs. Regenerate it with `npx github:aneym/how-to-work index`.
- **Main workflow surface:** route bot-level / cross-repo / personal How-We-Work docs and PRDs to the repo your config designates as the workflow home; put product/repo-specific PRDs in the owning repo. Do not pick a destination solely because it is the current working directory.

Progress is measured by lifecycle **stage** — the canonical sequence Working doc → Draft PRD → Ready for approval → Approved → In execution → Done (sourced from config `doc.stagesPath`, or the engine's built-in 6-stage lifecycle when null, and a doc's frontmatter `stage`) — rendered as a monochrome segmented stage bar, or a circular stage ring in tight spaces like a sidebar; a percent-complete is deprecated and at most secondary.

The Problem statement stays inside the PRD tab. Do not make a separate Problem tab.

## Canonical PRD HTML containers

The engine's PRD shell is canonical for this class of docs. The engine emits it from your `.doc.md` source, so author semantic source — not HTML — and avoid these regressions:

- Do not wrap question cards inside each other. Each question is a sibling `<article class="qcard">...</article>` inside one `<div class="qstack">`.
- Do not preserve a Markdown body `# Title` inside the PRD tab. The shell header owns the title; strip the first H1 from rendered body content.
- The engine's containers are: `<div class="qreview" data-qstack>` (wrapping the `<div class="qstack">` of question cards), `<section id="progress">`, and `<section id="ledger">`. (There is no `questions-block` or `prd-body` class — verify against `qreview`/`data-qstack`, not those names.)
- Ledger uses the left-rail dot timeline: `.timeline` with sibling `.event` blocks. Do not use card-style ledger articles unless the author approves a redesign.
- Verify generated HTML mechanically (`npx github:aneym/how-to-work verify`): no `</div><article class="qcard">`, no `<h1>` immediately after the questions block, all three tab buttons exist, and the served URL returns `200 text/html`.

## Grill protocol

Put `Questions blocking the PRD` near the top of the PRD tab. The full protocol lives in the `grill` skill — apply it here:

- Batch only independent questions; dependent questions happen one at a time.
- Each card includes Problem, Question, and a Recommendation; stable IDs `Q1`, `Q2`, `Q3`.
- **Never end a recommendation with a "Reply X to accept / X &lt;custom&gt;" line** — the recommendation ends with the actual recommendation. Cards are interactive (approve / disapprove + a custom answer per card) and auto-generate the reply shorthand via the Copy-answers button.
- **After posting questions, START THE ANSWER GATE — never make the author copy-paste.** Run `npx github:aneym/how-to-work grill ask --doc <slug> --base <answerGate.base>` (foreground when you can wait, else background). It opens the ask so the doc's question section lights up ("the agent is waiting for your answers"), polls the gate, and hands you the answers the instant the author clicks "Submit to agent" — over loopback or a tunnel alike. Gate behavior follows `answerGate.mode`: in `local`/`custom` mode, posting questions without starting the gate strands the submitted answers in the store (recover via `GET <answerGate.base>/result?key=<docKey>`); in `none` mode there is no server, so the Copy-answers button is the equivalent and a missing live gate is expected, not a bug.
- After the author answers, remove resolved cards from the top queue, write decisions into Decisions/ADR, and append ledger events.
- **Update every visible surface in the same pass.** State/ledger alone are not enough. If the author answered questions, the HTML PRD must not still show `open` badges or stale next actions. Update the `.doc.md` source, `state.json`, `ledger.jsonl`, the rendered `index.html`, and the docs catalog together, then verify the served page.
- **A custom or "idk" answer is not a close — refine, then re-grill.** Fold the intent into a sharpened recommendation and re-present that one card; pick the _minimal_ option that still makes the next action obvious. Only move a card into `:::decisions` (`[Decided <date>]`) once it is genuinely settled.
- **Feedback on a rendered surface edits the source, never the HTML.** A screenshot or comment on a rendered page → edit the `.doc.md` (+ `state.json`/`ledger.jsonl`), re-render, re-verify — the rendered page must never lag the latest decision. Prefer elegant `:::html` SVG diagrams (`box`/`arrow`/`svg-title`) for models and flows; lead with the conclusion; favor cards/rows/diagrams over walls of text.

## Companion `/doc`

Use `/doc` for durable understanding: architecture recommendations, tradeoff reports, PR explainers, corrected recommendations, and shareable system maps.

If a task is both a durable decision and executable work, maintain the PRD and add a `/doc` companion. The PRD remains the execution surface.

## External maker handoffs

When passing a design, UI, or migration project directly to another agent or maker, still route through the PRD surface first. Do a read-only scout when the work spans repos or design systems, save the scout under the PRD `artifacts/`, turn the scout into explicit decision gates, then hand the maker bounded phases while a checker verifies/publishes.

## Execution: worktrees & branches

**`main` is the live, canonical version. Do substantive work in an ephemeral git worktree on a branch, never directly on `main`.** This keeps the running app — and anyone else's concurrent uncommitted work — safe while a change is built and tested in isolation.

**Reserve the worktree for substantial work** — long-running or potentially-breaking changes (rule of thumb: more than ~a minute to implement, or it could break the running app). Small, quick, low-risk edits ride `main` directly; the worktree's setup/teardown overhead only pays off when an isolated build/test actually protects the running app. The worktree branch is ephemeral — it builds green and lands the same session, never a long-lived branch.

Flow:

1. **Safe cutoff first.** Before starting, get `main` to a clean, committed, functional state — commit (or set aside) outstanding work so the worktree branches from a known-good baseline. Never branch off a half-broken tree. When committing work you did not author (e.g. concurrent changes), report exactly what is in the commit.
2. **Create an ephemeral worktree** with `git worktree add` (or the repo's worktree helper, config `executionEnv.worktreeUp`). It branches off committed `main` HEAD, installs deps, restores gitignored runtime assets, and — when the repo declares one (config `executionEnv.isolatedBackend`) — provisions an isolated dev backend with its own data so schema/function changes never touch the shared/prod backend. Start the dev server on a free port (never the port the main checkout occupies).
3. **Build + test inside the worktree.** Typecheck, build, and run the acceptance/live tests there. Nothing merges until it is green _there_. For long-running builds, serve the worktree on its separate port and give the author the live preview URL so they can QA before merge.
4. **Commit in the worktree**, then **merge to `main`** (fast-forward or a reviewed merge) and **rebuild** so the canonical app picks it up.
5. **Tear down the worktree** (config `executionEnv.worktreeDown`, or `git worktree remove`) — stop the dev server + isolated backend and delete its data dir; refuse if there is uncommitted work unless forced. Worktrees are ephemeral — one per unit of work.

Rules:

- Never edit `main`'s working tree for substantial/long-running/breaking work — it risks the live app and entangles concurrent work. Small, quick, low-risk changes and doc/PRD-surface updates ride `main` directly.
- Preserve concurrent uncommitted work: at the cutoff, commit deliberately and report what is being committed.
- Only merge to `main` after the worktree's build/tests pass and the change is committed there. Then rebuild the canonical app.
- **A worktree branches from HEAD — only branch when the baseline is committed.** If outstanding work genuinely cannot be committed first (e.g. live, in-progress schema/code another session owns), a worktree would _strand_ it. In that narrow case work on `main`'s checkout with a tight owned-files boundary until it is safe to commit, then isolate.
- **Treat a shared-backend deploy like a shared DB migration.** Durable DATA can be shared, but function/schema _code_ is per-deployment global mutable state — safe to deploy only when (1) the contract is committed on `main` and (2) only `main` deploys. Ship by merging to committed `main`, then run the repo's deploy step (config `executionEnv.deploy`) from `main` — never from a stale or contract-uncommitted checkout. The shared `main` checkout must never be repointed off the shared backend.
- **Long-running worktree builds get a live QA preview — surface the URL, don't make the author ask.** The worktree's dev server runs on its own free port; give the author that preview URL as soon as there is something worth looking at, and again at each meaningful checkpoint. State plainly which server is which. When the worktree has an isolated backend, schema/API changes show in the preview immediately too.

## Send-it gate

Do not send-it until the PRD has:

- scope and non-goals
- acceptance criteria
- current state
- reverse-chron ledger
- resource tree
- approval for meaningful side effects

**The moment send-it starts, do the send-it-start ritual — set the goal, then flip the live surfaces, before any worker dispatch or building:**

1. **Author and set your own goal prompt** — compile the PRD into a single self-contained objective the loop drives on: objective + concrete done-condition (the acceptance criteria) + next move + held-for-author gates + an on-wake/recovery line, written so a cold-started or watchdog-woken thread can re-enter without reconstructing intent from chat. Persist it as loop state (`state.json` `execution.goalPrompt`, the ticket `resumePrompt` when a thread exists) and surface a compact version at the top of the doc; re-read it each iteration and on recovery.
2. **PRD lifecycle stage → "In execution"** on every surface together (`.doc.md` frontmatter `stage`, `state.json` `stage`/`phase`/`progressPct`, a `ledger.jsonl` event, the re-rendered HTML, and the verified served URL). An approved-but-executing PRD must never still read "Ready for approval".
3. **The PRD's own work ticket → in progress / agent** — only when the repo declares a Work-OS integration (config `workOsLinking`); a normal data write through that integration, not a held action. Repos with `workOsLinking: null` skip this step.
4. **Surface the active worktree/branch at the TOP of the doc** — an execution banner as the first block naming the worktree path, branch, base commit, current lane/step, and the held-for-author items, mirrored into `state.json.execution` (`worktree`/`branch`/`baseCommit`/`lanes`/`currentLane`/`heldForAuthor`). Keep it current as lanes progress; flip it to Done or remove it at closeout. See "Execution: worktrees & branches".

**Send-it runs end-to-end.** After the start ritual, drive the goal to its done-condition autonomously; do not pause at lane/step boundaries to ask permission to continue. The only hard stops are the held gates (commit/push, prod/external deploys, irreversible actions) and a genuine blocker. Reflect progress by updating the surfaces as you go, not by stopping for approval.

When send-it starts, include the loop infrastructure in the PRD state, not just the implementation tasks. Map these tiers onto your agent runtime's primitives:

- **Tier 1:** synchronous delegation for short bounded fanout where the parent needs the result before replying.
- **Tier 2:** one detached background subagent task. Record `delegationId`, `prdId`, `runId`, `itemId`, `ownerSessionId`, `threadId`, and `wakeTarget` so completion maps back to the correct PRD item/thread.
- **Tier 3:** a repo-owned durable workloop for hours-long or multi-worker maker/checker execution. Background delegation is a transport, not the source of truth.
- **Non-agent workers:** run shell/CLI/server/build work in the background with completion notifications.
- **Watchdog:** every active send-it run gets a periodic thread-tied checker. It reads state/ledger/workers/checks, stays silent when healthy, wakes the originating thread only for stale, failed, blocked, retried, or completed work, and pauses/removes itself when the run reaches Done, Archived, or Cancelled.

The send-it loop drives the final goal inside send-it; it does not replace PRD/progress.

## Serving and repo routing

- Docs should be automatically served. Before closeout, verify the browser-openable URL, not just the filesystem path.
- Each project has its own docs port in config (`serve.port`, with a stable hash fallback from `htw init`). Do not reuse another project's running docs port just because it was the old default.
- Final replies put the clickable web URL first and the local path second. Use `npx github:aneym/how-to-work link <rendered-html-path>` to compute the handoff URL from config. If `serve.tailscale.enabled` is true and `serve.tailscale.urlBase`/`host` is configured, that Tailscale URL is the primary link: verify it and send it, not a localhost URL or raw HTML filepath. Otherwise prefer `canonicalUrlBase`; fall back to `devUrlBase` only when no shareable host is configured.
- If no served URL exists, say that explicitly and treat serving as a blocker/follow-up, not a normal closeout.
- Put cross-repo / personal / agent-workflow docs on the configured workflow home; put product/repo-specific PRDs and reports in the owning repo's docs package and docs host. The workflow home may index or link those repo-owned docs.
- If asked to scope `/doc`, `/how-we-work`, agent-workflow docs, or workflow infrastructure while the shell is sitting in another checkout, route to the configured workflow home by default — not to the current working directory solely because that is where you are.

## Send-it watchdog verification

When scoping or testing send-it watchdogs, do not treat watchdog-create success as proof that thread wakeback works. The proof is that the assistant receives a new re-entered message in the originating thread. Verify end-to-end:

1. Create a one-shot no-agent watchdog that delivers to the origin thread with a unique sentinel such as `WATCHDOG_WAKEBACK_OK`.
2. Record the returned job id, scheduled time, and expected sentinel.
3. Wait for the sentinel to re-enter the assistant thread. The user seeing it elsewhere is not the success condition.
4. If the sentinel does not arrive, inspect the watchdog state: last run, last status, last delivery error, next run, state.
5. Keep a durable fallback: the watchdog writes events to state/ledger, and the surface reads them from state. Do not depend only on chat injection until the re-entry path has been proven in that thread.

Healthy watchdog checks should stay silent. Only stale, failed, blocked, retried, or completed runs should wake the originating send-it thread.

## Closeout

Every PRD/workloop response ends with:

```text
Outcome:
PRD: <path-or-url>
Doc: <path-or-url-or-none>
Files changed:
Validation:
Known risks:
Next exact prompt/action:
```

Always include the direct PRD path or URL after creating or updating a PRD. If a PRD was created as Markdown first, treat that as an interim source file only: create or update the canonical `index.html` PRD surface before closeout unless the author explicitly asked for Markdown-only. Markdown-only PRDs are insufficient by default.

When the author invokes `/doc` alongside PRD work, keep the PRD as the execution surface and create a companion `/doc` artifact. The closeout must link both surfaces: `PRD:` points to the HTML PRD, `Doc:` points to the companion doc or says `none`.

## Related

- Sibling skills: `scope` (the one-line scoping entrypoint), `grill` (the full question protocol), `doc` (durable understanding artifacts), and the repo's `send-it` workflow for execution.
- The package's `components.md` (semantic component vocabulary), `tokens.md` (theme tokens / re-skinning), and `README.md` document the engine and its commands.
