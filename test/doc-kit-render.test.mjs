/**
 * Golden-behavior tests for the doc-kit render pipeline, run end-to-end by
 * spawning src/doc-kit.mjs against a throwaway fixture repo (doc-kit is a
 * self-running script, so spawning IS the public contract).
 *
 * Covers the 0.4.0 laws:
 *   - inline() placeholder integrity (AC1/E2E/C4 prose must never corrupt)
 *   - state.json is the stage authority (frontmatter is derived, not truth)
 *   - attention-volume: decisions collapse, ledger rollup, section nav
 *   - render auto-registers; bare-slug resolution
 *   - verify fails on stale renders, stage divergence, unmanaged PRD dirs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  utimesSync,
} from "node:fs";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DOC_KIT = join(PACKAGE_ROOT, "src", "doc-kit.mjs");

function docKit(root, ...args) {
  return spawnSync(process.execPath, [DOC_KIT, ...args], {
    cwd: root,
    encoding: "utf8",
  });
}

function makeRepo() {
  const root = mkdtempSync(join(tmpdir(), "htw-test-"));
  const cfgDir = join(root, ".agents", "skill-config", "workflow");
  mkdirSync(cfgDir, { recursive: true });
  writeFileSync(
    join(cfgDir, "config.json"),
    JSON.stringify(
      {
        engineVersion: "0.0.0-test",
        brandName: "Test",
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
        answerGate: { base: "/api/hwq", mode: "none" },
      },
      null,
      2,
    ),
  );
  return root;
}

const BASE_FM = {
  title: "Fixture PRD",
  kind: "prd",
  slug: "fixture",
  date: "2026-07-01",
  lifecycle: "active",
  summary: "Fixture for render tests.",
  tags: ["test"],
  stage: "Draft PRD",
  nextAction: "n/a",
  progress: null,
  tabs: ["PRD", "Progress", "Ledger"],
  statePath: "state.json",
  ledgerPath: "ledger.jsonl",
};

function writePrd(root, { fm = {}, body = "", state, ledger = "" }) {
  const data = { ...BASE_FM, ...fm };
  const dir = join(root, "docs", "prds", data.slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "index.doc.md"),
    `---\n${JSON.stringify(data, null, 2)}\n---\n\n${body}\n`,
  );
  writeFileSync(
    join(dir, "state.json"),
    JSON.stringify(state ?? { stage: data.stage, status: data.stage }, null, 2),
  );
  writeFileSync(join(dir, "ledger.jsonl"), ledger);
  return dir;
}

function renderedHtml(root, slug = "fixture") {
  return readFileSync(join(root, "docs", "prds", slug, "index.html"), "utf8");
}

// --- inline() integrity -----------------------------------------------------

test("inline(): AC1/E2E/C4 prose survives; code/bold/escapes still work", () => {
  const root = makeRepo();
  writePrd(root, {
    body: [
      "## Scope",
      "",
      "AC1 and E2E and C4 and EC2 stay literal. Ship \\*not emphasis\\* here.",
      "Use `snake_case` and **bold** and [a link](https://example.com).",
    ].join("\n"),
  });
  const r = docKit(root, "render", "docs/prds/fixture/index.doc.md");
  assert.equal(r.status, 0, r.stderr);
  const html = renderedHtml(root);
  assert.match(html, /AC1 and E2E and C4 and EC2 stay literal/);
  assert.doesNotMatch(html, /<code>undefined<\/code>/);
  assert.match(html, /\*not emphasis\*/);
  assert.match(html, /<code>snake_case<\/code>/);
  assert.match(html, /<strong>bold<\/strong>/);
  assert.doesNotMatch(html, /\u0000/);
});

// --- stage authority ----------------------------------------------------------

test("state.json stage wins over frontmatter in the rendered stage bar and catalog", () => {
  const root = makeRepo();
  writePrd(root, {
    fm: { stage: "Draft PRD" },
    state: { stage: "In execution", status: "In execution" },
  });
  const r = docKit(root, "render", "docs/prds/fixture/index.doc.md");
  assert.equal(r.status, 0, r.stderr);
  const html = renderedHtml(root);
  assert.match(html, /<b>In execution<\/b>/);
  // render auto-registers, and the catalog entry carries the state.json stage
  const catalog = JSON.parse(readFileSync(join(root, "docs", "catalog.json"), "utf8"));
  const entry = catalog.find((e) => e.id === "fixture");
  assert.ok(entry, "render should auto-register the doc");
  assert.equal(entry.stage, "In execution");
});

test("verify fails on stage divergence between frontmatter and state.json", () => {
  const root = makeRepo();
  writePrd(root, {
    fm: { stage: "Draft PRD" },
    state: { stage: "In execution", status: "In execution" },
  });
  docKit(root, "render", "fixture");
  const v = docKit(root, "verify", "docs/prds/fixture/index.doc.md");
  assert.equal(v.status, 1);
  assert.match(v.stdout, /stage divergence/);
});

// --- attention-volume laws ---------------------------------------------------

test("decisions: agent-call rows collapse; at most 5 author rows stay visible", () => {
  const root = makeRepo();
  const rows = [];
  for (let i = 1; i <= 7; i++) rows.push(`Author call ${i} :: [Decided] choice ${i}`);
  for (let i = 1; i <= 3; i++)
    rows.push(`Auto ${i} :: [Decided] picked default (agent call, reversible)`);
  writePrd(root, { body: `## Decisions\n\n:::decisions\n${rows.join("\n")}\n:::\n` });
  const r = docKit(root, "render", "fixture");
  assert.equal(r.status, 0, r.stderr);
  const html = renderedHtml(root);
  assert.match(html, /<details class="dmore"><summary>5 more decisions \(3 agent calls\)/);
  assert.match(html, /Author call 7/);
});

test("ledger: events beyond the newest 3 days roll up into a details block", () => {
  const root = makeRepo();
  const lines = [];
  for (let d = 1; d <= 6; d++)
    for (let k = 0; k < 2; k++)
      lines.push(
        JSON.stringify({
          ts: `2026-06-0${d}T10:0${k}:00Z`,
          event: `event_d${d}_${k}`,
          actor: "test",
          summary: `day ${d} event ${k}`,
        }),
      );
  writePrd(root, { ledger: lines.join("\n") + "\n" });
  const r = docKit(root, "render", "fixture");
  assert.equal(r.status, 0, r.stderr);
  const html = renderedHtml(root);
  assert.match(html, /<details class="tlmore"><summary>6 earlier events/);
});

test("long tabs get a section nav; short tabs do not", () => {
  const root = makeRepo();
  const filler = Array.from({ length: 40 }, (_, i) => `Sentence ${i} with several words of filler prose.`).join(" ");
  const sections = Array.from({ length: 7 }, (_, i) => `## Section ${i}\n\n${filler}`).join("\n\n");
  writePrd(root, { body: sections });
  docKit(root, "render", "fixture");
  assert.match(renderedHtml(root), /<nav class="secnav"/);

  writePrd(root, { fm: { slug: "short" }, body: "## Only\n\nOne short section." });
  docKit(root, "render", "short");
  assert.doesNotMatch(renderedHtml(root, "short"), /<nav class="secnav"/);
});

// --- pipeline enforcement ------------------------------------------------------

test("render accepts a bare slug", () => {
  const root = makeRepo();
  writePrd(root, {});
  const r = docKit(root, "render", "fixture");
  assert.equal(r.status, 0, r.stderr);
  assert.ok(existsSync(join(root, "docs", "prds", "fixture", "index.html")));
});

test("verify fails on a stale render (source newer than html)", () => {
  const root = makeRepo();
  const dir = writePrd(root, {});
  docKit(root, "render", "fixture");
  const future = new Date(Date.now() + 60_000);
  utimesSync(join(dir, "index.doc.md"), future, future);
  const v = docKit(root, "verify", "docs/prds/fixture/index.doc.md");
  assert.equal(v.status, 1);
  assert.match(v.stdout, /stale render/);
});

test("verify flags hand-authored PRD dirs (index.html without index.doc.md)", () => {
  const root = makeRepo();
  writePrd(root, {});
  docKit(root, "render", "fixture");
  const legacy = join(root, "docs", "prds", "legacy");
  mkdirSync(legacy, { recursive: true });
  writeFileSync(join(legacy, "index.html"), "<html>hand-authored</html>");
  const v = docKit(root, "verify", "--all");
  assert.equal(v.status, 1);
  assert.match(v.stdout, /hand-authored PRD dir/);
});

test("verify --json emits a machine-readable report", () => {
  const root = makeRepo();
  writePrd(root, {});
  docKit(root, "render", "fixture");
  const v = docKit(root, "verify", "--all", "--json");
  const report = JSON.parse(v.stdout);
  assert.equal(report.ok, true);
  assert.ok(Array.isArray(report.docs));
  assert.equal(report.docs.length >= 1, true);
});
