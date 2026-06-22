---
{
  "title": "Rollout Guardrails — auto-halt a bad flag before it pages anyone",
  "kind": "prd",
  "slug": "prd-in-execution",
  "date": "2026-06-22",
  "lifecycle": "active",
  "summary": "Drift ships feature flags to 40M end-users a day. Today a bad gradual rollout is caught by a human watching a dashboard — or by PagerDuty at 3am. Guardrails wires each rollout to its own health signals (error rate, p99, a custom SLO query) and auto-pauses the ramp the moment a signal breaches, before the blast radius grows. This PRD is mid-build: the evaluator and auto-halt are live behind an internal flag; the dashboard surface and the customer-facing audit trail are in flight.",
  "tags": ["feature-flags", "reliability", "guardrails", "rollouts"],
  "stage": "In execution",
  "nextAction": "Land the breach→halt webhook contract (BR-3) so customer alerting can subscribe; then unblock the dashboard timeline (UI-2) which depends on it.",
  "owner": "platform-reliability",
  "tabs": ["PRD", "Progress", "Ledger"]
}
---

A gradual rollout is the safest way to ship a flag — until it isn't. When a new variant
quietly raises the checkout error rate by 4%, the ramp keeps climbing on schedule while the
damage compounds. The only thing standing between a 5%-exposed bug and a 100%-exposed
incident is whether a human happens to be looking at the right Grafana panel. **Guardrails
makes the rollout watch itself**: every ramp carries the health signals that define "still
healthy," and the evaluator pauses the ramp automatically the instant one breaches.

:::callout {"tone": "accent", "strong": "Thesis:"}
A rollout should fail closed. If the signal that proves a variant is safe goes dark or goes
red, the ramp stops on its own — no dashboard vigil, no 3am page to decide the obvious.
:::

:::callout {"tone": "green", "strong": "Send it:"}
Approved 2026-06-19. Evaluator + auto-halt are in execution behind `guardrails_internal`.
Scope is frozen for v1; the webhook contract (BR-3) is the critical path — everything
customer-facing hangs off it.
:::

## Problem

- **Detection is human-paced.** Mean time to notice a bad ramp is ~22 min in our last
  quarter's incidents; three of those breached SLO before anyone paused the flag.
- **The kill-switch is all-or-nothing.** Today an operator can only disable the flag
  entirely, dumping every user back to control — including the 95% who were fine. There's no
  "freeze where we are."
- **No causal record.** When a ramp is rolled back, we can't show the customer *which signal*
  triggered it. Support tickets turn into forensic archaeology across three tools.

## Goal & non-goals

:::rows
Goal :: Auto-pause any gradual rollout within 60s of a bound health signal breaching, and record why.
Goal :: Give operators a "freeze at current %" that holds exposure without reverting to control.
Goal :: Emit a structured breach event customers can subscribe to (alerting, audit, their own automation).
Non-goal :: Auto-*resume* after recovery — v1 halts and waits for a human. Auto-resume is a fast-follow.
Non-goal :: Anomaly detection / ML. v1 evaluates explicit operator-set thresholds only.
Non-goal :: Non-percentage rollouts (ring/cohort targeting) — same engine later, not in v1 scope.
:::

## Decisions

The forks below were resolved during the grill; they are locked for v1.

:::decisions
Halt vs full rollback :: [Decided] Halt = freeze at current %. Full rollback stays a manual operator action.
Signal source :: [Decided] Pull from the customer's existing metrics provider (Datadog/Prometheus) via a saved query — we do not become a metrics store.
Evaluation cadence :: [Decided] 15s poll per active ramp; breach requires 2 consecutive samples to defeat single-spike flaps.
Auto-resume :: [Decided] Out of v1. Halt-and-wait only; resume is a human action with a one-click "continue ramp."
Multi-signal logic :: [Decided] Any-breach-halts (OR). AND-composition deferred until a customer asks.
Breach event delivery :: [Open→Decided] Webhook with HMAC signature, at-least-once, 24h replay buffer. (was the last open fork; resolved 2026-06-21)
:::

## Scope (v1)

:::cards
### Signal binding
Attach 1–3 health signals to a ramp: a saved metric query + comparator + threshold + window. Stored on the rollout, versioned with it.
### Evaluator loop
A per-ramp poller that samples each bound signal every 15s, applies the 2-consecutive-breach rule, and emits a verdict: `healthy | breached | stale`.
### Auto-halt
On `breached` or `stale`, freeze the ramp at its current exposure and flip the rollout to `halted`. Idempotent — re-entrant halts are no-ops.
### Operator surface
A rollout detail page showing the live ramp %, each bound signal's current value vs threshold, and a halt/resume control with the freeze semantics.
### Breach event
A signed `rollout.halted` webhook carrying the rollout id, the triggering signal, the sampled values, and the frozen exposure %. The customer-facing causal record.
### Audit timeline
Every state transition (ramp step, breach, halt, manual resume) appended to an immutable per-rollout timeline, queryable via API.
:::

## Architecture at a glance

The evaluator is a stateless worker; the rollout row is the source of truth. Signals are
*pulled* from the customer's metrics provider so Drift never becomes a time-series database.

:::resources
Evaluator worker :: src/guardrails/evaluator.ts
Signal adapters :: src/guardrails/adapters/
  Datadog :: src/guardrails/adapters/datadog.ts
  Prometheus :: src/guardrails/adapters/prometheus.ts
Halt state machine :: src/guardrails/halt.ts
Webhook dispatcher :: src/guardrails/webhook.ts
Audit log :: src/guardrails/audit.ts
:::

## Acceptance

A breach-to-halt is proven end-to-end when:

1. A ramp with a bound error-rate signal is climbing on schedule.
2. The signal crosses its threshold for two consecutive samples (~30s).
3. The ramp **freezes at its current %** — exposure does not advance, and is not reverted.
4. A signed `rollout.halted` webhook is delivered within 60s of the first breaching sample.
5. The audit timeline shows `ramp_step → signal_breach → halted` with the sampled values.

@tab Progress

:::progress {"percent": 58, "note": "Evaluator + auto-halt live behind guardrails_internal and passing the breach→halt integration test. The webhook contract (BR-3) is the critical path: the dashboard timeline (UI-2) and customer alerting both block on it."}
### Landed
Signal binding schema, the Datadog + Prometheus pull adapters, the 15s evaluator loop with the 2-consecutive-breach rule, and the idempotent halt state machine. Breach→halt passes integration.
### In flight
The signed `rollout.halted` webhook (HMAC + 24h replay buffer) — BR-3, on the critical path. The operator detail page's live signal panel — UI-1.
### Next
The audit timeline API + the dashboard timeline view (UI-2, blocked on BR-3's event shape). Then the freeze/resume control wired to real ramps.
### Risk
`stale` (signal goes dark) currently halts, which is correct but noisy during a metrics-provider outage — we may need a grace window. Flagged for the checker.
:::

### Lanes & owners

:::rows {"variant": "phase"}
Lane A — Engine :: evaluator + halt state machine + adapters (DONE, in internal flag)
Lane B — Contract :: signed webhook + audit event shape (IN FLIGHT — critical path, BR-3)
Lane C — Surface :: operator detail page + dashboard timeline (UI-1 in flight, UI-2 blocked on B)
Lane D — Hardening :: stale-signal grace window + replay-buffer load test (NEXT)
:::

### Open work items

:::decisions
BR-3 webhook contract :: [Open] HMAC signing + 24h replay buffer; blocks all customer-facing work.
UI-1 live signal panel :: [Open] Renders current value vs threshold per bound signal; in flight.
UI-2 dashboard timeline :: [Blocker] Blocked on BR-3 — needs the final event shape.
HD-1 stale grace window :: [Caution] Should a metrics-provider outage trigger mass halts? Decide with checker.
:::

@tab Ledger

Reverse-chronological — newest first.

:::ledger
- title: Resolved the last open fork — breach event delivery
  when: 2026-06-21 16:40
  who: alex
  body: Picked webhook + HMAC + at-least-once with a 24h replay buffer over a polled status API. Customers want push for alerting; the replay buffer covers their downtime. Closes the only Open decision; scope now frozen for v1.
- title: Breach→halt integration test green
  when: 2026-06-21 11:05
  who: maker
  body: Synthetic ramp + a forced Datadog breach freezes the ramp at 25% within 31s (2 samples × 15s + dispatch). Exposure held, not reverted. Verdict transitions logged correctly.
- title: Idempotent halt state machine landed
  when: 2026-06-20 18:22
  who: maker
  body: halt(rolloutId) is re-entrant — concurrent evaluator + operator halts converge to one halted row, one audit event. Resume requires an explicit operator action and emits rollout.resumed.
- title: 2-consecutive-breach rule added to the evaluator
  when: 2026-06-20 14:10
  who: maker
  body: Single-sample halts were flapping on a noisy p99 panel in staging. Requiring two consecutive breaching samples killed the false positives without adding meaningful latency (~15s).
- title: Datadog + Prometheus pull adapters
  when: 2026-06-20 09:30
  who: maker
  body: Both adapters normalize to a single Sample{value, at, ok} shape. Auth via the customer's existing stored provider credentials — no new secrets surface.
- title: Send it — PRD approved, scope frozen
  when: 2026-06-19 10:00
  who: alex
  body: Approved after the grill. Auto-resume and AND-composition explicitly pushed to fast-follow. Engine work (Lane A) started same day behind guardrails_internal.
- title: Grill resolved 6 forks
  when: 2026-06-18
  who: alex
  body: Halt-not-rollback, pull-not-store, 15s cadence, OR-composition, no-auto-resume. The webhook-vs-poll fork was left open and resolved three days later.
:::
