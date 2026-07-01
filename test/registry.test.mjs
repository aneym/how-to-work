import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  bind,
  htwHome,
  isPidAlive,
  listActive,
  portOwner,
  readRegistry,
  registryPath,
  release,
} from "../src/registry.mjs";

let home;
const prevHome = process.env.HTW_HOME;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "htw-registry-"));
  process.env.HTW_HOME = home;
});

afterEach(() => {
  if (prevHome === undefined) delete process.env.HTW_HOME;
  else process.env.HTW_HOME = prevHome;
  rmSync(home, { recursive: true, force: true });
});

const DEAD_PID = 2 ** 30; // no process this high — process.kill throws ESRCH

test("htwHome / registryPath honor HTW_HOME", () => {
  assert.equal(htwHome(), home);
  assert.equal(registryPath(), join(home, "servers.json"));
});

test("isPidAlive: our pid alive, a huge pid dead, a bad pid dead", () => {
  assert.equal(isPidAlive(process.pid), true);
  assert.equal(isPidAlive(DEAD_PID), false);
  assert.equal(isPidAlive(-1), false);
  assert.equal(isPidAlive(0), false);
  assert.equal(isPidAlive("nope"), false);
});

test("bind then read round-trips an entry", () => {
  bind({ port: 8974, root: "/Users/me/repo/iris", host: "127.0.0.1", derived: 8974 });
  const reg = readRegistry();
  assert.ok(reg["8974"]);
  assert.equal(reg["8974"].root, "/Users/me/repo/iris");
  assert.equal(reg["8974"].pid, process.pid);
  assert.equal(reg["8974"].derived, 8974);
  assert.ok(reg["8974"].boundAt);
});

test("portOwner returns the entry for a bound port and null otherwise", () => {
  bind({ port: 8801, root: "/Users/me/repo/htw" });
  assert.equal(portOwner(8801).root, "/Users/me/repo/htw");
  assert.equal(portOwner(8802), null);
});

test("release removes our own entry", () => {
  bind({ port: 8700, root: "/Users/me/repo/a" });
  assert.ok(portOwner(8700));
  assert.equal(release({ port: 8700 }), true);
  assert.equal(portOwner(8700), null);
});

test("release does not remove a live entry owned by another pid", () => {
  bind({ port: 8710, root: "/Users/me/repo/b" });
  // A different, still-alive pid (this test process's parent-ish stand-in: reuse
  // our own pid via the raw file so the entry is 'live' but not ours).
  const raw = JSON.parse(readFileSync(registryPath(), "utf8"));
  raw["8710"].pid = process.pid; // live
  writeFileSync(registryPath(), JSON.stringify(raw));
  assert.equal(release({ port: 8710, pid: DEAD_PID }), false);
  assert.ok(portOwner(8710));
});

test("dead-pid entries are pruned on read", () => {
  mkdirSync(home, { recursive: true });
  writeFileSync(
    registryPath(),
    JSON.stringify({
      "8900": { port: 8900, root: "/Users/me/repo/ghost", host: "127.0.0.1", pid: DEAD_PID, boundAt: "x" },
      "8901": { port: 8901, root: "/Users/me/repo/live", host: "127.0.0.1", pid: process.pid, boundAt: "y" },
    }),
  );
  const reg = readRegistry();
  assert.equal(reg["8900"], undefined);
  assert.ok(reg["8901"]);
});

test("a corrupt registry file reads as empty, not a throw", () => {
  mkdirSync(home, { recursive: true });
  writeFileSync(registryPath(), "{ not valid json ");
  assert.deepEqual(readRegistry(), {});
  // and a bind heals it
  bind({ port: 8600, root: "/Users/me/repo/heal" });
  assert.ok(portOwner(8600));
});

test("listActive returns live entries sorted by port", () => {
  bind({ port: 8990, root: "/Users/me/repo/z" });
  bind({ port: 8610, root: "/Users/me/repo/a" });
  bind({ port: 8700, root: "/Users/me/repo/m" });
  const ports = listActive().map((e) => e.port);
  assert.deepEqual(ports, [8610, 8700, 8990]);
});

test("bind persists the pruned set (ghosts do not survive a write)", () => {
  mkdirSync(home, { recursive: true });
  writeFileSync(
    registryPath(),
    JSON.stringify({ "8900": { port: 8900, root: "/ghost", pid: DEAD_PID, boundAt: "x" } }),
  );
  bind({ port: 8901, root: "/Users/me/repo/live" });
  const onDisk = JSON.parse(readFileSync(registryPath(), "utf8"));
  assert.equal(onDisk["8900"], undefined);
  assert.ok(onDisk["8901"]);
});

test("registry file is created under HTW_HOME on first write", () => {
  assert.equal(existsSync(registryPath()), false);
  bind({ port: 8666, root: "/Users/me/repo/first" });
  assert.equal(existsSync(registryPath()), true);
});
