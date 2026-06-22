---
{
  "title": "How flag evaluation stays fast at the edge — a system explainer",
  "kind": "report",
  "slug": "research-report",
  "date": "2026-06-22",
  "lifecycle": "implemented",
  "summary": "Drift evaluates feature flags 40M times a day with a p99 under 1ms — without a network call on the hot path. This report explains how: where evaluation actually happens, how rules reach the edge, why we chose a local-SDK model over a remote decision service, and the failure modes that model forces us to design around. Written for an engineer onboarding to the evaluation team, and for the customers who keep asking 'wait, how is this not a network call?'",
  "tags": ["architecture", "edge", "feature-flags", "explainer"],
  "stage": "Done",
  "nextAction": "Use as the canonical onboarding doc for the evaluation team; link from the SDK README."
}
---

The single most common question we get from prospective customers' platform teams is some
version of: *"if every flag check is a decision your service makes, isn't that a network call
in my request path?"* The answer is no — and understanding why is the key to understanding
how Drift is architected. **Flags are evaluated locally, inside your process, against rules
that were already streamed to you.** There is no call to Drift on the hot path. This report
walks the whole pipeline, from a rule change in the dashboard to a sub-millisecond local
decision, and is honest about what that design costs.

:::callout {"tone": "accent", "strong": "The one-sentence model:"}
Drift is a control plane that streams flag *rules* to your SDK; your SDK is the data plane
that *evaluates* them locally — so a flag check is a function call, not an RPC.
:::

## The hot path: where evaluation happens

When your code asks `drift.variation("checkout-redesign", user)`, nothing leaves your
process. The SDK holds the current ruleset for every flag in memory and runs the evaluation
locally: hash the targeting key, walk the rules in order, return the matched variant. That's
why the p99 is a memory access, not a round trip.

:::rows
Evaluation locus :: in-process, inside the customer SDK
Hot-path network calls :: zero
Typical p99 :: < 1 ms (in-memory rule walk + a murmur hash)
Ruleset freshness :: streamed; median propagation ~200 ms from dashboard save to edge
Cold start :: SDK blocks on first ruleset fetch (or uses a bundled bootstrap file)
:::

## The cold path: how rules get to the edge

The interesting engineering isn't the evaluation — it's keeping every SDK's in-memory
ruleset current without polling. A flag change flows control-plane → fan-out → SDK over a
persistent stream:

:::html
<div class="diagram"><svg viewBox="0 0 920 230" role="img" aria-label="rule change propagating from dashboard through the control plane and fan-out to in-process SDK evaluation">
  <defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" fill="var(--accent)" />
    </marker>
  </defs>

  <rect class="box" x="20" y="30" width="170" height="64" />
  <text class="svg-title" x="105" y="56" text-anchor="middle">Dashboard</text>
  <text class="svg-small" x="105" y="78" text-anchor="middle">operator edits a rule</text>

  <rect class="box-accent" x="270" y="30" width="170" height="64" />
  <text class="svg-title" x="355" y="56" text-anchor="middle">Control plane</text>
  <text class="svg-small" x="355" y="78" text-anchor="middle">validate + version</text>

  <rect class="box-accent" x="520" y="30" width="170" height="64" />
  <text class="svg-title" x="605" y="56" text-anchor="middle">Fan-out</text>
  <text class="svg-small" x="605" y="78" text-anchor="middle">SSE / streaming edge</text>

  <rect class="box-green" x="700" y="140" width="200" height="64" />
  <text class="svg-title" x="800" y="166" text-anchor="middle">Your SDK</text>
  <text class="svg-small" x="800" y="188" text-anchor="middle">in-memory ruleset</text>

  <rect class="box" x="20" y="140" width="200" height="64" />
  <text class="svg-title" x="120" y="166" text-anchor="middle">variation()</text>
  <text class="svg-small" x="120" y="188" text-anchor="middle">local, &lt;1ms, no RPC</text>

  <path class="arrow" d="M190,62 L266,62" />
  <path class="arrow" d="M440,62 L516,62" />
  <path class="arrow" d="M690,94 L800,136" />
  <path class="arrow dashed" d="M700,172 L222,172" />
  <text class="svg-small" x="460" y="200" text-anchor="middle">your code calls the SDK locally — the dashed path never touches the network</text>
</svg></div>
:::

1. An operator saves a rule. The **control plane** validates it, assigns a monotonic version,
   and writes it to the authoritative store.
2. The **fan-out** tier holds a persistent SSE connection to every connected SDK and pushes
   the new ruleset version. Median dashboard-to-edge propagation is ~200ms.
3. The SDK swaps its in-memory ruleset atomically. The next `variation()` call evaluates
   against the new rules — still with zero hot-path network.

## Why local SDK over a remote decision service

This is the load-bearing architectural choice. The obvious alternative — a remote "evaluate
this for me" API — is simpler to build and reason about, but it puts Drift in every one of
your request paths. We chose local evaluation, and the tradeoff is deliberate.

:::decisions
Hot-path latency :: [green: Local wins] Memory access vs a network round trip on every flag check.
Availability coupling :: [green: Local wins] A Drift outage degrades to last-known rules, not a hard dependency in your request path.
Rule freshness :: [amber: Remote wins] A remote service is always current; the SDK is current minus propagation lag (~200ms).
Operational simplicity :: [amber: Remote wins] No SDK ruleset state to reason about; one place evaluates.
Audit completeness :: [amber: Remote wins] Remote sees every decision; local SDKs only report sampled events back.
Verdict :: [Decided] Local SDK — request-path latency and availability are non-negotiable for a tool that sits in everyone's critical path.
:::

## What the model costs (and how we pay it)

Choosing local evaluation isn't free — it forces three failure modes we have to design
around explicitly. Pretending otherwise would be the dishonest version of this report.

:::cards
### Cold start
Before the first ruleset arrives the SDK has no rules. We pay this with a bundled bootstrap file (last-known rules shipped with the deploy) and a blocking `waitForInit()` for callers who'd rather wait than guess.
### Propagation lag
A rule change isn't instant everywhere — there's a ~200ms tail. For changes that must be atomic across the fleet (e.g. a coordinated kill), we expose a version barrier so callers can require "at least version N."
### Split-brain reporting
Because each SDK decides locally, our analytics see only sampled events, not every decision. We reconcile with summary counters flushed per-SDK so totals stay correct even when per-event sampling drops detail.
:::

:::callout {"tone": "amber", "strong": "Watch:"}
The ~200ms propagation tail is a *median*. A client on a flaky connection can lag much
further behind. Never assume a rule change is globally live the instant you click save —
gate anything safety-critical behind the version barrier.
:::

:::callout {"tone": "red", "strong": "Never:"}
Do not put a flag check behind its own network call to "make sure it's fresh." That defeats
the entire architecture and reintroduces Drift as a hot-path dependency — the exact thing
local evaluation exists to avoid.
:::

## Numbers in context

:::rows
Daily evaluations :: 40,000,000
Hot-path RPCs per evaluation :: 0
p99 evaluation latency :: < 1 ms
Median dashboard → edge propagation :: ~200 ms
Connected SDK streams (peak) :: 120,000
Ruleset versions per day (busy customer) :: ~2,400
:::

## Takeaways

- A flag check is a **local function call**, not a network request — that's the whole point.
- The control plane streams **rules**, not decisions; freshness is eventual (~200ms), not
  instant, and that's an accepted, designed-around tradeoff.
- The cost of local evaluation is **cold start, propagation lag, and sampled reporting** — each
  has an explicit mitigation, not a hand-wave.
