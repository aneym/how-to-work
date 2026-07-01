/**
 * registry — a tiny cross-process ledger of which repo root owns which docs
 * port, so `htw serve` can (a) report every active How-To-Work server with
 * `serve --status` and (b) refuse to squat a port another project already
 * bound.
 *
 * The store is a single JSON file at ~/.htw/servers.json (override the home
 * with $HTW_HOME — used by the tests), keyed by port string:
 *
 *   { "8974": { port, root, host, pid, derived, boundAt } , ... }
 *
 * Liveness is derived, not trusted: every read prunes entries whose pid is no
 * longer running (process.kill(pid, 0)), so a crashed server never leaves a
 * ghost that blocks the port forever. Writes are atomic (temp file + rename) so
 * a concurrent reader never sees a half-written file. Node ESM, built-ins only.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export function htwHome() {
  const override = process.env.HTW_HOME;
  return override && override.trim() ? resolve(override) : join(homedir(), ".htw");
}

export function registryPath() {
  return join(htwHome(), "servers.json");
}

// A pid is "alive" if signal 0 either succeeds (ours, running) or fails with
// EPERM (running but owned by someone else). ESRCH means gone.
export function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return !!(err && err.code === "EPERM");
  }
}

function readRaw() {
  const path = registryPath();
  if (!existsSync(path)) return {};
  try {
    const data = JSON.parse(readFileSync(path, "utf8"));
    return data && typeof data === "object" && !Array.isArray(data) ? data : {};
  } catch {
    // A corrupt/half-written registry is not fatal — treat it as empty and let
    // the next write heal it.
    return {};
  }
}

function writeRaw(entries) {
  const dir = htwHome();
  mkdirSync(dir, { recursive: true });
  const path = registryPath();
  const tmp = join(dir, `.servers.${process.pid}.${Date.now()}.tmp`);
  writeFileSync(tmp, `${JSON.stringify(entries, null, 2)}\n`, "utf8");
  renameSync(tmp, path);
}

/**
 * Every LIVE entry, keyed by port string. Dead-pid entries are pruned on read
 * (and only persisted away lazily, on the next write) so a stale file never
 * blocks a port.
 */
export function readRegistry() {
  const raw = readRaw();
  const live = {};
  for (const [port, entry] of Object.entries(raw)) {
    if (entry && typeof entry === "object" && isPidAlive(entry.pid)) live[port] = entry;
  }
  return live;
}

/** The live entry owning `port`, or null if free. */
export function portOwner(port) {
  return readRegistry()[String(port)] || null;
}

/** Live entries as an array, sorted by port ascending. */
export function listActive() {
  return Object.values(readRegistry()).sort((a, b) => a.port - b.port);
}

/**
 * Claim `port` for `root`. Prunes dead entries first (readRegistry), then writes
 * the fresh entry and persists — so the file is also self-healed of ghosts on
 * every bind. Returns the written entry.
 */
export function bind({ port, root, host = "127.0.0.1", pid = process.pid, derived = null }) {
  const live = readRegistry();
  const entry = {
    port: Number(port),
    root: resolve(root),
    host,
    pid,
    derived: derived == null ? null : Number(derived),
    boundAt: new Date().toISOString(),
  };
  live[String(port)] = entry;
  writeRaw(live);
  return entry;
}

/**
 * Release `port` if it is held by this pid (or by a now-dead pid). Never removes
 * a live entry owned by a different process. Returns true if an entry was
 * removed.
 */
export function release({ port, pid = process.pid }) {
  const raw = readRaw();
  const key = String(port);
  const entry = raw[key];
  if (!entry) return false;
  if (entry.pid === pid || !isPidAlive(entry.pid)) {
    delete raw[key];
    writeRaw(raw);
    return true;
  }
  return false;
}
