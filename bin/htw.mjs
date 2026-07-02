#!/usr/bin/env node
/**
 * htw — How To Work CLI.
 *
 * A thin argument router. It parses a single leading `--root <path>` (the
 * CONSUMING repo to act on; defaults to the current working directory), then
 * dispatches to a command module under src/commands/.
 *
 * Two families of commands:
 *   - Engine-native (init, check): imported and run in-process. They take the
 *     resolved root and the remaining args.
 *   - Doc-kit subcommands (new, render, register, verify, contract): handed to
 *     the doc-kit passthrough, which spawns src/doc-kit.mjs as a child with its
 *     cwd set to the resolved root — doc-kit resolves all paths from
 *     process.cwd(), so setting the child cwd is how --root takes effect without
 *     touching the engine.
 *
 * Node ESM, built-ins only. No dependencies.
 */

const DOC_KIT_COMMANDS = new Set(["new", "render", "register", "verify", "contract"]);

const HELP = `htw — How To Work

Usage:
  htw [--root <path>] <command> [...args]

Commands:
  init [--migrate] [--force]   Write .agents/skill-config/workflow/config.json (stamps engineVersion)
  check [--online]             Validate the repo config against this engine (version + schema drift)
  doctor [--fix] [--json]      Diagnose the whole docs system (drift, staleness, catalog,
                               shims, stage divergence) and apply the mechanical fixes
  interfaces [--force]         Install project-local skills/commands for Codex, Claude, and agents
  new <kind> <slug>            Scaffold a new .doc.md source (kinds: report | working-doc | prd)
  render [<slug>|--all]        Render .doc.md sources to self-contained HTML (auto-registers)
  register [--all]             Add rendered docs to the repo catalog
  index                        Build docs/index.html lifecycle dashboard from the JSON catalog
  link [docs/<path>.html]       Print the browser URL for a rendered doc (prefers configured Tailscale)
  packet                       List + validate doc packets (refs must be registered catalog ids)
  verify [--json]              Validate docs: contract, catalog, staleness, stage divergence
  contract                     Print the doc frontmatter + structure contract
  skill [<name>]               Print a bundled canonical skill (htw, how-to-work, doc, grill, scope)
  stage set <slug> <stage>     Move a PRD's lifecycle stage on every surface atomically
  ledger add <slug> <event>    Append a schema-checked ledger event (+ re-render)
  grill ask --doc <slug>       Open a blocking question gate and wait for answers
                               (--base <answerGate.base>, --no-wait, --stdin-fallback,
                                --apply to write answers into the doc on arrival)
  grill resolve <slug>         Apply pasted answers (packet / JSON / shorthand) to the
                               doc, decisions, ledger, state, and re-render
  serve [--answer-gate]        Serve rendered docs/ over loopback on this project's
                               derived port (--port <n> pins; --status lists every
                               active htw docs server and its owning repo root)

Options:
  --root <path>                Act on this repo instead of the current directory
  -h, --help                   Show this help
  -v, --version                Print the engine version
`;

/**
 * Pull a single `--root <path>` (or `--root=<path>`) out of the arg list,
 * wherever it appears, and return { root, rest } with it removed. The remaining
 * args are passed through to the command untouched.
 */
function extractRoot(argv) {
  const rest = [];
  let root = null;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--root") {
      root = argv[i + 1] ?? null;
      i += 1; // consume the value
      continue;
    }
    if (arg.startsWith("--root=")) {
      root = arg.slice("--root=".length);
      continue;
    }
    rest.push(arg);
  }
  return { root, rest };
}

async function readEngineVersion() {
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const { dirname, resolve, join } = await import("node:path");
  const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  try {
    const pkg = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

// One quiet warning line when the repo's stamped engineVersion differs from
// the running engine. Never blocks, never slows the command down meaningfully.
async function warnOnDrift(root) {
  try {
    const { readFileSync, existsSync } = await import("node:fs");
    const { join } = await import("node:path");
    const candidates = [
      join(root, ".agents", "skill-config", "workflow", "config.json"),
      join(root, ".claude", "skill-config", "workflow", "config.json"),
    ];
    const path = candidates.find((p) => existsSync(p));
    if (!path) return;
    const stamped = JSON.parse(readFileSync(path, "utf8")).engineVersion;
    const running = await readEngineVersion();
    if (stamped && stamped !== running) {
      process.stderr.write(
        `htw: engine ${running} running, repo config stamped ${stamped} — run \`npx --yes github:aneym/how-to-work doctor --fix\` to bring this repo current (continuing).\n`,
      );
    }
  } catch {
    /* never let drift detection break a command */
  }
}

async function main() {
  const { resolve } = await import("node:path");

  const argv = process.argv.slice(2);
  const { root: rootArg, rest } = extractRoot(argv);
  const [command, ...args] = rest;

  if (!command || command === "-h" || command === "--help" || command === "help") {
    process.stdout.write(HELP);
    process.exit(command ? 0 : 1);
  }

  if (command === "-v" || command === "--version" || command === "version") {
    process.stdout.write(`${await readEngineVersion()}\n`);
    process.exit(0);
  }

  // The repo we are acting on. Doc-kit reads process.cwd(); engine commands take
  // this explicitly. Default: the current working directory.
  const root = rootArg ? resolve(process.cwd(), rootArg) : process.cwd();

  // Ambient drift detection: every state-changing command runs a <5ms stamp
  // compare and prints ONE warning line with the exact fix. Drift used to be
  // detected only by an opt-in `htw check` nobody ran — hence a fleet spread
  // from 0.1.0 to 0.3.5.
  const DRIFT_CHECKED = new Set(["new", "render", "register", "verify", "index", "serve", "grill", "stage", "ledger", "link"]);
  if (DRIFT_CHECKED.has(command)) await warnOnDrift(root);

  try {
    if (command === "init") {
      const { run } = await import("../src/commands/init.mjs");
      process.exit(await run({ root, args }));
    }
    if (command === "check") {
      const { run } = await import("../src/commands/check.mjs");
      process.exit(await run({ root, args }));
    }
    if (command === "interfaces") {
      const { run } = await import("../src/commands/interfaces.mjs");
      process.exit(await run({ root, args }));
    }
    if (command === "grill") {
      const { run } = await import("../src/commands/grill.mjs");
      process.exit(await run({ root, args }));
    }
    if (command === "stage") {
      const { run } = await import("../src/commands/stage.mjs");
      process.exit(await run({ root, args }));
    }
    if (command === "ledger") {
      const { run } = await import("../src/commands/ledger.mjs");
      process.exit(await run({ root, args }));
    }
    if (command === "doctor") {
      const { run } = await import("../src/commands/doctor.mjs");
      process.exit(await run({ root, args }));
    }
    if (command === "skill") {
      // Print a bundled canonical skill so agents always read the CURRENT law
      // (shims are thin pointers; this is the source they point at).
      const { readFileSync, readdirSync } = await import("node:fs");
      const { dirname, join, resolve: res } = await import("node:path");
      const { fileURLToPath } = await import("node:url");
      const pkgRoot = res(dirname(fileURLToPath(import.meta.url)), "..");
      const name = args[0];
      const skillsDir = join(pkgRoot, "skills");
      if (!name) {
        process.stdout.write(`available skills: ${readdirSync(skillsDir).join(", ")}\n`);
        process.exit(0);
      }
      try {
        process.stdout.write(readFileSync(join(skillsDir, name, "SKILL.md"), "utf8"));
        process.exit(0);
      } catch {
        process.stderr.write(`htw skill: no bundled skill "${name}" (try: ${readdirSync(skillsDir).join(", ")})\n`);
        process.exit(1);
      }
    }
    if (command === "serve") {
      const { run } = await import("../src/commands/serve.mjs");
      process.exit(await run({ root, args }));
    }
    if (command === "index") {
      const { run } = await import("../src/commands/index.mjs");
      process.exit(await run({ root, args }));
    }
    if (command === "link") {
      const { run } = await import("../src/commands/link.mjs");
      process.exit(await run({ root, args }));
    }
    if (command === "packet") {
      const { run } = await import("../src/commands/packet.mjs");
      process.exit(await run({ root, args }));
    }
    if (DOC_KIT_COMMANDS.has(command)) {
      const { run } = await import("../src/commands/doc-kit.mjs");
      process.exit(run(command, { root, args }));
    }
  } catch (err) {
    process.stderr.write(`htw ${command}: ${err && err.message ? err.message : err}\n`);
    process.exit(1);
  }

  process.stderr.write(`htw: unknown command "${command}"\n\n${HELP}`);
  process.exit(1);
}

main();
