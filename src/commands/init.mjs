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
 *               split .agents/skill-config/doc/config.json) AND the repo's
 *               current canonical unified config (highest precedence) into the
 *               rewritten file — so a restamp preserves the repo's customization
 *               and only refreshes the engineVersion stamp and derived docs port.
 *   --force     overwrite an existing unified config.
 *
 * Node ESM, built-ins only.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { installAgentInterfaces } from "../interface-files.mjs";
import { finalizeServeConfig, projectDocsPort } from "../links.mjs";

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
  const port = projectDocsPort(root);
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
      docsIndexRoute: "/docs",
      stagesPath: null,
    },
    canonicalUrlBase: null,
    devUrlBase: `http://127.0.0.1:${port}`,
    // "none" = zero-server copy-only (Submit/poll are 404-safe no-ops). A repo
    // opts into the live grill loop by switching to "local" once it runs
    // `htw serve --answer-gate`. Matches the bundled config/defaults.json floor.
    answerGate: { base: "/api/hwq", mode: "none" },
    serve: {
      command: "npx github:aneym/how-to-work serve --answer-gate",
      host: "127.0.0.1",
      port,
      portRange: { start: 8600, end: 8999 },
      tailscale: { enabled: false, urlBase: null },
    },
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

// Seed the bundled canonical "How-To-Work" packet (the doc-about-docs) into a
// fresh repo so every project ships with the same starter reference set. Never
// clobbers an existing file. Returns the repo-relative paths written.
function seedCanonicalPacket(root, config) {
  const doc = config.doc || {};
  const packetsDir = doc.packetsDir || "docs/packets";
  const sourcesDir = doc.sourcesDir || "docs/sources";
  const tplDir = join(PACKAGE_ROOT, "templates", "packet", "how-to-work");
  if (!existsSync(tplDir)) return [];
  const today = new Date().toISOString().slice(0, 10);
  const written = [];

  const mfTarget = join(root, packetsDir, "how-to-work", "packet.json");
  if (!existsSync(mfTarget)) {
    mkdirSync(dirname(mfTarget), { recursive: true });
    writeFileSync(mfTarget, readFileSync(join(tplDir, "packet.json"), "utf8"));
    written.push(join(packetsDir, "how-to-work", "packet.json"));
  }

  const srcTpl = join(tplDir, "sources");
  if (existsSync(srcTpl)) {
    mkdirSync(join(root, sourcesDir), { recursive: true });
    for (const f of readdirSync(srcTpl)) {
      if (!f.endsWith(".doc.md")) continue;
      const tgt = join(root, sourcesDir, f);
      if (existsSync(tgt)) continue;
      writeFileSync(tgt, readFileSync(join(srcTpl, f), "utf8").replace(/__DATE__/g, today));
      written.push(join(sourcesDir, f));
    }
  }
  return written;
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

  const relTarget = join(".agents", "skill-config", "workflow", "config.json");
  let config = starterConfig(root);

  if (migrate) {
    const legacy = findLegacy(root);
    if (legacy.length === 0) {
      process.stdout.write("htw init --migrate: no legacy .claude/.agents config found.\n");
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
    // Highest precedence: the repo's EXISTING canonical unified config. A restamp
    // (`init --migrate --force` on an already-configured repo) must preserve the
    // current canonical values — brand, style, answerGate.mode, serve.tailscale —
    // not reset them to the generic starter or an older legacy split.
    const existing = readJson(target);
    if (existing) {
      config = deepMerge(config, existing);
      process.stdout.write(`htw init --migrate: folded existing ${relTarget}\n`);
    }
  }

  // Always stamp THIS engine's version last so the migrated/forced config is
  // marked current and `htw check` can detect future drift.
  config.engineVersion = engineVersion();

  // Normalize serve + adopt this project's canonical git-root-derived docs port,
  // overriding any stale baked port (unless the config explicitly pins one).
  finalizeServeConfig(config, root);

  mkdirSync(targetDir, { recursive: true });
  writeFileSync(target, `${JSON.stringify(config, null, 2)}\n`, "utf8");

  process.stdout.write(
    `htw init: wrote ${relTarget} (engineVersion ${config.engineVersion}, docs port ${config.serve.port}).\n`,
  );

  const interfaces = installAgentInterfaces(root);
  if (interfaces.written.length) {
    process.stdout.write(
      "htw init: installed agent interface files:\n" +
        interfaces.written.map((p) => `  + ${p}\n`).join(""),
    );
  }

  // Bootstrap the canonical How-To-Work packet, then build it so the navigator
  // and packet page exist immediately. Opt out with --no-seed.
  if (!args.includes("--no-seed")) {
    const seeded = seedCanonicalPacket(root, config);
    if (seeded.length) {
      process.stdout.write(
        "htw init: seeded the canonical How-To-Work packet:\n" +
          seeded.map((p) => `  + ${p}\n`).join(""),
      );
      const bin = join(PACKAGE_ROOT, "bin", "htw.mjs");
      let built = true;
      for (const step of [["render", "--all"], ["register", "--all"], ["index"]]) {
        const r = spawnSync(process.execPath, [bin, "--root", root, ...step], { stdio: "ignore" });
        if (!r || r.status !== 0) {
          built = false;
          break;
        }
      }
      process.stdout.write(
        built
          ? "htw init: built the packet — open docs/index.html (or `htw serve`).\n"
          : "htw init: run `htw render --all && htw register --all && htw index` to build it.\n",
      );
    }
  }
  return 0;
}
