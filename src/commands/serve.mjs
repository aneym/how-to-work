/**
 * serve — a zero-dependency static server for rendered docs, with an OPTIONAL
 * mounted answer-gate so the live grill loop works in any repo (no Homebase, no
 * Hermes, no Convex, no framework).
 *
 *   htw serve [--port <repo-docs-port>] [--answer-gate] [--host 127.0.0.1] [--allow-external]
 *
 * Static web root is the repo root, but only the /docs/* subtree is served — so
 * a rendered PRD at docs/prds/<slug>/index.html is reachable at the SAME
 * pathname the doc cards use as their docKey (/docs/prds/<slug>/). With
 * --answer-gate, the POST/GET /api/hwq/* routes are mounted same-origin (the
 * hard constraint the doc-kit URLs assume) so Submit persists to data/hwq.json
 * and `htw grill ask` can poll it.
 *
 * LOOPBACK-bound by default; refuses a non-loopback host without --allow-external.
 * The public server passes NO onAnswer — delivery is a private callback, never
 * shipped — so it runs in "local" mode: copy/submit/poll, no auto-delivery.
 *
 * Node ESM, built-ins only.
 */
import http from "node:http";
import { statSync, createReadStream } from "node:fs";
import path from "node:path";
import { loadConfig } from "../config.mjs";
import { joinUrl, localDocsBase, preferredDocsBase, resolveServePort, tailscaleDocsBase } from "../links.mjs";
import { bind, listActive, portOwner, registryPath, release } from "../registry.mjs";
import { createHwqHandler } from "../../server/hwq-server.mjs";
import { configureStore } from "../../server/hwq-store.mjs";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost", "0:0:0:0:0:0:0:1"]);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jsonl": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

function arg(args, name, def) {
  const i = args.indexOf("--" + name);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : def;
}
function flag(args, name) {
  return args.includes("--" + name);
}

function notFound(res) {
  res.statusCode = 404;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end("404 Not Found");
}

function serveStatic(req, res, root) {
  if (req.method !== "GET" && req.method !== "HEAD") return notFound(res);
  const url = new URL(req.url || "/", "http://docs.local");
  let rel = decodeURIComponent(url.pathname).replace(/^\/+/, "");
  // Serve the docs/ tree at BOTH the canonical /docs/* mount and bare root paths
  // (/explainers/x, /prds/x/): the previous server served at root, so existing
  // links and muscle memory keep resolving instead of 404ing.
  if (rel === "docs" || rel.startsWith("docs/")) rel = rel.slice(4).replace(/^\/+/, "");
  if (rel === "") rel = "index.html";
  const docsRoot = path.resolve(root, "docs");
  let file = path.resolve(docsRoot, rel);
  if (file !== docsRoot && !file.startsWith(docsRoot + path.sep)) return notFound(res);

  try {
    let st = statSync(file);
    if (st.isDirectory()) st = statSync((file = path.join(file, "index.html")));
    res.statusCode = 200;
    res.setHeader("Content-Type", MIME[path.extname(file).toLowerCase()] || "application/octet-stream");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Length", st.size);
    if (req.method === "HEAD") return res.end();
    createReadStream(file).pipe(res);
  } catch {
    notFound(res);
  }
}

// Print the cross-project registry of active docs servers, one row per LIVE
// htw server, so a human can see which repo root owns which port at a glance.
function printStatus() {
  const active = listActive();
  process.stdout.write(`htw serve --status — active How-To-Work docs servers (registry: ${registryPath()})\n`);
  if (active.length === 0) {
    process.stdout.write("  (none running)\n");
    return 0;
  }
  const rows = active.map((e) => ({
    port: String(e.port),
    pid: String(e.pid),
    root: e.root,
    host: e.host || "127.0.0.1",
    since: e.boundAt || "",
  }));
  const w = (key, head) => Math.max(head.length, ...rows.map((r) => r[key].length));
  const wp = w("port", "PORT");
  const wi = w("pid", "PID");
  const wr = w("root", "ROOT");
  const wh = w("host", "HOST");
  const line = (r) =>
    `  ${r.port.padEnd(wp)}  ${r.pid.padEnd(wi)}  ${r.root.padEnd(wr)}  ${r.host.padEnd(wh)}  ${r.since}\n`;
  process.stdout.write(line({ port: "PORT", pid: "PID", root: "ROOT", host: "HOST", since: "SINCE" }));
  for (const r of rows) process.stdout.write(line(r));
  return 0;
}

export async function run({ root, args }) {
  if (flag(args, "status")) return printStatus();

  const config = loadConfig(root);
  const argPort = arg(args, "port", null);
  const { port, source, derived, gitRoot } = resolveServePort(config, { root, argPort });
  const host = arg(args, "host", config.serve.host || "127.0.0.1");
  const allowExternal = flag(args, "allow-external");
  const answerGate = flag(args, "answer-gate");

  if (!LOOPBACK_HOSTS.has(host) && !allowExternal) {
    process.stderr.write(`htw serve: refusing to bind to non-loopback host "${host}" (pass --allow-external to override)\n`);
    return 1;
  }

  // Refuse to squat a port another PROJECT already owns in the shared registry.
  // (A non-htw process on the port is caught by the real EADDRINUSE below.)
  const owner = portOwner(port);
  if (owner && path.resolve(owner.root) !== path.resolve(gitRoot)) {
    const label = source === "derived" ? `this project's derived port ${port}` : `requested port ${port}`;
    process.stderr.write(
      `htw serve: refusing to squat — ${label} is owned by another project:\n` +
        `    ${owner.root} (pid ${owner.pid}, since ${owner.boundAt})\n` +
        `  this project (${gitRoot}) derives port ${derived}.\n` +
        `  free the other server, or pass --port <n> to override.\n`,
    );
    return 1;
  }

  // Keep the answer-gate's data/hwq.json inside the consuming repo.
  configureStore({ dataDir: path.join(root, "data") });
  const docsDir = path.join(root, "docs");

  // No onAnswer: delivery is a private, host-only callback — never shipped here.
  const hwq = answerGate ? createHwqHandler({ prefix: "/api/hwq", docsDir }) : null;

  const server = http.createServer((req, res) => {
    const handle = async () => {
      if (hwq && (await hwq(req, res))) return;
      serveStatic(req, res, root);
    };
    void handle();
  });

  return new Promise((resolve) => {
    let bound = false;
    const cleanup = () => {
      if (bound) {
        release({ port });
        bound = false;
      }
    };
    // Release our registry entry however the process ends.
    process.once("exit", cleanup);
    for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) {
      process.once(sig, () => {
        cleanup();
        process.exit(0);
      });
    }

    server.once("error", (err) => {
      cleanup();
      process.stderr.write(`htw serve: ${err.message}\n`);
      resolve(1);
    });
    server.listen(port, host, () => {
      bind({ port, root: gitRoot, host, derived });
      bound = true;
      const localBase = localDocsBase(config, { root, host, port });
      const preferred = preferredDocsBase(config, { root, host, port });
      const portNote = source === "derived" ? `derived from ${gitRoot}` : source === "pin" ? "pinned in config" : "from --port";
      process.stderr.write(
        `htw serve: docs on ${joinUrl(localBase, "/docs/")} (port ${port}, ${portNote})` +
          (answerGate ? ` (answer-gate mounted at /api/hwq)` : ` (static; pass --answer-gate for the live grill loop)`) +
          "\n",
      );
      if (preferred.kind === "tailscale") {
        process.stderr.write(`htw serve: tailscale link ${joinUrl(preferred.urlBase, "/docs/")}\n`);
      } else if ((config.serve && config.serve.tailscale && config.serve.tailscale.enabled) && !tailscaleDocsBase(config)) {
        process.stderr.write("htw serve: warning: serve.tailscale.enabled is true but no urlBase/host is configured\n");
      }
      // Long-running: never resolves on its own (Ctrl-C to stop).
    });
  });
}
