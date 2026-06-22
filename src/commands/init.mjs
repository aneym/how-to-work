/**
 * htw init — write the per-repo config bundle.
 *
 * Writes {root}/.agents/skill-config/workflow/config.json (the CANONICAL unified
 * location), stamping engineVersion from THIS engine's package.json so `htw
 * check` can later detect version drift. The written config is a generic public
 * starter: it carries only machine-generic keys (paths, theme, answer-gate base,
 * serve) — never any host-private value.
 *
 * Flags:
 *   --migrate   fold an existing legacy config (.claude/skill-config, or the old
 *               split .agents/skill-config/doc/config.json) into the new unified
 *               file before writing.
 *   --force     overwrite an existing unified config.
 *
 * Node ESM, built-ins only.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

// Legacy config locations probed by --migrate, lowest precedence first so the
// most-canonical legacy file wins the merge.
const LEGACY_PATHS = [
  [".agents", "skill-config", "doc", "config.json"],
  [".claude", "skill-config", "doc", "config.json"],
  [".claude", "skill-config", "workflow", "config.json"],
];

// Keys that belong under the unified `doc` sub-object. Used to fold a legacy
// SPLIT doc config (whose doc keys sit at the top level) into the unified shape
// without misplacing its top-level keys (brandName, agent-guidance fields).
const DOC_KEYS = new Set([
  "overlayDir",
  "themeFile",
  "catalogPath",
  "sourcesDir",
  "prdsDir",
  "plansDir",
  "docsIndexRoute",
  "stagesPath",
]);

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// Move recognized doc keys under `doc`, keep everything else at the top level.
function foldSplitDoc(legacyConfig) {
  const docPart = {};
  const topPart = {};
  for (const [key, value] of Object.entries(legacyConfig)) {
    if (DOC_KEYS.has(key)) docPart[key] = value;
    else topPart[key] = value;
  }
  return { ...topPart, doc: docPart };
}

function deepMerge(base, override) {
  if (!isPlainObject(override)) return override;
  const out = isPlainObject(base) ? { ...base } : {};
  for (const [key, value] of Object.entries(override)) {
    out[key] = isPlainObject(value) && isPlainObject(out[key]) ? deepMerge(out[key], value) : value;
  }
  return out;
}

function readJson(absPath) {
  try {
    return JSON.parse(readFileSync(absPath, "utf8"));
  } catch {
    return null;
  }
}

function engineVersion() {
  const pkg = readJson(join(PACKAGE_ROOT, "package.json"));
  return (pkg && pkg.version) || "0.0.0";
}

/**
 * The generic public starter. Generic machine keys only — every host-private
 * value (canonical URL, work-OS linking, hermes answer-gate) stays out of the
 * public engine and lives only in a repo's own overlay if it needs one.
 */
function starterConfig(root) {
  return {
    engineVersion: engineVersion(),
    brandName: basename(root) || "Docs",
    doc: {
      overlayDir: ".agents/skill-config/doc",
      themeFile: null,
      catalogPath: "docs/catalog.json",
      sourcesDir: "docs/sources",
      prdsDir: "docs/prds",
      plansDir: "docs/plans",
      docsIndexRoute: "/prds",
      stagesPath: null,
    },
    canonicalUrlBase: null,
    devUrlBase: "http://127.0.0.1:8765",
    // "none" = zero-server copy-only (Submit/poll are 404-safe no-ops). A repo
    // opts into the live grill loop by switching to "local" once it runs
    // `htw serve --answer-gate`. Matches the bundled config/defaults.json floor.
    answerGate: { base: "/api/hwq", mode: "none" },
    serve: { command: "npm run docs:serve", port: 8765 },
  };
}

function findLegacy(root) {
  const found = [];
  for (const parts of LEGACY_PATHS) {
    const abs = join(root, ...parts);
    if (existsSync(abs)) {
      const parsed = readJson(abs);
      if (parsed) found.push({ path: join(...parts), config: parsed });
    }
  }
  return found;
}

export async function run({ root, args }) {
  const migrate = args.includes("--migrate");
  const force = args.includes("--force");

  const targetDir = join(root, ".agents", "skill-config", "workflow");
  const target = join(targetDir, "config.json");

  if (existsSync(target) && !force) {
    process.stderr.write(
      `htw init: ${join(".agents", "skill-config", "workflow", "config.json")} already exists.\n` +
        `  Re-run with --force to overwrite${migrate ? " (--migrate will fold legacy config in)" : ""}.\n`,
    );
    return 1;
  }

  let config = starterConfig(root);

  if (migrate) {
    const legacy = findLegacy(root);
    if (legacy.length === 0) {
      process.stdout.write("htw init --migrate: no legacy .claude/.agents config found; writing a fresh starter.\n");
    } else {
      for (const { path, config: legacyConfig } of legacy) {
        // A legacy SPLIT doc config (…/doc/config.json) keeps its doc keys at the
        // top level; fold them under `doc` so they land in the unified shape. A
        // legacy workflow config is already unified, so merge it as-is.
        const isSplitDoc = path.includes(join("skill-config", "doc"));
        const folded = isSplitDoc && !("doc" in legacyConfig) ? foldSplitDoc(legacyConfig) : legacyConfig;
        config = deepMerge(config, folded);
        process.stdout.write(`htw init --migrate: folded ${path}\n`);
      }
    }
  }

  // Always stamp THIS engine's version last so the migrated/forced config is
  // marked current and `htw check` can detect future drift.
  config.engineVersion = engineVersion();

  mkdirSync(targetDir, { recursive: true });
  writeFileSync(target, `${JSON.stringify(config, null, 2)}\n`, "utf8");

  process.stdout.write(
    `htw init: wrote ${join(".agents", "skill-config", "workflow", "config.json")} ` +
      `(engineVersion ${config.engineVersion}).\n`,
  );
  return 0;
}
