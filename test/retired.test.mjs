import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HTW = resolve(dirname(fileURLToPath(import.meta.url)), "..", "bin", "htw.mjs");
const POINTER = "Docs publish with plan-publish.";

function retiredRepo() {
  const root = mkdtempSync(join(tmpdir(), "htw-retired-"));
  mkdirSync(join(root, ".agents", "skill-config", "workflow"), { recursive: true });
  writeFileSync(join(root, ".agents", "skill-config", "workflow", "config.json"), JSON.stringify({ retired: POINTER }));
  return root;
}

function htw(root, ...args) {
  return spawnSync(process.execPath, [HTW, "--root", root, ...args], { encoding: "utf8" });
}

test("a retired repo refuses doc commands with its pointer", () => {
  const root = retiredRepo();
  for (const command of [["render", "--all"], ["new", "report", "x"], ["serve"]]) {
    const run = htw(root, ...command);
    assert.equal(run.status, 1);
    assert.match(run.stderr, /retired in this repo\. Docs publish with plan-publish\./);
  }
});

test("interfaces in a retired repo writes retired shims that carry the pointer", () => {
  const root = retiredRepo();
  assert.equal(htw(root, "interfaces", "--force").status, 0);
  const skill = readFileSync(join(root, ".claude", "skills", "htw", "SKILL.md"), "utf8");
  assert.match(skill, /description: "Retired\. Docs publish with plan-publish\."/);
  assert.doesNotMatch(skill, /htw new report/);
});
