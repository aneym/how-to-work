# Components

The How To Work renderer turns a tiny semantic `.doc.md` source into a fully
self-contained HTML surface. You write **content and structure only** — the
shared theme (`templates/theme.css`) supplies every visual: font smoothing,
balanced/pretty text wrap, layered card shadows with a hover lift, staggered
enter, tab crossfade, `:focus-visible` accent rings, tabular figures, and the
warm-walnut palette. Polish lives once in the theme; it never appears in your
markup.

- See **[tokens.md](./tokens.md)** for the token vocabulary and the two-tier
  per-repo theme override.
- See **[examples/kitchen-sink.doc.md](./examples/kitchen-sink.doc.md)** for a
  gallery that exercises everything below; render it to a live reference with
  `htw render examples/kitchen-sink.doc.md`.
- The `templates/*.html` files are **reference markup** for each component —
  open them in a browser (they link `theme.css`) to see the rendered look. The
  engine emits this markup programmatically; the files are documentation, not
  inputs, so never hand-wire them into a render.

## Authoring model

A source is JSON frontmatter inside `---` fences, then a body of:

- `## Heading` — a section (becomes a `data-doc-section` anchor).
- `:::name {json opts}` … `:::` — a component block.
- ` ``` ` fenced code, prose paragraphs, `- ` / `1.` lists.
- Inline marks: `**bold**`, `` `code` ``, `[text](href)`.
- `@tab Name` — splits the body into tab regions (PRD / custom tabs).

```
---
{ "title": "...", "kind": "prd", "slug": "my-doc", "date": "2026-06-22",
  "lifecycle": "active", "summary": "...", "tags": ["a"], "stage": "In execution",
  "nextAction": "..." }
---

## Section
:::cards
### Card title
Body text.
:::
```

`kind` is `report` (flat) | `working-doc` (flat) | `prd` (tabbed). Required
frontmatter: `title, kind, slug, date, lifecycle, summary, tags, stage,
nextAction`. `lifecycle` ∈ `active | scoping | idea | archive | implemented`.

---

## Component inventory

### 1. Header

Auto-built from frontmatter: `h1` (title) + `.lede` (summary) + `.chips`
(derived metadata) + the stage bar (PRD) + the tab strip (PRD). No block to
author — fill the frontmatter.

### 2. Sections — `## Heading`

Each `##` becomes `<section data-doc-section="…">`. Headings use Space Grotesk
with balanced text wrap.

### 3. Prose, code, inline marks

Paragraphs, `- `/`1.` lists, ` ``` ` code fences (mono + tabular numerals), and
inline `**bold**` / `` `code` `` / `[link](href)`. Body text wraps with
`text-wrap: pretty`.

### 4. Callouts — `:::callout {"tone","strong"}`

A toned panel with an optional bold lead-in. `tone` ∈ `accent | green | amber |
red`; the tone colors the lead-in (e.g. `<strong style="color:var(--green)">`).

```
:::callout {"tone":"green","strong":"Decided:"}
The recommendation in one line.
:::
```

### 5. Cards grid — `:::cards` + `### subheads`

Each `###` inside the block is a card in a responsive `.grid`. Cards carry the
shadow-as-border depth, a hover lift, and a staggered enter (first six cards
cascade ~70ms apart).

```
:::cards
### Title
Card body.
:::
```

### 6. Definition rows — `:::rows`

`label :: value` lines become a hairline definition table (`.rows` / `.row`).
Add `{"variant":"phase"}` for a walnut left-border (migration / roadmap phases).

```
:::rows
Source of truth :: templates/theme.css
:::
```

### 7. Decision table — `:::decisions`

`label :: [Decided] …` / `label :: [Open] …` lines render as `.rows` with a
tone span on the value: `Decided`/`Done`/`Recommended` → green `.status`;
`Open`/`Pending`/`Caution` → amber `.warn`; `Risk`/`Blocker` → red. You can also
force a tone: `[green: …]` / `[amber: …]` / `[red: …]`.

```
:::decisions
Default theme :: [Decided] Warm walnut editorial
Mono face :: [Open] System vs self-hosted
:::
```

### 8. Inline question threads — `:::questions` (interactive)

Records with `id / title / quote / question / recommendation / tag` render as
floating comments pinned to the body sentence that matches `quote` verbatim,
like Claude artifacts and Figma. That sentence gets a `.qanchor` highlight and
a `.qpin` right after it. Clicking the pin or the sentence opens the `.qthread`
as a popover over the spot, just below the sentence; one opens at a time, and
Escape or a click outside closes it. On phones the popover spans the text
column. There is never a comment sidebar or margin column. An open thread has live **Approve / Disapprove** buttons and an answer textarea,
and the tab carries one sticky answer bar at its foot
(`Clear / Copy answers / Submit to agent`). A record whose quote is not found
renders as a `.qdetached` thread where the block sits. Answered records do not
render; `grill resolve` logs their decisions to the ledger. There is no
question stack and no resolved-questions block.

```
We ship walnut as the default theme.

:::questions
- id: Q1
  title: Ship walnut as the default?
  quote: We ship walnut as the default theme.
  question: Editorial vs louder orange.
  recommendation: Walnut.
  tag: theme
:::
```

### 9. Progress block — `:::progress {"percent","note"}`

An **Overall** `section.card` with a percent `.bar` + note, followed by an
optional grid of `### sub-cards`. (PRDs usually show the stage bar instead.)

### 10. Stage bar / stage ring

A monochrome segmented lifecycle indicator (`.stagebar` `.seg done|current`)
rendered automatically in a PRD header and Progress tab from `stage`
(self-heals via the doc's status). The lifecycle sequence comes from
`config/stages.json`. Opt out with `"stageBar": false`.

### 11. Ledger timeline — `:::ledger`

Records with `title / when / who / body` render as a `.timeline` of `.event`s
with diamond markers; timestamps use tabular figures. For PRDs the Ledger tab
also auto-generates from `ledger.jsonl`.

### 12. Resource tree — `:::resources`

`label :: link` lines render as linked definition `.rows`; an unlinked label
with indented children renders the children as a `·`-joined link list.

### 13. Diagrams — `:::html` escape hatch

Raw HTML/SVG for bespoke diagrams. Wrap an `<svg>` in `<div class="diagram">`
and use the theme's SVG classes: `.box`, `.box-accent`, `.box-green/.amber/.red`,
`.svg-title`, `.svg-text`, `.svg-small`, `.arrow` (+ `.dashed`). Scripts and
event handlers are stripped.

### 14. Tabs — PRD / Progress / Ledger + `@tab`

A PRD is tabbed by default (`["PRD","Progress","Ledger"]`); set `"tabs": [...]`
to rename/reorder. The first tab is the body before the first `@tab`; each
`@tab Name` maps to a tab. Progress/Ledger auto-generate for PRDs when not
authored. Tabs crossfade on switch and expose a keyboard-only accent focus ring;
number keys `1–9` jump tabs.

### 15. Phase rows — `:::rows {"variant":"phase"}`

Definition rows with a walnut left accent border. (See #6.)

### 16. Status / warning inline marks

`.status` (green, e.g. "Decided") and `.warn` (amber/red) inline spans, produced
by the decision/emphasis parser and reusable in prose-tone contexts.

### 17. Chips

Header metadata badges (`.chip`), derived from frontmatter + PRD state; tabular
figures so dates/counts align.

### 18. Empty states — `.empty`

A dashed, centered low-emphasis panel for "nothing here yet". Available via the
`:::html` escape hatch: `<div class="empty">No items yet.</div>`.

---

## What you never write

CSS, `<style>`, token blocks, or layout HTML. If a doc looks flat or off, the
fix is the theme or a `themeTokens` patch (see [tokens.md](./tokens.md)) — never
per-doc styling.
