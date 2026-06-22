---
{
  "title": "Kitchen Sink — every How To Work component",
  "kind": "prd",
  "slug": "kitchen-sink",
  "date": "2026-06-22",
  "lifecycle": "active",
  "summary": "One gallery doc that exercises every component in the warm-walnut default theme. Render it with the bundled defaults to see the gorgeous-by-default look — card shadows, staggered enter, tabular numerals, accent focus rings — and use it as the visual regression fixture.",
  "tags": ["gallery", "components", "theme"],
  "stage": "In execution",
  "nextAction": "Eyeball the rendered HTML, then drop a 15-line themeTokens patch to confirm a one-file re-skin.",
  "progress": 62,
  "tabs": ["Gallery", "Progress", "Ledger"]
}
---

The author writes semantic `.doc.md` source and **nothing else** — no CSS, no token blocks, no HTML chrome. Every component below comes from a tiny `:::block`, and the shared theme adds font smoothing, balanced text wrap, layered shadows, hover lift, staggered enter, tab crossfade, focus rings and tabular figures for free.

## Callouts

A callout is a toned panel with an optional **strong** lead-in. The tone colors the lead-in: accent (walnut), green, amber, red.

:::callout {"tone": "accent", "strong": "Thesis:"}
Polish lives once in the theme, so every doc is gorgeous for free.
:::

:::callout {"tone": "green", "strong": "Decided:"}
Walnut is the public default; a repo keeps a different look with a config theme override — no fork.
:::

:::callout {"tone": "amber", "strong": "Watch:"}
Self-hosting the fonts as data URIs adds bytes to each self-contained doc — the price of zero FOUT, fully offline.
:::

:::callout {"tone": "red", "strong": "Never:"}
Do not hand-author CSS inside a doc. Write the semantic block and let the renderer apply the theme.
:::

## Cards grid

Six cards so you can watch the staggered enter (and the hover lift). Each `### subhead` becomes a card.

:::cards
### Header
h1, lede and chips, all derived from JSON frontmatter.
### Sections
Each `##` heading becomes a `data-doc-section` anchor.
### Callouts
Toned lead-ins for thesis, decision, caution and warning.
### Cards
This very grid — shadow-as-border depth, staggered in.
### Question cards
Approve / Disapprove / comment / Copy / Submit, live.
### Stage bar
A monochrome segmented lifecycle indicator.
:::

## Definition rows

A `label :: value` list rendered as a hairline definition table.

:::rows
Source of truth :: templates/theme.css
Accent :: walnut `#6f4d2f`
Ground :: parchment `#f7f4ee`
Radius :: 0 — sharp rectangles
Fonts :: Space Grotesk + Public Sans, self-hosted
:::

## Phased rows

The same rows with a walnut left-border for migration / roadmap phases.

:::rows {"variant": "phase"}
Phase 1 :: Refactor the proven theme into tokens
Phase 2 :: Swap the orange ramp for warm walnut + bake in polish
Phase 3 :: Ship the components, docs and the two-tier override
:::

## Decision table

`Decided` reads green, `Open` reads amber.

:::decisions
Default theme :: [Decided] Warm walnut editorial
Font delivery :: [Decided] Self-hosted base64 WOFF2 data URIs
House radius :: [Decided] 0 — sharp rectangles
Mono face :: [Open] System mono vs a self-hosted Spline Sans Mono
:::

## Question cards (interactive grill)

Open questions get live review controls and feed the sticky action bar. Approve / Disapprove, type a custom answer, then Copy or Submit.

:::questions
- id: Q1
  title: Ship walnut as the public default?
  question: Walnut reads editorial and brand-neutral; the louder orange stays available as a repo override.
  recommendation: Yes — walnut is the gorgeous, neutral default.
  tag: theme
- id: Q2
  title: Embed the fonts as data URIs?
  question: Trade a little per-doc weight for zero-FOUT, fully offline, path-agnostic rendering.
  recommendation: Yes — a self-contained doc beats a shared font request.
  tag: fonts
:::

Once every question in a block has a recorded `answer`, the whole block collapses into a low-emphasis, out-of-the-way `<details>`:

:::questions
- id: Q0
  title: Refactor the proven theme rather than author fresh?
  answer: Yes — refactor the proven theme.css and swap the ramp; do not author from prose.
  tag: approach
:::

## Progress block

A percent bar plus sub-cards. (PRDs usually show the stage bar in the header instead of a percent.)

:::progress {"percent": 62, "note": "Theme, components and the two-tier override have landed; docs and the render eval remain."}
### Landed
Walnut tokens, baked-in polish, the 8 component reference templates.
### In flight
components.md, tokens.md and the kitchen-sink gallery.
### Next
Render eval + a 15-line themeTokens re-skin smoke test.
:::

## Resource tree

`label :: link` resources render as linked definition rows.

:::resources
Theme :: ../templates/theme.css
Tokens :: ../tokens.md
Components :: ../components.md
Fonts :: ../templates/fonts/
:::

## Diagram (SVG escape hatch)

The `:::html` block is the bespoke-diagram escape hatch — raw SVG using the theme's `.box` / `.box-accent` / `.arrow` classes (scripts and event handlers are stripped).

:::html
<div class="diagram"><svg viewBox="0 0 760 150" role="img" aria-label="source to engine to self-contained HTML">
  <defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" fill="var(--accent)" />
    </marker>
  </defs>
  <rect class="box" x="20" y="45" width="180" height="60" />
  <text class="svg-title" x="110" y="72" text-anchor="middle">.doc.md</text>
  <text class="svg-small" x="110" y="92" text-anchor="middle">semantic source</text>
  <rect class="box-accent" x="290" y="45" width="180" height="60" />
  <text class="svg-title" x="380" y="72" text-anchor="middle">engine</text>
  <text class="svg-small" x="380" y="92" text-anchor="middle">+ theme.css</text>
  <rect class="box-green" x="560" y="45" width="180" height="60" />
  <text class="svg-title" x="650" y="72" text-anchor="middle">index.html</text>
  <text class="svg-small" x="650" y="92" text-anchor="middle">self-contained</text>
  <path class="arrow" d="M200,75 L286,75" />
  <path class="arrow" d="M470,75 L556,75" />
</svg></div>
:::

## Empty state

:::html
<div class="empty">Nothing here yet — this is the empty-state component.</div>
:::

## Prose, code and inline marks

Body prose supports **bold**, `inline code`, [links](../README.md), and lists:

- Unordered items wrap with `text-wrap: pretty`.
- Numerals use tabular figures in data contexts: 1,024 · 2,048 · 4,096.

1. Ordered lists render too.
2. Headings use Space Grotesk; body uses Public Sans.

```js
// Fenced code blocks use the mono stack + tabular numerals.
const theme = themeCss(); // base + optional :root token patch
```

@tab Progress

:::progress {"percent": 62, "note": "Maker lane L3-theme: refactor + polish + components + wiring complete; docs + eval in flight."}
### Theme
Walnut ramp + dark counterparts, shadow-as-border, staggered enter, focus-visible rings, tabular figures.
### Components
8 reference templates + components.md + tokens.md.
### Wiring
Two-tier override (themeFile full replace, themeTokens base + :root patch) wired into the engine.
:::

@tab Ledger

:::ledger
- title: Refactored the proven theme to warm walnut
  when: 2026-06-22
  who: maker
  body: Swapped the orange Raw-Concrete ramp for walnut; tokenized radius, on-accent and the shadow-border depth.
- title: Fixed the .tab focus a11y regression
  when: 2026-06-22
  who: maker
  body: Replaced outline:none / box-shadow:none with a keyboard-only :focus-visible accent ring on tabs and grill buttons.
- title: Embedded self-hosted fonts
  when: 2026-06-22
  who: maker
  body: Space Grotesk + Public Sans baked in as base64 WOFF2 data URIs for zero-FOUT, fully offline docs.
- title: Wired the two-tier theme override
  when: 2026-06-22
  who: maker
  body: config.doc.themeFile full-replaces; config.doc.themeTokens concatenates a :root patch onto the base — a 15-line block re-skins the whole surface.
:::
