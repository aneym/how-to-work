#!/usr/bin/env node
/**
 * build-fonts.mjs — embed the self-hosted WOFF2 subsets into theme.css as base64
 * data URIs, so the inlined theme ships fonts with zero external requests and
 * zero FOUT. Idempotent: re-running re-generates the @font-face block from the
 * raw assets in ./fonts/ (it replaces everything after the marker comment).
 *
 * Run from anywhere: `node templates/build-fonts.mjs`. Node builtins only.
 *
 * The raw WOFF2 files in ./fonts/ are the canonical bundled assets; this script
 * is the build step that bakes them into the shipped theme.css. To swap fonts,
 * drop new WOFF2 in ./fonts/, update FACES below, and re-run.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const THEME = join(HERE, "theme.css");
const MARKER = "/* === SELF-HOSTED FONTS";

// Both are variable WOFF2 (one file covers the whole weight axis).
const FACES = [
  {
    family: "Public Sans",
    file: "PublicSans-variable-latin.woff2",
    weight: "100 900",
  },
  {
    family: "Space Grotesk",
    file: "SpaceGrotesk-variable-latin.woff2",
    weight: "300 700",
  },
];

function dataUri(absFile) {
  const b64 = readFileSync(absFile).toString("base64");
  return `data:font/woff2;base64,${b64}`;
}

function buildBlock() {
  const lines = [
    "/* === SELF-HOSTED FONTS — base64 WOFF2, embedded by build-fonts.mjs.",
    " * Variable fonts: one file per family covers the whole weight axis.",
    " * Regenerate with `node templates/build-fonts.mjs`. === */",
  ];
  for (const face of FACES) {
    const uri = dataUri(join(HERE, "fonts", face.file));
    lines.push(
      "@font-face {",
      `  font-family: "${face.family}";`,
      "  font-style: normal;",
      `  font-weight: ${face.weight};`,
      "  font-display: swap;",
      `  src: url(${uri}) format("woff2");`,
      "}",
    );
  }
  return lines.join("\n") + "\n";
}

function main() {
  const css = readFileSync(THEME, "utf8");
  const markerAt = css.indexOf(MARKER);
  if (markerAt === -1) {
    console.error(`build-fonts: marker not found in theme.css (expected "${MARKER}")`);
    process.exit(1);
  }
  // Keep everything up to the marker line; replace the rest with a fresh block.
  const head = css.slice(0, markerAt);
  const out = head + buildBlock();
  writeFileSync(THEME, out);
  const kb = (Buffer.byteLength(out, "utf8") / 1024).toFixed(1);
  console.log(`build-fonts: embedded ${FACES.length} font families -> theme.css (${kb} KB)`);
}

main();
