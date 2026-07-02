/**
 * Atomic lifecycle commands: `htw stage set`, `htw ledger add`,
 * `htw grill resolve`. Each must mutate EVERY surface in one transaction —
 * that is their whole reason to exist.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BIN = join(PACKAGE_ROOT, "bin", "htw.mjs");

function htw(root, args, input) {
  return spawnSync(process.execPath, [BIN, "--root", root, ...args], {
    encoding: "utf8",
    input,
  });
}

function makeRepoWithPrd() {
  const root = mkdtempSync(join(tmpdir(), "htw-lifecycle-"));
  const cfgDir = join(root, ".agents", "skill-config", "workflow");
  mkdirSync(cfgDir, { recursive: true });
  writeFileSync(
    join(cfgDir, "config.json"),
    JSON.stringify({
      engineVersion: "0.0.0-test",
      doc: { catalogPath: "docs/catalog.json", sourcesDir: "docs/sources", prdsDir: "docs/prds", plansDir: "docs/plans", docsIndexRoute: "/docs", overlayDir: ".agents/skill-config/doc", themeFile: null, stagesPath: null },
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

## Open

:::questions
- id: Q1
  title: Pick the database
  question: Postgres or SQLite?
  recommendation: Postgres.
- id: Q2
  title: Pick the queue
  question: Redis or in-proc?
  recommendation: Redis.
:::

## Decisions

:::decisions
Old call :: [Decided] something earlier
:::
`,
  );
  writeFileSync(join(dir, "state.json"), JSON.stringify({ stage: "Draft PRD", status: "Draft PRD" }));
  writeFileSync(join(dir, "ledger.jsonl"), "");
  return { root, dir };
}

test("stage set updates state.json, frontmatter, ledger, render, catalog in one pass", () => {
  const { root, dir } = makeRepoWithPrd();
  const r = htw(root, ["stage", "set", "fixture", "in progress"]);
  assert.equal(r.status, 0, r.stderr);
  const state = JSON.parse(readFileSync(join(dir, "state.json"), "utf8"));
  assert.equal(state.stage, "In execution"); // alias canonicalized
  assert.match(readFileSync(join(dir, "index.doc.md"), "utf8"), /"stage": "In execution"/);
  assert.match(readFileSync(join(dir, "ledger.jsonl"), "utf8"), /"event":"stage_change"/);
  assert.match(readFileSync(join(dir, "index.html"), "utf8"), /<b>In execution<\/b>/);
  const catalog = JSON.parse(readFileSync(join(root, "docs", "catalog.json"), "utf8"));
  assert.equal(catalog.find((e) => e.id === "fixture").stage, "In execution");
});

test("stage set rejects free-text stages with the lifecycle list", () => {
  const { root } = makeRepoWithPrd();
  const r = htw(root, ["stage", "set", "fixture", "vibing"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /does not map to the lifecycle/);
});

test("ledger add appends the canonical event shape and re-renders", () => {
  const { root, dir } = makeRepoWithPrd();
  const r = htw(root, ["ledger", "add", "fixture", "checkpoint", "--body", "lane 2 green", "--who", "tester"]);
  assert.equal(r.status, 0, r.stderr);
  const line = JSON.parse(readFileSync(join(dir, "ledger.jsonl"), "utf8").trim());
  assert.equal(line.event, "checkpoint");
  assert.equal(line.actor, "tester");
  assert.equal(line.summary, "lane 2 green");
  assert.ok(line.ts);
  assert.match(readFileSync(join(dir, "index.html"), "utf8"), /Checkpoint/);
});

test("grill resolve applies a Copy-answers packet end to end", () => {
  const { root, dir } = makeRepoWithPrd();
  const packet = [
    "Re: Fixture — answers to 2 of 2 questions",
    "",
    "Q1 — Pick the database: APPROVE (accept recommendation). Note: managed only",
    "Q2 — Pick the queue: CUSTOM — use the durable workloop instead",
    "",
    "Shorthand: 1r — managed only  |  2 use the durable workloop instead",
  ].join("\n");
  const r = htw(root, ["grill", "resolve", "fixture"], packet);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const src = readFileSync(join(dir, "index.doc.md"), "utf8");
  assert.match(src, /answer: Approved — recommendation accepted\. managed only/);
  assert.match(src, /answer: use the durable workloop instead/);
  assert.match(src, /Pick the database :: \[Decided \d{4}-\d{2}-\d{2}\]/);
  const ledger = readFileSync(join(dir, "ledger.jsonl"), "utf8").trim().split("\n");
  assert.equal(ledger.length, 2);
  assert.match(ledger[0], /"event":"question_answered"/);
  // rendered page: no open cards left, 2 resolved
  const html = readFileSync(join(dir, "index.html"), "utf8");
  assert.match(html, /2 questions resolved/);
  assert.match(r.stdout, /0 questions still open/);
});

test("grill resolve accepts gate JSON and bare shorthand too", () => {
  const { root, dir } = makeRepoWithPrd();
  const json = JSON.stringify({ answers: [{ id: "Q1", decision: "approve", comment: "" }] });
  assert.equal(htw(root, ["grill", "resolve", "fixture"], json).status, 0);
  assert.match(readFileSync(join(dir, "index.doc.md"), "utf8"), /answer: Approved — recommendation accepted\./);

  const r2 = htw(root, ["grill", "resolve", "fixture"], "2 ship the simple version");
  assert.equal(r2.status, 0, r2.stderr);
  assert.match(readFileSync(join(dir, "index.doc.md"), "utf8"), /answer: ship the simple version/);
});
