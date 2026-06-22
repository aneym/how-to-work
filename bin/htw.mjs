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
  new <kind> <slug>            Scaffold a new .doc.md source (kinds: report | working-doc | prd)
  render [<slug>|--all]        Render .doc.md sources to self-contained HTML
  register [--all]             Add rendered docs to the repo catalog
  index                        Build docs/index.html lifecycle dashboard from the JSON catalog
  verify                       Validate doc sources against the engine contract
  contract                     Print the doc frontmatter + structure contract
  grill ask --doc <slug>       Open a blocking question gate and wait for answers
                               (--base <answerGate.base>, --no-wait, --stdin-fallback)
  serve [--answer-gate]        Serve rendered docs/ over loopback (--port 8765)

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

  try {
    if (command === "init") {
      const { run } = await import("../src/commands/init.mjs");
      process.exit(await run({ root, args }));
    }
    if (command === "check") {
      const { run } = await import("../src/commands/check.mjs");
      process.exit(await run({ root, args }));
    }
    if (command === "grill") {
      const { run } = await import("../src/commands/grill.mjs");
      process.exit(await run({ root, args }));
    }
    if (command === "serve") {
      const { run } = await import("../src/commands/serve.mjs");
      process.exit(await run({ root, args }));
    }
    if (command === "index") {
      const { run } = await import("../src/commands/index.mjs");
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
