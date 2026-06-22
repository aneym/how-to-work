---
{
  "title": "Flag cleanup nudges — stop flags from outliving their feature",
  "kind": "working-doc",
  "slug": "working-doc",
  "date": "2026-06-22",
  "lifecycle": "idea",
  "summary": "Half-formed idea, captured before it evaporates: flags pile up. A flag that's been at 100% for 90 days is just dead code wearing a feature-flag costume, and it's a real source of confusion and risk. What if Drift nudged the owner to clean it up? This is a working doc — a thinking surface, not a plan. The point is to get the idea legible enough to decide whether it's worth a real PRD.",
  "tags": ["tech-debt", "flags", "lifecycle", "idea"],
  "stage": "Working doc",
  "nextAction": "Decide: is this worth promoting to a Draft PRD? If yes, the first real fork is how we detect 'stale' without nagging on intentional permanent flags."
}
---

:::callout {"tone": "accent", "strong": "Status:"}
Working doc — a place to think out loud. Nothing here is decided or scoped. If it survives
contact with a few questions, it graduates to a Draft PRD; if not, it dies here cheaply.
:::

## The itch

Every flag is born with good intentions and a plan to be removed. Almost none are. A flag
that's been serving 100% of traffic the same variant for three months isn't a feature
flag anymore — it's a permanent `if (true)` branch that nobody trusts enough to delete. They
accumulate. The codebase fills with dead conditionals; the dashboard fills with flags nobody
remembers the purpose of.

Drift can *see* this happening — we know each flag's rollout state and how long it's been
stable. We're the one system positioned to notice and say something.

## The rough idea

A gentle, owner-targeted nudge when a flag looks done: *"`checkout-redesign` has served 100%
the same variant for 90 days. Archive it?"* — with a one-click archive and a way to mark it
as an intentional permanent flag so we stop asking.

- Detect "stale" from rollout state + time-stable, not from code (we don't see the code).
- Nudge the **owner**, not a firehose channel — make it feel like a helpful teammate.
- Make "this is permanent on purpose" a first-class answer so we never nag twice.

## Open thinking (not yet forks)

- **What counts as stale?** 100%-for-N-days is the obvious signal, but a flag that's been at
  a 50/50 holdout for a year might be a deliberate long-running experiment, not debt. The
  detection can't be naive.
- **Nudge where?** In-app inbox is least annoying; email risks being ignored; a PR comment on
  the repo would be most actionable but means we'd need repo access we don't have today.
- **Is archiving even safe?** Archiving a flag the SDK still references needs to fail safe —
  serve last-known, not error. That might be its own small piece of work.

## Why it might be worth doing

:::rows
Pull :: Customers complain about flag sprawl in basically every QBR.
Unique position :: We're the only system that knows a flag's full lifecycle state.
Small surface :: Detection + a nudge + an archive action. Plausibly a one-sprint v1.
Risk :: Nagging is worse than silence. Get the "permanent on purpose" escape hatch right or it's annoying.
:::

## Next step

If this is worth it, promote to a Draft PRD and grill the real fork first: **how do we tell
genuine debt from an intentional long-running flag** without nagging people who know exactly
what they're doing? That's the question that makes or breaks the whole idea — answer it
before scoping anything else.
