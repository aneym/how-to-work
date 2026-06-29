/**
 * grill — the blocking human-in-the-loop question gate client.
 *
 * Ported from Homebase scripts/hwq-ask.mjs. Opens an "ask" on the answer-gate
 * server so the doc's question section LIGHTS UP, then polls until the in-doc
 * "Submit to agent" button posts the answers, prints them between the
 * ===HWQ-ANSWERS-BEGIN===/===HWQ-ANSWERS-END=== markers, and exits 0.
 *
 *   htw grill ask --doc <slug> [--base http://127.0.0.1:<repo-docs-port>/api/hwq]
 *                 [--key <pathname>] [--prompt "..."] [--no-wait]
 *                 [--timeout 1800000] [--poll 1500] [--stdin-fallback]
 *
 * Public-package changes vs the Homebase original:
 *   - `--base` is the FULL answer-gate base (e.g. .../api/hwq); routes are
 *     <base>/open, <base>/result, <base>/close. Defaults from the repo config
 *     (answerGate.base, combined with devUrlBase when relative).
 *   - No --thread/hermes: delivery targets are a private server concern.
 *   - `--stdin-fallback`: on ECONNREFUSED, instead of failing, print the doc's
 *     questions and read structured shorthand from stdin, emitting the SAME
 *     contract — so the live loop degrades to offline copy/paste with no server.
 *
 * Node ESM, built-ins only.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../config.mjs";
import { localDocsBase } from "../links.mjs";

function arg(args, name, def) {
  const i = args.indexOf("--" + name);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : def;
}
function flag(args, name) {
  return args.includes("--" + name);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CONNECTION_CODES = new Set([
  "ECONNREFUSED",
  "ENOTFOUND",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ETIMEDOUT",
  "UND_ERR_SOCKET",
  "UND_ERR_CONNECT_TIMEOUT",
]);

// The server is unreachable. Walk the (possibly nested / aggregated) cause chain
// for a known connection code; failing that, treat any undici "fetch failed"
// TypeError as unreachable — the whole point of --stdin-fallback is the offline
// case, so a network-level failure should degrade to stdin rather than error out.
function isUnreachable(error) {
  const codes = [];
  const collect = (e) => {
    if (!e || typeof e !== "object") return;
    if (e.code) codes.push(e.code);
    if (Array.isArray(e.errors)) e.errors.forEach(collect);
    if (e.cause) collect(e.cause);
  };
  collect(error);
  if (codes.some((c) => CONNECTION_CODES.has(c))) return true;
  return error instanceof TypeError && /fetch failed/i.test(error.message || "");
}

function resolveBase(args, config) {
  const explicit = arg(args, "base", "");
  let base = explicit || (config.answerGate && config.answerGate.base) || "/api/hwq";
  if (!/^https?:\/\//u.test(base)) {
    const origin = localDocsBase(config, { root: config.root || process.cwd() }).replace(/\/$/, "");
    base = origin + (base.startsWith("/") ? base : "/" + base);
  }
  return base.replace(/\/$/, "");
}

/** Best-effort: pull question id/title pairs from the rendered doc HTML. */
function readDocQuestions(root, slug, prdsDir) {
  if (!slug) return [];
  const candidates = [
    join(root, prdsDir, slug, "index.html"),
    join(root, prdsDir, slug + ".html"),
  ];
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    try {
      const html = readFileSync(file, "utf8");
      const out = [];
      const re = /data-qid="([^"]+)"[^>]*?data-qtitle="([^"]*)"/g;
      let m;
      while ((m = re.exec(html))) out.push({ id: m[1], title: m[2] });
      if (out.length) return out;
    } catch {
      /* ignore */
    }
  }
  return [];
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * Parse the same shorthand the doc's Copy button emits:
 *   "1r"          approve Q1 (accept recommendation)
 *   "1r — note"   approve Q1 with a note
 *   "2 answer"    custom/override answer for Q2
 * Tokens are separated by "|" or newlines.
 */
function parseShorthand(raw, questions) {
  const titleFor = (num) => {
    const q = questions.find((x) => x.id === "Q" + num || x.id === num);
    return q ? q.title : "";
  };
  const tokens = raw
    .split(/\n|\|/)
    .map((t) => t.trim())
    .filter(Boolean);
  const answers = [];
  for (const token of tokens) {
    const m = token.match(/^(\d+)\s*(r)?\s*(?:—|-{1,2})?\s*(.*)$/u);
    if (!m) continue;
    const num = m[1];
    const isApprove = !!m[2];
    const comment = (m[3] || "").trim();
    answers.push({
      id: "Q" + num,
      title: titleFor(num),
      decision: isApprove ? "approve" : "custom",
      comment,
    });
  }
  return answers;
}

function emitAnswers(submission) {
  process.stdout.write("\n===HWQ-ANSWERS-BEGIN===\n");
  process.stdout.write(JSON.stringify(submission, null, 2) + "\n");
  process.stdout.write("===HWQ-ANSWERS-END===\n");
  if (submission.payload) {
    process.stdout.write("\n----- paste-ready payload -----\n" + submission.payload + "\n");
  }
}

async function stdinFallback({ key, slug, questions }) {
  process.stderr.write(
    "htw grill: answer-gate unreachable — falling back to stdin.\n" +
      "Answer with shorthand (one per line or '|'-separated):\n" +
      "  <n>r [— note]   approve question n   |   <n> <answer>   custom answer\n",
  );
  if (questions.length) {
    process.stderr.write("\nOpen questions:\n");
    for (const q of questions) process.stderr.write("  " + q.id + ". " + (q.title || "(untitled)") + "\n");
  }
  process.stderr.write("\n(end with EOF / Ctrl-D)\n\n");
  const raw = (await readStdin()).trim();
  const answers = parseShorthand(raw, questions);
  const submission = {
    doc: slug || key,
    docKey: key,
    total: questions.length || answers.length,
    answers,
    payload: raw,
    submittedAt: Date.now(),
    source: "stdin-fallback",
  };
  emitAnswers(submission);
  return 0;
}

export async function run({ root, args }) {
  const sub = args[0];
  if (sub !== "ask") {
    process.stderr.write("htw grill: usage — htw grill ask --doc <slug> [--base <answerGate.base>]\n");
    return 64;
  }
  const rest = args.slice(1);
  const config = loadConfig(root);
  const prdsDir = (config.doc && config.doc.prdsDir) || "docs/prds";

  const base = resolveBase(rest, config);
  const slug = arg(rest, "doc", "");
  const key = arg(rest, "key", slug ? "/docs/prds/" + slug + "/" : "");
  const prompt = arg(rest, "prompt", "");
  const noWait = flag(rest, "no-wait") || flag(rest, "open-only") || flag(rest, "background");
  const useStdinFallback = flag(rest, "stdin-fallback");
  const timeoutMs = Number(arg(rest, "timeout", String(30 * 60 * 1000)));
  const pollMs = Number(arg(rest, "poll", "1500"));

  if (!key) {
    process.stderr.write("htw grill: need --doc <slug> or --key <pathname>\n");
    return 64;
  }

  const questions = readDocQuestions(root, slug, prdsDir);

  // 1) open the ask -> the doc lights up on its next status poll.
  let openAt;
  try {
    const r = await fetch(base + "/open", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ docKey: key, prompt }),
    });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || "open failed");
    openAt = j.openAt || Date.now();
  } catch (e) {
    if (useStdinFallback && isUnreachable(e)) {
      return stdinFallback({ key, slug, questions });
    }
    process.stderr.write("htw grill: could not open ask on " + base + " — " + e.message + "\n");
    return 3;
  }

  const timeoutLabel =
    timeoutMs < 60000
      ? Math.max(1, Math.round(timeoutMs / 1000)) + "s"
      : Math.round(timeoutMs / 60000) + "m";
  process.stderr.write(
    "htw grill: ask open for '" +
      key +
      "' — doc is lit up" +
      (noWait
        ? "; opened in the background.\n"
        : ", waiting for submission (timeout " + timeoutLabel + ").\n"),
  );

  if (noWait) {
    process.stdout.write(JSON.stringify({ ok: true, docKey: key, openAt, mode: "open-only" }, null, 2) + "\n");
    return 0;
  }

  // 2) poll for the submission.
  const deadline = Date.now() + timeoutMs;
  const resultUrl = base + "/result?key=" + encodeURIComponent(key) + "&since=" + openAt;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(resultUrl);
      const j = await r.json();
      if (j.ok && !j.pending && j.submission) {
        emitAnswers(j.submission);
        if (j.delivery) {
          process.stdout.write("\n----- delivery -----\n" + JSON.stringify(j.delivery, null, 2) + "\n");
        }
        return 0;
      }
    } catch {
      // server momentarily unreachable (e.g. mid-restart) — keep polling.
    }
    await sleep(pollMs);
  }

  process.stderr.write("htw grill: timed out with no submission.\n");
  try {
    await fetch(base + "/close", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ docKey: key }),
    });
  } catch {
    /* best-effort */
  }
  return 2;
}
