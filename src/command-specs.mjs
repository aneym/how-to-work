/**
 * command-specs — the single registry for the htw CLI surface.
 *
 * Keep command signatures here so help output, usage errors, and generated
 * agent shims cannot drift apart.
 */

export const DOC_KIT_COMMANDS = new Set(["new", "render", "register", "verify", "contract"]);

export const COMMAND_SPECS = [
  {
    name: "init",
    usage: "htw init [--migrate] [--force]",
    summary: "Write .agents/skill-config/workflow/config.json (stamps engineVersion)",
  },
  {
    name: "check",
    usage: "htw check [--online]",
    summary: "Validate the repo config against this engine (version + schema drift)",
  },
  {
    name: "doctor",
    usage: "htw doctor [--fix] [--json]",
    summary:
      "Diagnose the whole docs system (drift, staleness, catalog, shims, stage divergence) and apply the mechanical fixes",
  },
  {
    name: "interfaces",
    usage: "htw interfaces [--force]",
    summary: "Install project-local skills/commands for Codex, Claude, and agents",
  },
  {
    name: "new",
    usage: "htw new <kind> <slug>",
    summary: "Scaffold a new .doc.md source (kinds: report | working-doc | prd)",
  },
  {
    name: "render",
    usage: "htw render [<slug>|--all]",
    summary: "Render .doc.md sources to self-contained HTML (auto-registers)",
  },
  {
    name: "register",
    usage: "htw register [--all]",
    summary: "Add rendered docs to the repo catalog",
  },
  {
    name: "index",
    usage: "htw index",
    summary: "Build docs/index.html lifecycle dashboard from the JSON catalog",
  },
  {
    name: "link",
    usage: "htw link [docs/<path>.html]",
    summary: "Print the browser URL for a rendered doc (prefers configured Tailscale)",
  },
  {
    name: "packet",
    usage: "htw packet",
    summary: "List + validate doc packets (refs must be registered catalog ids)",
  },
  {
    name: "verify",
    usage: "htw verify [--json]",
    summary: "Validate docs: contract, catalog, staleness, stage divergence",
  },
  {
    name: "contract",
    usage: "htw contract",
    summary: "Print the doc frontmatter + structure contract",
  },
  {
    name: "skill",
    usage: "htw skill [<name>]",
    summary: "Print a bundled canonical skill (htw, how-to-work, doc, grill, scope)",
  },
  {
    name: "stage set",
    usage: "htw stage set <slug> <stage> [--who <name>]",
    summary: "Move a PRD's lifecycle stage on every surface atomically",
  },
  {
    name: "stage get",
    usage: "htw stage get <slug>",
    summary: "Print the stage on each surface",
  },
  {
    name: "ledger add",
    usage: "htw ledger add <slug> <event> [--body \"…\"] [--who <name>] [--no-render]",
    summary: "Append a schema-checked ledger event (+ re-render)",
  },
  {
    name: "grill ask",
    usage: "htw grill ask --doc <slug> [--base <answerGate.base>] [--apply]",
    summary:
      "Open a blocking question gate and wait for answers (--base <answerGate.base>, --no-wait, --stdin-fallback, --apply to write answers into the doc on arrival)",
  },
  {
    name: "grill resolve",
    usage: "htw grill resolve <slug> [--file <path>] [--who <name>]",
    summary: "Apply pasted answers (packet / JSON / shorthand) to the doc, decisions, ledger, state, and re-render",
  },
  {
    name: "serve",
    usage: "htw serve [--answer-gate]",
    summary:
      "Serve rendered docs/ over loopback on this project's derived port (--port <n> pins; --status lists every active htw docs server and its owning repo root)",
  },
];

const BY_NAME = new Map(COMMAND_SPECS.map((spec) => [spec.name, spec]));
const HELP_USAGE_WIDTH = 29;
const HELP_WRAP_WIDTH = 79;
const HELP_CONTINUATION = " ".repeat(31);

export function specFor(name) {
  return BY_NAME.get(name) || null;
}

export function usageFor(name) {
  const spec = specFor(name);
  if (!spec) throw new Error(`unknown command spec "${name}"`);
  return spec.usage;
}

function displayUsage(usage) {
  return usage.replace(/^htw\s+/, "");
}

function wrapHelpLine(display, summary) {
  const padding = " ".repeat(Math.max(2, HELP_USAGE_WIDTH - display.length));
  const head = `  ${display}${padding}`;
  const words = String(summary || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let line = head;
  for (const word of words) {
    const sep = line.trimEnd() === head.trimEnd() ? "" : " ";
    if ((line + sep + word).length > HELP_WRAP_WIDTH && line !== head) {
      lines.push(line);
      line = HELP_CONTINUATION + word;
    } else {
      line += sep + word;
    }
  }
  lines.push(line);
  return lines.join("\n");
}

export function commandHelpLines() {
  return COMMAND_SPECS.map((spec) => wrapHelpLine(displayUsage(spec.usage), spec.summary)).join("\n");
}

function markdownCodeCell(value) {
  return `\`${String(value).replace(/\|/g, "\\|")}\``;
}

export function commandSignaturesMarkdown() {
  return [
    "## Command signatures",
    "",
    "| command | usage |",
    "| --- | --- |",
    ...COMMAND_SPECS.map((spec) => `| ${markdownCodeCell(spec.name)} | ${markdownCodeCell(spec.usage)} |`),
  ].join("\n");
}

function flagValue(args, flag) {
  const i = args.indexOf(flag);
  return i !== -1 && i + 1 < args.length ? { value: args[i + 1], index: i } : null;
}

function positionalIndex(args) {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      if (!arg.includes("=") && args[i + 1] && !args[i + 1].startsWith("--")) i += 1;
      continue;
    }
    return i;
  }
  return -1;
}

export function firstPositionalArg(args) {
  const i = positionalIndex(args);
  return i === -1 ? null : args[i];
}

export function resolveDocArg(args) {
  const explicit = flagValue(args, "--doc");
  if (explicit && explicit.value && !explicit.value.startsWith("--")) {
    return {
      slug: explicit.value,
      rest: [...args.slice(0, explicit.index), ...args.slice(explicit.index + 2)],
      source: "--doc",
    };
  }
  const i = positionalIndex(args);
  if (i === -1) return { slug: null, rest: [...args], source: null };
  return {
    slug: args[i],
    rest: [...args.slice(0, i), ...args.slice(i + 1)],
    source: "positional",
  };
}
