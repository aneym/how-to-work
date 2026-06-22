# Tokens

Every visual in a How To Work doc reads from CSS custom properties declared in
`templates/theme.css`. That is the whole re-skin story: because each component
reads a token, a ~15-line `:root{}` patch restyles the **entire** surface with
no engine change and no per-doc CSS. The default is a warm-walnut editorial
system — parchment ground, warm near-black ink, walnut accent, sharp rectangles.

## Token vocabulary

### Surface ramp

| Token         | Light     | Dark      | Used for                                  |
| ------------- | --------- | --------- | ----------------------------------------- |
| `--bg`        | `#f7f4ee` | `#1a1714` | Page background (warm parchment)          |
| `--fg`        | `#1f1d1a` | `#ece6dc` | Body ink (warm near-black)                |
| `--muted`     | `#6f685e` | `#9a9082` | Secondary text, labels, captions          |
| `--line`      | `#ddd4c6` | `#3a342d` | Hairline borders, dividers, shadow ring   |
| `--panel`     | `#fffaf2` | `#221e1a` | Card / callout / tab surface              |
| `--soft`      | `#eee5d7` | `#2b2620` | Chips, code, inset fills, upcoming stages |
| `--accent`    | `#6f4d2f` | `#c79a6e` | Walnut — links, focus rings, active marks |
| `--on-accent` | `#fdfaf4` | `#1a1714` | Text/icons on an accent/green/red fill    |

### Semantic

| Token     | Light     | Dark      | Used for                             |
| --------- | --------- | --------- | ------------------------------------ |
| `--green` | `#1f6b4a` | `#7fce9f` | "Decided / Done", approve, success   |
| `--amber` | `#8a5a12` | `#dcab5e` | "Open / Pending", caution, warnings  |
| `--red`   | `#9f2f2f` | `#e89090` | "Risk / Blocker", disapprove, errors |

### Shape & depth

| Token                   | Default                              | Notes                                          |
| ----------------------- | ------------------------------------ | ---------------------------------------------- |
| `--radius`              | `0`                                  | House style: sharp rectangles. Patch to round. |
| `--shadow-border`       | hairline ring + soft layered ambient | Shadow-as-border on cards / question cards     |
| `--shadow-border-hover` | walnut ring + lift                   | Card hover state                               |

`--shadow-border` replaces flat 1px borders on `.card` / `.qcard` with a layered
transparent shadow (a `0 0 0 1px` hairline ring plus soft ambient depth); the
`-hover` variant adds a walnut ring and pairs with a `translateY(-1px)` lift.

### Type

| Token            | Default                                                              |
| ---------------- | -------------------------------------------------------------------- |
| `--font-display` | `"Space Grotesk", "Public Sans", ui-sans-serif, system-ui, …`        |
| `--font-body`    | `"Public Sans", ui-sans-serif, system-ui, -apple-system, sans-serif` |
| `--font-mono`    | `"Spline Sans Mono", ui-monospace, SFMono-Regular, monospace`        |

Headings use `--font-display`; body uses `--font-body`. Space Grotesk and Public
Sans are **self-hosted** as `@font-face` data URIs at the end of `theme.css`
(base64 WOFF2 variable subsets from `templates/fonts/`) — zero external requests,
zero FOUT, fully offline. The mono face falls back to the system mono stack.

## Baked-in polish (free for every doc)

Authored once in the theme + engine emission, never in your markup:

- `-webkit-font-smoothing: antialiased` + `-moz-osx-font-smoothing: grayscale`.
- `text-wrap: balance` on headings; `text-wrap: pretty` on lede / paragraphs / list items.
- `--shadow-border` depth + `:hover` lift on cards (shadows over borders).
- Staggered enter (`@keyframes docCardIn`, ~70ms cascade, first six cards) under a
  `prefers-reduced-motion: reduce` guard.
- Tab crossfade (`@keyframes docPanelIn`) on the active panel.
- `:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px }` on
  tabs and grill buttons — the keyboard-only accent ring that **fixes** the prior
  `outline:none` regression.
- `font-variant-numeric: tabular-nums` in data contexts (chips, IDs, counts,
  stage numerals, ledger timestamps, code).
- 40px minimum hit area on tabs and grill buttons; `scale: 0.96` on `:active`.
- Enumerated transitions only — never `transition: all`; `will-change` limited to
  transform/opacity/filter.

## Two-tier per-repo override (no engine fork)

The engine resolves the theme from config, in precedence order. Set these under
`doc` in the repo's `.agents/skill-config/workflow/config.json`:

1. **Full replace** — `config.doc.themeFile`: the engine inlines that CSS file
   verbatim (absolute or repo-relative). `themeTokens` is ignored. Use this to
   keep an entirely separate brand CSS.

   ```json
   { "doc": { "themeFile": ".agents/skill-config/doc/templates/theme.css" } }
   ```

2. **Token patch** — `config.doc.themeTokens`: the engine concatenates the base
   `theme.css` + your `:root{}` patch. Because every component reads tokens, a
   short patch re-skins the whole surface. The patch's `:root` wins the cascade
   (it is appended after the base).

   ```json
   { "doc": { "themeTokens": "templates/theme-tokens.css" } }
   ```

3. **Bundled default** — neither set: the gorgeous warm-walnut theme ships.

A patch is missing/ignored safely (a stale key never crashes a render). Both
absolute (package) and repo-relative paths are handled.

### Example: a 15-line re-skin

`templates/theme-tokens.css` — cool slate + teal, rounded corners:

```css
/* themeTokens patch — cool slate + teal re-skin, rounded corners */
:root {
  --bg: #eef2f5;
  --fg: #14202b;
  --muted: #5a6b78;
  --line: #cdd8e0;
  --panel: #ffffff;
  --soft: #e2eaf0;
  --accent: #0e7c86;
  --on-accent: #ffffff;
  --radius: 8px;
}
```

That single block restyles backgrounds, ink, borders, accent (links, focus
rings, active marks, the progress fill, ledger markers, the stage bar accents),
on-accent text, and every corner radius across the entire doc — no engine
change, no per-doc CSS.
