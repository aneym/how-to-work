---
{
  "title": "Self-serve SSO — let customers wire their own IdP",
  "kind": "prd",
  "slug": "scoping-draft",
  "date": "2026-06-22",
  "lifecycle": "scoping",
  "summary": "Enterprise prospects keep stalling at the same gate: 'we can't roll Drift out org-wide until it speaks our identity provider.' Today every SSO setup is a hand-held, multi-day support engagement against a YAML file we edit for them. This draft proposes a self-serve SSO configurator — the customer wires Okta/Entra/Google themselves and we get out of the loop. It is a Draft PRD: the genuine forks are open at the top and need answers before we scope acceptance.",
  "tags": ["sso", "enterprise", "self-serve", "identity"],
  "stage": "Draft PRD",
  "nextAction": "Answer Q1–Q3 in the cards below. Q1 (SAML-only vs SAML+OIDC) gates the whole data model; nothing downstream is worth scoping until it lands.",
  "owner": "growth-platform",
  "tabs": ["PRD", "Progress", "Ledger"]
}
---

:::callout {"tone": "amber", "strong": "Draft — needs answers:"}
This is a scoping draft, not an approved plan. The three forks below are real, non-obvious,
and downstream scope depends on them. Answer them in the cards (Approve the recommendation,
Disapprove, or type a custom answer) and the doc advances to a scoped PRD.
:::

## Open questions

:::questions
- id: Q1
  title: SAML-only for v1, or SAML + OIDC together?
  question: Every enterprise IdP speaks SAML 2.0, but our three loudest prospects (and the modern default) lean OIDC. Supporting both from day one roughly doubles the config surface, the test matrix, and the metadata-parsing code — and the two protocols disagree about where identity lives (assertions vs claims). Shipping SAML-only is faster and covers 100% of the asks today, but we'd be back here within a quarter when the OIDC requests land.
  recommendation: SAML-only for v1, with the data model deliberately protocol-agnostic (store a normalized IdentityBinding, not raw SAML). OIDC becomes a second adapter onto the same model, not a rewrite. Ship the thing that closes deals now without painting us into a corner.
  tag: protocol
- id: Q2
  title: Who can configure SSO — and what happens to existing password logins after it's on?
  question: This is the dangerous one. If any org admin can flip on SSO and we hard-disable password auth, a misconfigured IdP locks the entire org out of Drift — including the admin who set it up. But if we leave password auth permanently enabled as a fallback, SSO is security theater: the company's offboarding still doesn't actually revoke Drift access. There's a real tension between lockout-safety and the security guarantee enterprises are buying.
  recommendation: Restrict config to Owner-role only, and ship a two-phase cutover — SSO goes live in "enforced for everyone except break-glass owners" mode first; passwords for non-owners are disabled, but owners retain a password fallback until they explicitly click "fully enforce." A clear, reversible path to the strong guarantee instead of a one-way switch.
  tag: security
- id: Q3
  title: Just-in-time provisioning, or pre-provisioned accounts only?
  question: With JIT, the first time a user authenticates through the IdP we create their Drift account on the fly from the assertion — zero pre-work, but we trust whatever the IdP sends and seats can balloon (and so can the bill) without an admin in the loop. Pre-provisioning (SCIM or manual) means accounts must exist before first login — tighter control over seats and roles, but it reintroduces the manual admin work SSO was supposed to remove.
  recommendation: JIT for v1 with a hard org seat cap as the guardrail (auth succeeds, account creation is refused past the cap with a clear admin-facing error). It delivers the zero-touch experience that makes self-serve worth doing; SCIM becomes a fast-follow for the orgs that need deprovisioning automation.
  tag: provisioning
:::

## Problem

- **SSO is a sales blocker, not a feature.** Four of our last six enterprise deals named
  "no self-serve SSO" as a procurement gate. We're losing the deal at security review.
- **Setup is a manual support burden.** Each onboarding is a 2–4 day back-and-forth where a
  support engineer edits a customer's identity config by hand. It doesn't scale and it's
  error-prone.
- **No audit story.** Buyers ask "who can change auth config and is it logged?" and today the
  honest answer is "a support engineer, in a YAML file, no."

## Why now

We have three signed LOIs contingent on org-wide rollout, and all three rollouts are parked
on SSO. This isn't a someday-platform feature; it's the thing unblocking committed revenue.

## Proposed shape (pending the forks)

:::cards
### Configurator
A guided in-app flow: pick IdP, paste metadata URL / upload XML, we parse and validate, show a "test login" before going live.
### Identity binding
A normalized, protocol-agnostic record of the customer's IdP — so the protocol decision (Q1) is an adapter detail, not a schema rewrite.
### Enforcement modes
The cutover ladder from Q2: off → enforced-with-break-glass → fully-enforced. Reversible until the last rung.
### Provisioning
JIT account creation from the assertion, gated by a seat cap (Q3). SCIM deprovisioning as the named fast-follow.
### Auth audit log
Every config change and every SSO login attempt, who/when/result — the answer to the procurement question.
:::

## What we're NOT deciding yet

Acceptance criteria, the test matrix, and the rollout plan are intentionally absent — they
all depend on Q1–Q3. Scoping them now would be guessing. Answer the forks and this becomes a
real PRD.

@tab Progress

:::progress {"percent": 8, "note": "Scoping only. No engineering has started — and shouldn't until the three forks are answered. The data model (the first thing we'd build) is exactly what Q1 decides."}
### Landed
Problem validated against four lost deals + three contingent LOIs. Draft shape sketched.
### In flight
The grill — Q1–Q3 awaiting answers. Q1 is the gating fork.
### Next
On answers: scope the identity binding schema, write acceptance, size the work, and promote Draft → Ready for approval.
### Risk
Building before Q1 lands risks a SAML-shaped schema that fights OIDC later. The protocol-agnostic recommendation exists precisely to defuse that — but only if it's the accepted answer.
:::

@tab Ledger

:::ledger
- title: Drafted the three forks
  when: 2026-06-22 09:15
  who: alex
  body: Pulled the genuine, non-obvious decisions to the top as grill cards. Protocol scope (Q1), lockout-vs-guarantee (Q2), and JIT-vs-pre-provision (Q3). Each carries a problem, the real tension, and a recommendation.
- title: Validated the problem against pipeline
  when: 2026-06-21 15:40
  who: alex
  body: Four of the last six enterprise losses cited self-serve SSO at security review; three current LOIs are contingent on org-wide rollout that's parked on it. This is revenue-blocking, not roadmap-nice.
- title: Opened the working doc
  when: 2026-06-21 14:00
  who: alex
  body: Started from a fuzzy "we keep losing deals on SSO" intent. Promoted to a Draft PRD once the problem was concrete enough to have real forks.
:::
