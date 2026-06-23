---
{
  "title": "Doc authoring cheatsheet",
  "kind": "report",
  "slug": "doc-authoring-cheatsheet",
  "date": "__DATE__",
  "lifecycle": "active",
  "summary": "Every Markdown element and :::block the How-To-Work engine renders, with copy-paste syntax.",
  "tags": ["how-to-work", "reference", "canonical"],
  "stage": "Reference",
  "nextAction": "Keep this open while authoring."
}
---

:::callout {"tone":"accent","strong":"Copy-paste reference."}
The exact Markdown and block syntax the engine renders. If an element isn't here, it renders literally.
:::

## Markdown

| Syntax | Renders |
| --- | --- |
| `## H2` … `#### H4` | section + sub-headings |
| `**bold**`, `_italic_`, `` `code` `` | inline emphasis |
| `[label](https://url)` | link |
| `\$`, `\*` | literal `$`, `*` (backslash escape) |
| `- item` / `1. item` | lists |
| `\| a \| b \|` + `\| --- \| --- \|` | GFM table |

## Blocks

```
:::callout {"tone":"accent|green|amber|red","strong":"Label:"}
Body text.
:::

:::rows
Key :: value
:::

:::decisions
Topic :: [Decided] what was chosen.
Topic :: [Open] what is unresolved.
:::

:::cards
### Card title
Card body.
:::

:::questions
- id: Q1
  title: **Short title**
  question: The full question?
  recommendation: Your recommended answer.
:::

:::resources
Label :: path/or/url
:::

:::html
<svg>…</svg>
:::
```

## PRD-only

PRDs also read `state.json` (stage, status, progressPct, items, acceptance_criteria) and `ledger.jsonl` (one `{title, when, who, body}` per line) to auto-build the Progress and Ledger tabs.
