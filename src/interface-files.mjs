import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const SKILL_BODY = `---
name: how-to-work
description: Project-local How-To-Work docs, PRD, grill, and docs-server workflow. Use when the user asks for /how-to-work, how-to-work setup, docs workflow, PRD or scoping docs, grill questions, docs rendering, docs serving, or Tailscale doc links.
---

# How-To-Work

This project is configured for the public \`aneym/how-to-work\` engine. Use this local wrapper so the workflow appears in agent interfaces even when global skills are not installed.

Start by reading:

- \`.agents/skill-config/workflow/config.json\`
- \`AGENTS.md\` / \`CLAUDE.md\` when present
- \`docs/reports/lanes/how-to-work-setup.md\` when present

Use the repo scripts when present:

- \`npm run docs:check\`
- \`npm run docs:build\`
- \`npm run docs:serve\`
- \`npx --yes github:aneym/how-to-work link <rendered-html-path>\`

Rules:

- Serve docs before handoff.
- If \`serve.tailscale.enabled\` is true and a URL is configured, verify and send the Tailscale browser link first.
- Use the configured project docs port; do not reuse another project's server port.
- Do not hand back a raw HTML filepath as the primary doc link.
- Keep semantic source in \`docs/sources\`; let the engine render/register/index the HTML.
`;

const COMMAND_BODY = `---
description: Use the project-local How-To-Work docs, PRD, grill, and docs-server workflow
allowed-tools: Bash, Read, Grep, Edit, Write
---

Use the local \`how-to-work\` skill/instructions for this project.

Intent:

$ARGUMENTS

Start by reading \`.agents/skill-config/workflow/config.json\` and running \`npm run docs:check\` when that script exists. If producing or updating docs, build, serve, verify the browser URL, and prefer the configured Tailscale link over localhost.
`;

const TARGETS = [
  [".codex", "skills", "how-to-work", "SKILL.md", SKILL_BODY],
  [".claude", "skills", "how-to-work", "SKILL.md", SKILL_BODY],
  [".agents", "skills", "how-to-work", "SKILL.md", SKILL_BODY],
  [".codex", "commands", "how-to-work.md", COMMAND_BODY],
  [".codex", "commands", "how-to.md", COMMAND_BODY],
  [".claude", "commands", "how-to-work.md", COMMAND_BODY],
  [".claude", "commands", "how-to.md", COMMAND_BODY],
  [".agents", "commands", "how-to-work.md", COMMAND_BODY],
  [".agents", "commands", "how-to.md", COMMAND_BODY],
];

export function installAgentInterfaces(root, { force = false } = {}) {
  const written = [];
  const skipped = [];
  for (const parts of TARGETS) {
    const body = parts[parts.length - 1];
    const relParts = parts.slice(0, -1);
    const rel = join(...relParts);
    const abs = join(root, rel);
    if (existsSync(abs) && !force) {
      skipped.push(rel);
      continue;
    }
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, body.endsWith("\n") ? body : `${body}\n`, "utf8");
    written.push(rel);
  }
  return { written, skipped };
}
