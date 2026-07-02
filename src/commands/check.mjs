/**
 * htw check — staleness + config-schema validator.
 *
 * Two axes, both surfaced with a concrete fix line:
 *   1. VERSION drift — the engineVersion stamped in the repo config vs the
 *      version of THIS running engine (and, with --online, vs the latest
 *      published version). A repo stamped behind the running engine, or a repo
 *      that expects a newer engine than is installed, fails with the exact
 *      upgrade command. For an `npx how-to-work@latest` consumer the running
 *      version IS latest, so this axis is a no-op and check reduces to the
 *      schema validator.
 *   2. SCHEMA drift — the repo config is validated against the keys this engine
 *      expects. A missing required key (e.g. one a newer engine added) fails
 *      with the key and how to repair it.
 *
 * Exits 0 when the repo is current and in-schema; non-zero otherwise. Also emits
 * non-fatal warnings for dead workflow-kit assets (unwired base.css / prd.html /
 * python verify.py) so they can be retired.
 *
 * Node ESM, built-ins only.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

// The unified config file, highest precedence first.
const UNIFIED_PATHS = [
  [".agents", "skill-config", "workflow", "config.json"],
  [".claude", "skill-config", "workflow", "config.json"],
];

// Legacy split files — present means "migrate", not "valid unified config".
const LEGACY_SPLIT_PATHS = [
  [".agents", "skill-config", "doc", "config.json"],
  [".claude", "skill-config", "doc", "config.json"],
];

// The keys this engine reads and therefore expects a stamped config to carry.
// Optional keys (canonicalUrlBase, devUrlBase, serve, and any agent-guidance
// fields) are intentionally NOT required — the engine ignores what it does not
// recognize, so unknown keys never fail validation.
const SCHEMA = {
  top: ["engineVersion", "doc", "answerGate"],
  doc: [
    "overlayDir",
    "themeFile",
    "catalogPath",
    "sourcesDir",
    "prdsDir",
    "plansDir",
    "docsIndexRoute",
    "stagesPath",
  ],
  answerGate: ["base", "mode"],
  answerGateModes: ["none", "local", "custom"],
};

// Dead workflow-kit assets to flag (relative to repo root). See critique fix #5.
const DEAD_ASSET_PATHS = [
  [".agents", "skill-config", "workflow", "templates", "prd.html"],
  [".agents", "skill-config", "workflow", "styles", "base.css"],
  [".agents", "skill-config", "workflow", "styles", "theme.tokens.css"],
  [".agents", "skill-config", "workflow", "verify.py"],
  [".agents", "skill-config", "doc", "verify.py"],
  [".claude", "skill-config", "workflow", "verify.py"],
  [".claude", "skill-config", "doc", "verify.py"],
];

function readJson(absPath) {
  try {
    return JSON.parse(readFileSync(absPath, "utf8"));
  } catch {
    return null;
  }
}

function enginePkg() {
  return readJson(join(PACKAGE_ROOT, "package.json")) || {};
}

function engineVersion() {
  return enginePkg().version || "0.0.0";
}

function engineName() {
  return enginePkg().name || "how-to-work";
}

// Parse a SemVer core (ignoring prerelease/build) into a comparable tuple.
function parseVersion(version) {
  const core = String(version || "0.0.0").split("-")[0].split("+")[0];
  const [major = 0, minor = 0, patch = 0] = core.split(".").map((n) => Number.parseInt(n, 10) || 0);
  return [major, minor, patch];
}

// -1 if a < b, 0 if equal, 1 if a > b.
function compareVersions(a, b) {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  }
  return 0;
}

function findUnifiedConfig(root) {
  for (const parts of UNIFIED_PATHS) {
    const abs = join(root, ...parts);
    if (existsSync(abs)) return { rel: join(...parts), abs, config: readJson(abs) };
  }
  return null;
}

function findLegacySplit(root) {
  for (const parts of LEGACY_SPLIT_PATHS) {
    const abs = join(root, ...parts);
    if (existsSync(abs)) return join(...parts);
  }
  return null;
}

function validateSchema(config) {
  const problems = [];
  for (const key of SCHEMA.top) {
    if (!(key in config)) problems.push(`missing required key "${key}"`);
  }
  if (config.doc && typeof config.doc === "object") {
    for (const key of SCHEMA.doc) {
      if (!(key in config.doc)) problems.push(`missing required key "doc.${key}"`);
    }
  } else if ("doc" in config) {
    problems.push(`"doc" must be an object`);
  }
  if (config.answerGate && typeof config.answerGate === "object") {
    for (const key of SCHEMA.answerGate) {
      if (!(key in config.answerGate)) problems.push(`missing required key "answerGate.${key}"`);
    }
    if (
      "mode" in config.answerGate &&
      !SCHEMA.answerGateModes.includes(config.answerGate.mode)
    ) {
      problems.push(
        `answerGate.mode "${config.answerGate.mode}" is not one of ${SCHEMA.answerGateModes.join(", ")}`,
      );
    }
  } else if ("answerGate" in config) {
    problems.push(`"answerGate" must be an object`);
  }
  return problems;
}

function latestPublishedVersion(name) {
  try {
    const result = spawnSync("npm", ["view", name, "version"], { encoding: "utf8", timeout: 15000 });
    if (result.status === 0 && result.stdout) return result.stdout.trim();
  } catch {
    // best-effort only
  }
  return null;
}

export async function run({ root, args }) {
  const online = args.includes("--online");
  const running = engineVersion();
  const name = engineName();

  const warnings = [];
  for (const parts of DEAD_ASSET_PATHS) {
    if (existsSync(join(root, ...parts))) {
      warnings.push(`dead workflow-kit asset present: ${join(...parts)} (unwired — safe to delete)`);
    }
  }

  const found = findUnifiedConfig(root);

  // No unified config: nothing to be stale against. Bundled defaults are always
  // in-schema, so this is not a failure for npx-latest consumers — just advise.
  if (!found || !found.config) {
    const legacy = findLegacySplit(root);
    if (legacy) {
      process.stderr.write(
        `htw check: found a legacy split config (${legacy}) but no unified config.\n` +
          `  Migrate it:  npx ${name}@latest init --migrate\n`,
      );
      return 1;
    }
    process.stdout.write(
      `htw check: no repo config found; the engine will use bundled defaults.\n` +
        `  Stamp a config for staleness tracking:  npx ${name}@latest init\n`,
    );
    for (const w of warnings) process.stdout.write(`  warning: ${w}\n`);
    return 0;
  }

  const config = found.config;
  const problems = [];
  const fixes = [];

  // --- VERSION axis ---
  // Fix commands are pinned to the GitHub ref, NEVER `npx <name>@latest`: the
  // npm registry sat at a stale 0.1.0 for months, so the old @latest fix
  // string was an active DOWNGRADE for every consumer that ran it.
  const invoke = `npx --yes github:aneym/${name}`;
  const stamped = config.engineVersion;
  if (!stamped) {
    problems.push("config has no engineVersion stamp");
    fixes.push(`${invoke} init --migrate --force   # restamp engineVersion (${running})`);
  } else {
    const cmp = compareVersions(stamped, running);
    if (cmp < 0) {
      problems.push(`config stamped for engine ${stamped}, but engine ${running} is running (config is behind)`);
      fixes.push(`${invoke} init --migrate --force   # restamp to ${running}`);
    } else if (cmp > 0) {
      problems.push(`config expects engine ${stamped}, but engine ${running} is installed (engine is behind)`);
      fixes.push(`${invoke} <command>   # the GitHub ref always runs latest main; or update the engine checkout (git pull)`);
    }
  }

  // --- SCHEMA axis ---
  const schemaProblems = validateSchema(config);
  for (const p of schemaProblems) problems.push(p);
  if (schemaProblems.length) {
    fixes.push(`${invoke} init --migrate --force   # rewrite ${found.rel} in the current schema`);
  }

  // --- optional: latest published (best-effort, never fails the command) ---
  if (online) {
    const latest = latestPublishedVersion(name);
    if (latest && compareVersions(running, latest) < 0) {
      warnings.push(`a newer engine is published: ${latest} (running ${running}) — ${invoke} to run it`);
    } else if (latest && compareVersions(latest, running) < 0) {
      warnings.push(
        `the npm registry is STALE (${latest} < running ${running}) — never use \`npx ${name}@latest\`; use ${invoke}`,
      );
    }
  }

  for (const w of warnings) process.stdout.write(`htw check: warning: ${w}\n`);

  if (problems.length === 0) {
    process.stdout.write(`htw check: OK — ${found.rel} is current (engine ${running}) and in-schema.\n`);
    return 0;
  }

  process.stderr.write(`htw check: ${found.rel} needs attention (engine ${running}):\n`);
  for (const p of problems) process.stderr.write(`  - ${p}\n`);
  process.stderr.write(`fix:\n`);
  for (const f of [...new Set(fixes)]) process.stderr.write(`  ${f}\n`);
  return 1;
}
