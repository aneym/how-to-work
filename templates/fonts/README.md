# Fonts

Self-hosted variable WOFF2 subsets, bundled as assets (not npm dependencies):

- `PublicSans-variable-latin.woff2` — body font (`--font-body`), weight axis 100–900.
- `SpaceGrotesk-variable-latin.woff2` — display font (`--font-display`), weight axis 300–700.

These are the canonical source assets. `../build-fonts.mjs` reads them, base64-
encodes each, and bakes an `@font-face` block (with `data:font/woff2;base64,…`
`src`) onto the end of `../theme.css`. The engine inlines `theme.css` into every
doc, so fonts ship **inside** the HTML: zero external requests, zero FOUT, fully
offline and path-agnostic.

To change a font: drop a new WOFF2 here, update the `FACES` table in
`../build-fonts.mjs`, and re-run:

```
node templates/build-fonts.mjs
```

The script is idempotent — it replaces the existing embedded block each run.

Both faces are SIL Open Font License 1.1 (Public Sans by USWDS; Space Grotesk by
Florian Karsten), redistributable with attribution.
