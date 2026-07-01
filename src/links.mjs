import { spawnSync } from "node:child_process";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";

const DEFAULT_PORT_RANGE = { start: 8600, end: 8999 };

function positiveInt(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function portRange(range = {}) {
  const start = positiveInt(range.start) || DEFAULT_PORT_RANGE.start;
  const end = positiveInt(range.end) || DEFAULT_PORT_RANGE.end;
  return start <= end ? { start, end } : DEFAULT_PORT_RANGE;
}

function hashString(input) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

// Cache git-root resolution per input path — loadConfig runs finalizeServeConfig
// on nearly every command, and we don't want a git subprocess on each call.
const gitRootCache = new Map();

function git(root, gitArgs) {
  try {
    const r = spawnSync("git", ["-C", root, ...gitArgs], { encoding: "utf8" });
    if (r.status === 0 && r.stdout) return r.stdout.trim();
  } catch {
    /* git absent or not a repo */
  }
  return null;
}

/**
 * The canonical PROJECT root for `root`: the main worktree of its git repo, so
 * the derived docs port is STABLE across the main checkout and every linked
 * worktree (they all share one .git and therefore one canonical port). Resolved
 * from `--git-common-dir` (points at the main repo's .git even from a worktree);
 * falls back to `--show-toplevel`, then to the path itself when `root` is not a
 * git repo at all. Memoized per input path.
 */
export function gitProjectRoot(root = process.cwd()) {
  const key = resolve(root);
  if (gitRootCache.has(key)) return gitRootCache.get(key);
  let result = key;
  const common = git(key, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  if (common) {
    const abs = resolve(common);
    // A normal repo's common-dir is `<root>/.git`; the project root is its parent.
    if (basename(abs) === ".git") result = dirname(abs);
    else {
      const top = git(key, ["rev-parse", "--show-toplevel"]);
      if (top) result = resolve(top);
    }
  } else {
    const top = git(key, ["rev-parse", "--show-toplevel"]);
    if (top) result = resolve(top);
  }
  gitRootCache.set(key, result);
  return result;
}

/**
 * A deterministic, project-stable docs port: FNV-1a hash of the git-root path
 * mapped into `range` (default 8600–8999). The same repo always lands on the
 * same port; different repos almost always differ. Pass a plain path to hash it
 * directly (that path is git-resolved first).
 */
export function projectDocsPort(root, range = {}) {
  const { start, end } = portRange(range);
  return start + (hashString(gitProjectRoot(root)) % (end - start + 1));
}

/**
 * Resolve the port `htw serve` should bind, and say WHY. Precedence:
 *   1. an explicit `--port` (argPort)          → "flag"    (a per-invocation pin)
 *   2. config `serve.pinPort === true`          → "pin"     (an explicit config pin)
 *   3. otherwise the git-root-derived port      → "derived" (the default; wins over
 *                                                            any stale baked serve.port)
 * The baked `config.serve.port` is only a default/cache — the derived port wins
 * unless the project explicitly pins one, so a config whose stamped port has gone
 * stale (or collides) still lands on this project's own canonical port.
 */
export function resolveServePort(config, { root = process.cwd(), argPort } = {}) {
  const serve = config.serve || {};
  const gitRoot = gitProjectRoot(root);
  const derived = projectDocsPort(gitRoot, serve.portRange);
  const pinnedArg = positiveInt(argPort);
  if (pinnedArg) return { port: pinnedArg, source: "flag", derived, gitRoot };
  if (serve.pinPort === true && positiveInt(serve.port)) {
    return { port: positiveInt(serve.port), source: "pin", derived, gitRoot };
  }
  return { port: derived, source: "derived", derived, gitRoot };
}

export function normalizeUrlBase(base) {
  return String(base || "").trim().replace(/\/+$/, "");
}

export function localDocsBase(config, { root = process.cwd(), host, port } = {}) {
  const serve = config.serve || {};
  const bindHost = host || serve.host || "127.0.0.1";
  const docsPort = positiveInt(port) || positiveInt(serve.port) || projectDocsPort(root, serve.portRange);
  const bindOverride = host || port;
  return normalizeUrlBase(!bindOverride && config.devUrlBase ? config.devUrlBase : `http://${bindHost}:${docsPort}`);
}

export function tailscaleDocsBase(config) {
  const serve = config.serve || {};
  const tailscale = serve.tailscale || config.tailscale;
  if (!tailscale) return null;
  if (typeof tailscale === "string") return normalizeUrlBase(tailscale);
  if (tailscale.enabled !== true) return null;
  if (tailscale.urlBase) return normalizeUrlBase(tailscale.urlBase);
  if (tailscale.host) {
    const scheme = tailscale.scheme || "https";
    const port = positiveInt(tailscale.port);
    return normalizeUrlBase(`${scheme}://${tailscale.host}${port ? `:${port}` : ""}`);
  }
  return null;
}

export function preferredDocsBase(config, opts = {}) {
  const tailscale = tailscaleDocsBase(config);
  if (tailscale) return { kind: "tailscale", urlBase: tailscale };
  if (config.canonicalUrlBase) return { kind: "canonical", urlBase: normalizeUrlBase(config.canonicalUrlBase) };
  return { kind: "dev", urlBase: localDocsBase(config, opts) };
}

export function docsRouteForTarget(root, target = "") {
  const raw = String(target || "").trim();
  if (!raw) return "/docs/";
  if (/^https?:\/\//u.test(raw)) return raw;

  let pathPart = raw;
  let suffix = "";
  const suffixAt = pathPart.search(/[?#]/u);
  if (suffixAt >= 0) {
    suffix = pathPart.slice(suffixAt);
    pathPart = pathPart.slice(0, suffixAt);
  }

  if (pathPart.startsWith("/docs/") || pathPart === "/docs") return pathPart + suffix;

  let rel = pathPart;
  if (isAbsolute(pathPart)) {
    rel = relative(resolve(root), pathPart);
  }
  rel = rel.split(sep).join("/");
  if (rel === "docs" || rel === "docs/index.html") return "/docs/" + suffix;
  if (rel.startsWith("docs/")) return "/" + rel + suffix;
  if (rel.startsWith("/")) return rel + suffix;
  return "/docs/" + rel.replace(/^\/+/, "") + suffix;
}

export function joinUrl(base, route) {
  if (/^https?:\/\//u.test(route)) return route;
  const cleanBase = normalizeUrlBase(base);
  let cleanRoute = route.startsWith("/") ? route : "/" + route;
  try {
    const u = new URL(cleanBase);
    const basePath = u.pathname.replace(/\/+$/, "");
    if (basePath.endsWith("/docs") && cleanRoute === "/docs/") cleanRoute = "/";
    else if (basePath.endsWith("/docs") && cleanRoute.startsWith("/docs/")) cleanRoute = cleanRoute.slice("/docs".length);
  } catch {
    /* fall through to plain string join */
  }
  return cleanBase + cleanRoute;
}

export function docsUrlForTarget(config, target = "", opts = {}) {
  const root = opts.root || config.root || process.cwd();
  const route = docsRouteForTarget(root, target);
  const base = opts.base || preferredDocsBase(config, { ...opts, root }).urlBase;
  return joinUrl(base, route);
}

export function finalizeServeConfig(config, root = process.cwd()) {
  const serve = { ...(config.serve || {}) };
  serve.host = serve.host || "127.0.0.1";
  serve.portRange = serve.portRange || DEFAULT_PORT_RANGE;
  // Derived wins unless the port is explicitly pinned — so a stamped port that
  // has gone stale (repo moved, or another project grabbed it) never sticks.
  const pinned = serve.pinPort === true && positiveInt(serve.port);
  serve.port = pinned ? positiveInt(serve.port) : projectDocsPort(root, serve.portRange);
  serve.command = serve.command || "npx github:aneym/how-to-work serve --answer-gate";
  serve.tailscale = serve.tailscale || { enabled: false, urlBase: null };

  config.serve = serve;
  // devUrlBase tracks the resolved dev port so `htw link` and `htw serve` agree;
  // a pinned config keeps whatever devUrlBase it deliberately set.
  if (!pinned || !config.devUrlBase) config.devUrlBase = `http://${serve.host}:${serve.port}`;
  if (!("canonicalUrlBase" in config)) config.canonicalUrlBase = null;
  return config;
}
