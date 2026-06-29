import { isAbsolute, relative, resolve, sep } from "node:path";

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

export function projectDocsPort(root, range = {}) {
  const { start, end } = portRange(range);
  return start + (hashString(resolve(root)) % (end - start + 1));
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
  serve.port = positiveInt(serve.port) || projectDocsPort(root, serve.portRange);
  serve.command = serve.command || "npx github:aneym/how-to-work serve --answer-gate";
  serve.tailscale = serve.tailscale || { enabled: false, urlBase: null };

  config.serve = serve;
  if (!config.devUrlBase) config.devUrlBase = `http://${serve.host}:${serve.port}`;
  if (!("canonicalUrlBase" in config)) config.canonicalUrlBase = null;
  return config;
}
