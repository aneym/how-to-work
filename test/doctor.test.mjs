/**
 * htw doctor: diagnose, fix mechanically, and surface judgment items.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BIN = join(PACKAGE_ROOT, "bin", "htw.mjs");

function htw(root, ...args) {
  return spawnSync(process.execPath, [BIN, "--root", root, ...args], { encoding: "utf8" });
}

function makeSickRepo() {
  const root = mkdtempSync(join(tmpdir(), "htw-doctor-"));
  const cfgDir = join(root, ".agents", "skill-config", "workflow");
  mkdirSync(cfgDir, { recursive: true });
  // Stale stamp + valid schema
  writeFileSync(
    join(cfgDir, "config.json"),
    JSON.stringify({
      engineVersion: "0.0.1",
      doc: { overlayDir: ".agents/skill-config/doc", themeFile: null, catalogPath: "docs/catalog.json", sourcesDir: "docs/sources", prdsDir: "docs/prds", plansDir: "docs/plans", docsIndexRoute: "/docs", stagesPath: null },
      answerGate: { base: "/api/hwq", mode: "none" },
    }),
  );
  // A PRD with divergent stage, unanswered question, never rendered
  const dir = join(root, "docs", "prds", "sick");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "index.doc.md"),
    `---
${JSON.stringify({ title: "Sick", kind: "prd", slug: "sick", date: "2026-07-01", lifecycle: "active", summary: "s", tags: ["t"], stage: "Draft PRD", nextAction: "n", tabs: ["PRD", "Progress", "Ledger"], statePath: "state.json", ledgerPath: "ledger.jsonl" }, null, 2)}
---

:::questions
- id: Q1
  title: Rotting question
  question: Still relevant?
  recommendation: Probably.
:::
`,
  );
  writeFileSync(join(dir, "state.json"), JSON.stringify({ stage: "In execution", status: "In execution" }));
  writeFileSync(join(dir, "ledger.jsonl"), "");
  // A hand-authored legacy dir
  const legacy = join(root, "docs", "prds", "legacy");
  mkdirSync(legacy, { recursive: true });
  writeFileSync(join(legacy, "index.html"), "<html>bypass</html>");
  return root;
}

test("doctor reports mechanical issues (exit 1), then --fix heals them (exit 2 with judgment left)", () => {
  const root = makeSickRepo();

  const before = htw(root, "doctor", "--json");
  assert.equal(before.status, 1, before.stdout + before.stderr);
  const rep1 = JSON.parse(before.stdout);
  assert.equal(rep1.engine.ok, false); // stale stamp
  assert.equal(rep1.interfaces.ok, false); // no shims yet
  assert.equal(rep1.docs.ok, false); // unrendered + divergence

  const fixed = htw(root, "doctor", "--fix", "--json");
  const rep2 = JSON.parse(fixed.stdout);
  assert.equal(rep2.engine.ok, true, JSON.stringify(rep2.engine));
  assert.equal(rep2.interfaces.ok, true);
  assert.ok(rep2.fixed.length >= 2, JSON.stringify(rep2.fixed));
  // frontmatter stage was synced from state.json
  assert.match(readFileSync(join(root, "docs", "prds", "sick", "index.doc.md"), "utf8"), /"stage": "In execution"/);
  // rendered + registered + indexed
  assert.ok(existsSync(join(root, "docs", "prds", "sick", "index.html")));
  assert.ok(existsSync(join(root, "docs", "index.html")));
  // judgment items remain: hand-authored dir + open question -> exit 2
  assert.equal(fixed.status, 2);
  const kinds = rep2.judgment.map((j) => j.kind);
  assert.ok(kinds.includes("hand-authored-prd"), kinds.join(","));
  assert.ok(kinds.includes("open-questions"), kinds.join(","));
  // shims installed with /htw + /htw-doctor for all three runtimes
  for (const rt of [".claude", ".codex", ".agents"]) {
    assert.ok(existsSync(join(root, rt, "skills", "htw", "SKILL.md")));
    assert.ok(existsSync(join(root, rt, "commands", "htw-doctor.md")));
  }
});

test("doctor on an uninitialized repo points at init and exits 2", () => {
  const root = mkdtempSync(join(tmpdir(), "htw-doctor-empty-"));
  const r = htw(root, "doctor", "--json");
  assert.equal(r.status, 2);
  const rep = JSON.parse(r.stdout);
  assert.equal(rep.judgment[0].kind, "not-initialized");
});
