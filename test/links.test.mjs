import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import {
  finalizeServeConfig,
  gitProjectRoot,
  projectDocsPort,
  resolveServePort,
} from "../src/links.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RANGE = { start: 8600, end: 8999 };

test("projectDocsPort is deterministic for the same path", () => {
  const a = projectDocsPort("/no/such/repo/alpha");
  const b = projectDocsPort("/no/such/repo/alpha");
  assert.equal(a, b);
});

test("projectDocsPort stays within the configured range", () => {
  for (const p of ["/a", "/some/deep/nested/path", "/x/y/z", "/tmp/whatever-project"]) {
    const port = projectDocsPort(p, RANGE);
    assert.ok(port >= RANGE.start && port <= RANGE.end, `${p} -> ${port} out of range`);
  }
});

test("projectDocsPort honors a custom range", () => {
  const range = { start: 9000, end: 9100 };
  const port = projectDocsPort("/no/such/repo/beta", range);
  assert.ok(port >= 9000 && port <= 9100);
});

test("projectDocsPort falls back to the default range for a bad range", () => {
  const port = projectDocsPort("/no/such/repo/gamma", { start: 5000, end: 100 });
  assert.ok(port >= RANGE.start && port <= RANGE.end);
});

test("different project roots almost always derive different ports", () => {
  const roots = [
    "/no/such/repo/one",
    "/no/such/repo/two",
    "/no/such/repo/three",
    "/no/such/repo/four",
    "/no/such/repo/five",
  ];
  const ports = new Set(roots.map((r) => projectDocsPort(r)));
  assert.ok(ports.size >= 4, `expected mostly-distinct ports, got ${ports.size}`);
});

test("gitProjectRoot resolves the main worktree for a repo subdir", () => {
  // Called from the repo's own test/ directory — resolves back to the repo root.
  const fromSubdir = gitProjectRoot(resolve(REPO_ROOT, "test"));
  assert.equal(fromSubdir, REPO_ROOT);
});

test("gitProjectRoot returns the path itself outside any git repo", () => {
  const root = gitProjectRoot("/no/such/repo/outside-git");
  assert.equal(root, "/no/such/repo/outside-git");
});

test("resolveServePort defaults to the git-root-derived port", () => {
  const config = { serve: { port: 8601, portRange: RANGE } };
  const res = resolveServePort(config, { root: "/no/such/repo/derive" });
  assert.equal(res.source, "derived");
  assert.equal(res.port, projectDocsPort("/no/such/repo/derive", RANGE));
  // The stale baked serve.port (8601) does NOT win.
  assert.notEqual(res.port, 8601);
});

test("resolveServePort honors an explicit --port as a flag pin", () => {
  const config = { serve: { port: 8601, portRange: RANGE } };
  const res = resolveServePort(config, { root: "/no/such/repo/flag", argPort: "9123" });
  assert.equal(res.source, "flag");
  assert.equal(res.port, 9123);
});

test("resolveServePort honors serve.pinPort", () => {
  const config = { serve: { port: 8654, pinPort: true, portRange: RANGE } };
  const res = resolveServePort(config, { root: "/no/such/repo/pin" });
  assert.equal(res.source, "pin");
  assert.equal(res.port, 8654);
});

test("resolveServePort: --port overrides a config pin", () => {
  const config = { serve: { port: 8654, pinPort: true, portRange: RANGE } };
  const res = resolveServePort(config, { root: "/no/such/repo/pin", argPort: "9200" });
  assert.equal(res.source, "flag");
  assert.equal(res.port, 9200);
});

test("resolveServePort: pinPort without a valid port falls back to derived", () => {
  const config = { serve: { pinPort: true, portRange: RANGE } };
  const res = resolveServePort(config, { root: "/no/such/repo/pinbad" });
  assert.equal(res.source, "derived");
});

test("finalizeServeConfig derives the port and fills serve defaults", () => {
  const config = { serve: { port: 8601 } };
  finalizeServeConfig(config, "/no/such/repo/final");
  assert.equal(config.serve.host, "127.0.0.1");
  assert.deepEqual(config.serve.portRange, RANGE);
  assert.ok(config.serve.command.includes("how-to-work"));
  assert.equal(config.serve.port, projectDocsPort("/no/such/repo/final", RANGE));
  assert.equal(config.devUrlBase, `http://127.0.0.1:${config.serve.port}`);
});

test("finalizeServeConfig keeps a pinned port", () => {
  const config = { serve: { port: 8654, pinPort: true } };
  finalizeServeConfig(config, "/no/such/repo/finalpin");
  assert.equal(config.serve.port, 8654);
});
