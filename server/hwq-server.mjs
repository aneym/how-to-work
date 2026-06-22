/**
 * hwq-server — zero-dependency loopback answer-gate.
 *
 * A thin http.createServer (or a mountable handler) over hwq-store.mjs exposing
 * the same routes Homebase's Vite middleware exposes, so the SAME generated
 * grill-card HTML works against it: the doc lights up, Submit persists, the
 * blocking `htw grill ask` client polls /result.
 *
 *   POST <prefix>/open      { docKey, prompt }            -> { ok, askId, openAt }
 *   GET  <prefix>/status    ?key=<docKey>                 -> { ok, waiting, ... }
 *   POST <prefix>/submit    { doc, docKey, total, answers, payload }
 *   GET  <prefix>/result    ?key=<docKey>&since=<ms>      -> { ok, pending|submission }
 *   POST <prefix>/close     { docKey }                    -> { ok }
 *   POST <prefix>/retry                                   -> { ok }
 *   GET  <prefix>/docrev    ?path=<docPath>               -> { ok, mtime }
 *
 * Hermes (or ANY) delivery is a PRIVATE, OPTIONAL onAnswer(ask) callback. It is
 * never shipped: default is a no-op and the 5s retry loop only arms when an
 * onAnswer is provided. The public package's onAnswer stays undefined.
 *
 * LOOPBACK-bound by default; a non-loopback host is refused unless allowExternal.
 *
 * Node ESM, built-ins only.
 */
import http from "node:http";
import { statSync } from "node:fs";
import path from "node:path";
import {
  closeAsk,
  getAsk,
  listPendingDeliveryAsks,
  markDeliveryAttempt,
  markDeliveryError,
  markDeliverySuccess,
  openAsk,
  submitAnswers,
} from "./hwq-store.mjs";

const DELIVERY_SCAN_INTERVAL_MS = 5_000;
const MAX_DELIVERY_BACKOFF_MS = 60_000;
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost", "0:0:0:0:0:0:0:1"]);

function isLoopbackHost(host) {
  return LOOPBACK_HOSTS.has(host);
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  const parsed = JSON.parse(raw);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
}

function normalizeAnswers(value) {
  if (!Array.isArray(value)) return [];
  return value.map((a) => {
    const o = a ?? {};
    return {
      id: String(o.id ?? ""),
      title: String(o.title ?? ""),
      decision: String(o.decision ?? ""),
      comment: String(o.comment ?? ""),
    };
  });
}

/**
 * Build a request handler for the answer-gate routes. Returns an async function
 * (req, res) => boolean — true if it handled the request (path under `prefix`),
 * false otherwise (so a host static server can fall through). When `onAnswer` is
 * provided, a backoff retry loop is started to (re)deliver submitted answers.
 */
export function createHwqHandler({ onAnswer, prefix = "/api/hwq", docsDir } = {}) {
  const docsRoot = docsDir ? path.resolve(docsDir) : path.resolve(process.cwd(), "docs");
  const deliver = typeof onAnswer === "function" ? onAnswer : null;
  let scanInFlight = false;

  async function deliverAsk(ask) {
    await markDeliveryAttempt(ask.docKey);
    try {
      const result = await deliver(ask);
      return markDeliverySuccess(ask.docKey, result ?? null);
    } catch (error) {
      return markDeliveryError(ask.docKey, error instanceof Error ? error.message : String(error));
    }
  }

  function shouldRetry(ask) {
    if (!ask.submission) return false;
    const d = ask.delivery;
    if (d?.status === "delivered") return false;
    const lastAttemptAt = d?.lastAttemptAt ?? 0;
    if (!lastAttemptAt) return true;
    const backoff = Math.min(MAX_DELIVERY_BACKOFF_MS, Math.max(2_000, 1_000 * 2 ** Math.min(d?.attempts ?? 0, 6)));
    return Date.now() - lastAttemptAt >= backoff;
  }

  async function retryPending() {
    if (!deliver || scanInFlight) return;
    scanInFlight = true;
    try {
      for (const ask of await listPendingDeliveryAsks()) if (shouldRetry(ask)) await deliverAsk(ask);
    } finally {
      scanInFlight = false;
    }
  }

  if (deliver) {
    void retryPending();
    const timer = setInterval(() => void retryPending(), DELIVERY_SCAN_INTERVAL_MS);
    if (typeof timer.unref === "function") timer.unref();
  }

  return async function handle(req, res) {
    const url = new URL(req.url || "/", "http://hwq.local");
    const pathname = url.pathname;
    if (pathname !== prefix && !pathname.startsWith(prefix + "/")) return false;
    const route = pathname.slice(prefix.length) || "/";
    try {
      if (route === "/open" && req.method === "POST") {
        const body = await readJsonBody(req);
        const docKey = String(body.docKey ?? "").trim();
        if (!docKey) return sendJson(res, 400, { ok: false, error: "docKey is required" }), true;
        const ask = await openAsk(docKey, String(body.prompt ?? ""));
        return sendJson(res, 200, { ok: true, askId: ask.askId, openAt: ask.openAt }), true;
      }
      if (route === "/status" && req.method === "GET") {
        const ask = url.searchParams.get("key") ? await getAsk(url.searchParams.get("key")) : null;
        return (
          sendJson(res, 200, {
            ok: true,
            waiting: !!(ask && ask.openAt),
            askId: ask?.askId ?? null,
            openAt: ask?.openAt ?? null,
            prompt: ask?.prompt ?? "",
            hasSubmission: !!ask?.submission,
            submittedAt: ask?.submission?.submittedAt ?? null,
            delivery: ask?.delivery ?? null,
          }),
          true
        );
      }
      if (route === "/submit" && req.method === "POST") {
        const body = await readJsonBody(req);
        const docKey = String(body.docKey ?? "").trim();
        if (!docKey) return sendJson(res, 400, { ok: false, error: "docKey is required" }), true;
        const submission = await submitAnswers(docKey, {
          doc: String(body.doc ?? ""),
          docKey,
          total: Number(body.total ?? 0),
          answers: normalizeAnswers(body.answers),
          payload: String(body.payload ?? ""),
        });
        let delivery = null;
        if (deliver) {
          const ask = await getAsk(docKey);
          if (ask) delivery = await deliverAsk(ask);
        }
        return sendJson(res, 200, { ok: true, submittedAt: submission.submittedAt, delivery }), true;
      }
      if (route === "/result" && req.method === "GET") {
        const docKey = url.searchParams.get("key") ?? "";
        const since = Number(url.searchParams.get("since") ?? "0");
        const ask = docKey ? await getAsk(docKey) : null;
        if (ask?.submission && ask.submission.submittedAt > since) {
          return sendJson(res, 200, { ok: true, pending: false, submission: ask.submission, delivery: ask.delivery ?? null }), true;
        }
        return sendJson(res, 200, { ok: true, pending: true }), true;
      }
      if (route === "/retry" && req.method === "POST") {
        await retryPending();
        return sendJson(res, 200, { ok: true }), true;
      }
      if (route === "/docrev" && req.method === "GET") {
        const reqPath = decodeURIComponent(url.searchParams.get("path") ?? "");
        const rel = reqPath.replace(/^\/?docs\/?/, "").replace(/^[/\\]+/, "");
        let file = path.resolve(docsRoot, rel);
        if (file !== docsRoot && !file.startsWith(docsRoot + path.sep)) {
          return sendJson(res, 403, { ok: false, error: "Forbidden" }), true;
        }
        try {
          let st = statSync(file);
          if (st.isDirectory()) st = statSync((file = path.join(file, "index.html")));
          return sendJson(res, 200, { ok: true, mtime: st.mtimeMs }), true;
        } catch {
          return sendJson(res, 200, { ok: true, mtime: 0 }), true;
        }
      }
      if (route === "/close" && req.method === "POST") {
        const body = await readJsonBody(req);
        const docKey = String(body.docKey ?? "").trim();
        if (docKey) await closeAsk(docKey);
        return sendJson(res, 200, { ok: true }), true;
      }
      return sendJson(res, route === "/open" || route === "/submit" || route === "/close" || route === "/retry" ? 405 : 404, { ok: false, error: "Not found" }), true;
    } catch (error) {
      return sendJson(res, 500, { ok: false, error: error instanceof Error ? error.message : "hwq request failed" }), true;
    }
  };
}

/**
 * Start a standalone loopback answer-gate http server. Refuses a non-loopback
 * host unless allowExternal is explicitly set.
 * @returns {Promise<http.Server>}
 */
export function startHwqServer({ port = 8765, host = "127.0.0.1", onAnswer, prefix = "/api/hwq", docsDir, allowExternal = false } = {}) {
  if (!isLoopbackHost(host) && !allowExternal) {
    return Promise.reject(new Error(`refusing to bind answer-gate to non-loopback host "${host}" (pass allowExternal to override)`));
  }
  const handle = createHwqHandler({ onAnswer, prefix, docsDir });
  const server = http.createServer((req, res) => {
    void handle(req, res).then((handled) => {
      if (!handled) sendJson(res, 404, { ok: false, error: "Not found" });
    });
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolve(server));
  });
}
