/**
 * config — the per-repo config resolver (SEAM-2 enabler).
 *
 * The engine USED to hardcode every path/route/theme location (doc-kit.mjs:27-34)
 * and read nothing. This module makes the engine config-driven without regressing
 * Homebase: every baked-in default in BUILTIN_DEFAULTS EQUALS the current Homebase
 * hardcode, so a repo that ships no config (or a legacy Homebase config that does
 * not define these keys) renders byte-identically to today.
 *
 * Resolution: PACKAGE_ROOT (the installed engine, via import.meta.url) locates the
 * BUNDLED defaults; ROOT (process.cwd(), the CONSUMING repo) is where per-repo
 * config and content live. loadConfig() probes, lowest precedence first:
 *   1. inline BUILTIN_DEFAULTS                                  (absolute floor)
 *   2. {PACKAGE_ROOT}/config/defaults.json                      (bundled public defaults)
 *   3. {root}/.claude/skill-config/doc/config.json              (legacy split — back-compat)
 *   4. {root}/.agents/skill-config/doc/config.json              (legacy split — back-compat)
 *   5. {root}/.claude/skill-config/workflow/config.json         (legacy location)
 *   6. {root}/.agents/skill-config/workflow/config.json         (CANONICAL unified — wins)
 * and deep-merges them. The engine then reads only the keys it recognizes
 * (config.doc.*, config.answerGate.base, ...); any host-private / legacy-shaped
 * keys are inert.
 *
 * Node ESM, built-ins only.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { finalizeServeConfig } from "./links.mjs";

// The installed engine's own root (…/how-to-work). Bundled defaults — config,
// theme, templates — resolve relative to THIS, never to the consuming repo.
export const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Baked-in floor. Every value here EQUALS the current Homebase hardcode so
// existing output never regresses. `themeFile: null` => resolve the theme lazily
// (repo overlay if present, else the bundled package theme — see doc-kit.mjs).
export const BUILTIN_DEFAULTS = {
  brandName: "Docs",
  doc: {
    overlayDir: ".agents/skill-config/doc",
    themeFile: null,
    catalogPath: "src/modules/docs/catalog.ts",
    sourcesDir: "docs/sources",
    prdsDir: "docs/prds",
    plansDir: "docs/plans",
    docsIndexRoute: "/docs",
    stagesPath: null,
  },
  answerGate: { base: "/api/hwq", mode: "none" },
};

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

// Recursive merge: objects merge key-by-key; everything else (arrays, scalars,
// null) replaces wholesale, so a higher-precedence config can override a default.
function deepMerge(base, override) {
  if (!isPlainObject(override)) return override;
  const out = isPlainObject(base) ? { ...base } : {};
  for (const [key, value] of Object.entries(override)) {
    out[key] = isPlainObject(value) && isPlainObject(out[key]) ? deepMerge(out[key], value) : value;
  }
  return out;
}

function readJson(absPath) {
  if (!absPath || !existsSync(absPath)) return null;
  try {
    return JSON.parse(readFileSync(absPath, "utf8"));
  } catch {
    return null;
  }
}

/**
 * Resolve the merged config for a consuming repo rooted at `root` (default cwd).
 * Returns the merged object plus the resolved `root`/`packageRoot` so callers
 * (doc-kit) can resolve paths consistently.
 */
export function loadConfig(root = process.cwd()) {
  // Lowest precedence first; later sources override earlier ones.
  const sources = [
    BUILTIN_DEFAULTS,
    readJson(join(PACKAGE_ROOT, "config", "defaults.json")),
    readJson(join(root, ".claude", "skill-config", "doc", "config.json")),
    readJson(join(root, ".agents", "skill-config", "doc", "config.json")),
    readJson(join(root, ".claude", "skill-config", "workflow", "config.json")),
    readJson(join(root, ".agents", "skill-config", "workflow", "config.json")),
  ];

  let merged = {};
  for (const source of sources) {
    if (source) merged = deepMerge(merged, source);
  }

  finalizeServeConfig(merged, root);
  merged.root = root;
  merged.packageRoot = PACKAGE_ROOT;
  return merged;
}
