---
{
  "title": "Working with docs (the How-To-Work engine)",
  "kind": "report",
  "slug": "working-with-docs",
  "date": "__DATE__",
  "lifecycle": "active",
  "summary": "How this repo authors durable HTML docs: one engine, many brands. Kinds, the authoring loop, packets, the navigator, and the question round-trip.",
  "tags": ["how-to-work", "docs", "canonical"],
  "stage": "Reference",
  "nextAction": "Author your first doc — htw new report <slug>."
}
---

:::callout {"tone":"accent","strong":"One engine, many brands."}
Every repo writes the same `.doc.md` source and gets a self-contained, theme-aware HTML doc — branded by a small token patch, never a fork of the renderer. You author Markdown; the engine handles layout, theme, dark mode, the catalog, and the navigator.
:::

## The authoring loop

```
htw new <kind> <slug>     # scaffold a .doc.md source
# edit the source
htw render <slug>         # source -> self-contained HTML
htw register --all        # add it to docs/catalog.json
htw index                 # rebuild the searchable navigator
htw verify                # gate against the engine contract
```

In this repo those are wired as `npm run doc:*` / `docs:*` scripts.

## Kinds

| Kind | Use it for | Shape |
| --- | --- | --- |
| `report` | explainers, reviews, research — things to *read* | flat page |
| `prd` | work with ownership and progress | PRD / Progress / Ledger tabs, stage bar, `state.json` + `ledger.jsonl` |
| `working-doc` | a live working surface | tabbed |

## Packets

A **packet** groups one high-level goal's docs so they read as a unit. Declare it in `docs/packets/<slug>/packet.json`:

```json
{ "title": "...", "goal": "...", "canonical": true,
  "docs": [ { "ref": "<catalog-id>", "role": "explainer|prd|reference" } ] }
```

Member docs get a compact packet header (siblings grouped by role, current highlighted), and the navigator surfaces the packet with its own landing page. _Canonical_ packets are long-living references — like this one.

## The navigator

`htw index` builds `docs/index.html`: a search box, a Packets section, and your docs grouped by lifecycle. Served at `/docs/` (and the bare root) by `htw serve`.

## The question round-trip

Drop a `:::questions` block in a doc and a reviewer can answer inline. Two paths:

- **Copy-answers** — works anywhere (static hosts included): answer, click *Copy answers*, paste the shorthand back to the agent.
- **Live Submit → agent** — serve with `htw serve --answer-gate` and run `htw grill ask --doc <slug>`; it blocks, lights up the doc, and prints the answers when *Submit* is pressed.

:::callout {"tone":"amber","strong":"Stay in the supported Markdown."}
Headings `##`–`####`, `**bold**`, `_italic_`, `` `code` ``, links, backslash escapes, GFM tables, and the `:::` blocks. Anything outside that renders literally — see the authoring cheatsheet in this packet.
:::
