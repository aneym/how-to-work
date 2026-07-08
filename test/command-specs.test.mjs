import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { COMMAND_SPECS, usageFor } from "../src/command-specs.mjs";
import { installAgentInterfaces } from "../src/interface-files.mjs";
import { run as runLedger } from "../src/commands/ledger.mjs";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BIN = join(PACKAGE_ROOT, "bin", "htw.mjs");

function makeRepoWithPrd(prefix = "htw-command-specs-") {
  const root = mkdtempSync(join(tmpdir(), prefix));
  const cfgDir = join(root, ".agents", "skill-config", "workflow");
  mkdirSync(cfgDir, { recursive: true });
  writeFileSync(
    join(cfgDir, "config.json"),
    JSON.stringify({
      engineVersion: "0.0.0-test",
      doc: {
        catalogPath: "docs/catalog.json",
        sourcesDir: "docs/sources",
        prdsDir: "docs/prds",
        plansDir: "docs/plans",
        docsIndexRoute: "/docs",
        overlayDir: ".agents/skill-config/doc",
        themeFile: null,
        stagesPath: null,
      },
      answerGate: { base: "/api/hwq", mode: "none" },
    }),
  );
  const dir = join(root, "docs", "prds", "fixture");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "index.doc.md"),
    `---
${JSON.stringify(
  {
    title: "Fixture",
    kind: "prd",
    slug: "fixture",
    date: "2026-07-01",
    lifecycle: "active",
    summary: "s",
    tags: ["t"],
    stage: "Draft PRD",
    nextAction: "n",
    tabs: ["PRD", "Progress", "Ledger"],
    statePath: "state.json",
    ledgerPath: "ledger.jsonl",
  },
  null,
  2,
)}
---

## Scope

Fixture.
`,
  );
  writeFileSync(join(dir, "state.json"), JSON.stringify({ stage: "Draft PRD", status: "Draft PRD" }));
  writeFileSync(join(dir, "ledger.jsonl"), "");
  return { root, dir };
}

async function captureProcessWrites(fn) {
  const stdout = [];
  const stderr = [];
  const oldStdout = process.stdout.write;
  const oldStderr = process.stderr.write;
  process.stdout.write = (chunk, ...rest) => {
    stdout.push(String(chunk));
    if (typeof rest.at(-1) === "function") rest.at(-1)();
    return true;
  };
  process.stderr.write = (chunk, ...rest) => {
    stderr.push(String(chunk));
    if (typeof rest.at(-1) === "function") rest.at(-1)();
    return true;
  };
  try {
    const status = await fn();
    return { status, stdout: stdout.join(""), stderr: stderr.join("") };
  } finally {
    process.stdout.write = oldStdout;
    process.stderr.write = oldStderr;
  }
}

test("every command spec has a non-empty name and usage", () => {
  assert.ok(COMMAND_SPECS.length > 0);
  const names = new Set();
  for (const spec of COMMAND_SPECS) {
    assert.equal(typeof spec.name, "string");
    assert.equal(typeof spec.usage, "string");
    assert.notEqual(spec.name.trim(), "");
    assert.notEqual(spec.usage.trim(), "");
    assert.equal(names.has(spec.name), false, `duplicate command spec: ${spec.name}`);
    names.add(spec.name);
  }
});

test("help output contains every command spec name", () => {
  const r = spawnSync(process.execPath, [BIN, "--help"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  for (const spec of COMMAND_SPECS) {
    assert.match(r.stdout, new RegExp(`\\b${spec.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`));
  }
});

test("generated htw skill includes command signatures and ledger add usage", () => {
  const root = mkdtempSync(join(tmpdir(), "htw-interface-signatures-"));
  installAgentInterfaces(root, { force: true });
  const skill = readFileSync(join(root, ".codex", "skills", "htw", "SKILL.md"), "utf8");
  assert.match(skill, /## Command signatures/);
  assert.match(skill, /\| command \| usage \|/);
  assert.ok(skill.includes(`| \`ledger add\` | \`${usageFor("ledger add")}\` |`));
});

test("ledger add accepts --doc and positional slug forms equivalently", async () => {
  const positional = makeRepoWithPrd("htw-ledger-positional-");
  const flagged = makeRepoWithPrd("htw-ledger-doc-");

  const a = await captureProcessWrites(() =>
    runLedger({
      root: positional.root,
      args: ["add", "fixture", "checkpoint", "--body", "lane 2 green", "--who", "tester", "--no-render"],
    }),
  );
  const b = await captureProcessWrites(() =>
    runLedger({
      root: flagged.root,
      args: ["add", "--doc", "fixture", "checkpoint", "--body", "lane 2 green", "--who", "tester", "--no-render"],
    }),
  );
  assert.equal(a.status, 0, a.stderr);
  assert.equal(b.status, 0, b.stderr);

  const positionalLine = JSON.parse(readFileSync(join(positional.dir, "ledger.jsonl"), "utf8").trim());
  const flaggedLine = JSON.parse(readFileSync(join(flagged.dir, "ledger.jsonl"), "utf8").trim());
  delete positionalLine.ts;
  delete flaggedLine.ts;
  assert.deepEqual(flaggedLine, positionalLine);
});

test("invalid ledger add prints the registry usage line", async () => {
  const r = await captureProcessWrites(() => runLedger({ root: process.cwd(), args: ["add"] }));
  assert.equal(r.status, 64);
  assert.equal(r.stderr, `htw ledger: usage — ${usageFor("ledger add")}\n`);
});
