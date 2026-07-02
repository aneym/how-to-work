/**
 * prd-files — shared file surgery for the atomic lifecycle commands
 * (`htw stage set`, `htw ledger add`, `htw grill resolve`).
 *
 * The skills used to BEG agents to "update every visible surface in the same
 * pass" (source, state.json, ledger.jsonl, rendered HTML, catalog). That is
 * deterministic work, so it lives here as code: each command mutates the
 * machine surfaces together and re-renders (render auto-registers), making the
 * multi-surface law impossible to violate by forgetfulness.
 *
 * Node ESM, built-ins only.
 */
import {
  appendFileSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { loadConfig, PACKAGE_ROOT } from "./config.mjs";
import { loadStages } from "./stages.mjs";

export function readJsonMaybe(absPath) {
  try {
    return JSON.parse(readFileSync(absPath, "utf8"));
  } catch {
    return null;
  }
}

/** Parse the JSON frontmatter block. Returns { lines, end, data, body }. */
export function readFrontmatter(srcAbs) {
  const raw = readFileSync(srcAbs, "utf8");
  const lines = raw.split("\n");
  if (lines[0]?.trim() !== "---") throw new Error(`${srcAbs}: missing frontmatter fence`);
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      end = i;
      break;
    }
  }
  if (end === -1) throw new Error(`${srcAbs}: unterminated frontmatter`);
  // Tolerate trailing commas exactly like the renderer does.
  const cleaned = lines
    .slice(1, end)
    .join("\n")
    .replace(/,(\s*[}\]])/g, "$1");
  return { raw, lines, end, data: JSON.parse(cleaned), body: lines.slice(end + 1).join("\n") };
}

/** Rewrite only the frontmatter block (normalized 2-space JSON); body untouched. */
export function mutateFrontmatter(srcAbs, mutate) {
  const fm = readFrontmatter(srcAbs);
  mutate(fm.data);
  writeFileSync(srcAbs, `---\n${JSON.stringify(fm.data, null, 2)}\n---\n${fm.body}`);
  return fm.data;
}

/** Locate a PRD package by slug under the configured prdsDir. */
export function locatePrd(root, slug) {
  const config = loadConfig(root);
  const prdsDir = config.doc?.prdsDir || "docs/prds";
  const dir = join(root, prdsDir, slug);
  const srcAbs = join(dir, "index.doc.md");
  if (!existsSync(srcAbs))
    throw new Error(
      `${prdsDir}/${slug}/index.doc.md not found — "${slug}" is not an engine-managed PRD in this repo`,
    );
  const fm = readFrontmatter(srcAbs);
  return {
    config,
    slug,
    dir,
    srcAbs,
    fm,
    rel: `${prdsDir}/${slug}`,
    stateAbs: join(dir, fm.data.statePath || "state.json"),
    ledgerAbs: join(dir, fm.data.ledgerPath || "ledger.jsonl"),
  };
}

/** Canonicalize a stage label through the lifecycle alias table (null = unmappable). */
export function canonicalStage(config, root, input) {
  const { sequence, aliases } = loadStages(config, root);
  const raw = String(input || "").trim().toLowerCase();
  for (const k of [
    raw,
    raw.replace(/\s*\([^)]*\)\s*$/, "").trim(),
    raw.replace(/[_-]+/g, " ").trim(),
  ]) {
    if (!k) continue;
    if (k in aliases) return sequence[aliases[k]];
    const i = sequence.findIndex((s) => s.toLowerCase() === k);
    if (i !== -1) return sequence[i];
  }
  return null;
}

export function stageSequence(config, root) {
  return loadStages(config, root).sequence;
}

/** Append one schema-checked event line to ledger.jsonl. Returns the entry. */
export function appendLedger(ledgerAbs, { event, summary = "", actor = "htw" }) {
  if (!event || !/^[a-z0-9][\w-]*$/i.test(String(event)))
    throw new Error(`ledger event must be a short snake_case identifier (got "${event}")`);
  const entry = { ts: new Date().toISOString(), event: String(event), actor, summary: String(summary) };
  let prefix = "";
  if (existsSync(ledgerAbs)) {
    const cur = readFileSync(ledgerAbs, "utf8");
    if (cur.length && !cur.endsWith("\n")) prefix = "\n";
  }
  appendFileSync(ledgerAbs, `${prefix}${JSON.stringify(entry)}\n`);
  return entry;
}

/** Bump state.json (creating it if missing) through a mutator; writes it back. */
export function mutateState(stateAbs, mutate) {
  const state = readJsonMaybe(stateAbs) || {};
  mutate(state);
  state.lastUpdated = new Date().toISOString();
  writeFileSync(stateAbs, `${JSON.stringify(state, null, 2)}\n`);
  return state;
}

/** Re-render one doc via the engine CLI (render auto-registers). */
export function rerender(root, slug, { quiet = false } = {}) {
  const bin = join(PACKAGE_ROOT, "bin", "htw.mjs");
  const r = spawnSync(process.execPath, [bin, "--root", root, "render", slug], {
    stdio: quiet ? "ignore" : "inherit",
  });
  return typeof r.status === "number" ? r.status : 1;
}

// ---------------------------------------------------------------------------
// :::questions surgery (grill resolve)
// ---------------------------------------------------------------------------

/**
 * Locate the first :::questions block and its records in a source's lines.
 * Returns { start, end, records: [{ id, title, answered, first, last }] }
 * (line indexes into `lines`; first/last span the record's field lines).
 */
export function parseQuestionsBlock(lines) {
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^:::questions\b/.test(lines[i].trim())) {
      start = i;
      break;
    }
  }
  if (start === -1) return null;
  let end = -1;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].trim() === ":::") {
      end = i;
      break;
    }
  }
  if (end === -1) return null;
  const records = [];
  let cur = null;
  for (let i = start + 1; i < end; i++) {
    const startM = lines[i].match(/^\s*-\s+(\w[\w-]*)\s*:\s*(.*)$/);
    const contM = lines[i].match(/^\s+(\w[\w-]*)\s*:\s*(.*)$/);
    if (startM) {
      if (cur) records.push(cur);
      cur = { id: null, title: null, answered: false, first: i, last: i };
      if (startM[1] === "id") cur.id = startM[2].trim();
      if (startM[1] === "title") cur.title = startM[2].trim();
    } else if (cur && contM) {
      if (contM[1] === "id") cur.id = contM[2].trim();
      if (contM[1] === "title") cur.title = contM[2].trim();
      if (contM[1] === "answer") cur.answered = true;
      cur.last = i;
    } else if (cur && lines[i].trim()) {
      cur.last = i; // continuation text of the previous field
    }
  }
  if (cur) records.push(cur);
  return { start, end, records };
}

/** Human-readable answer text for one gate/copy-packet answer. */
export function answerText(a) {
  const comment = (a.comment || "").trim();
  if (a.decision === "approve")
    return comment ? `Approved — recommendation accepted. ${comment}` : "Approved — recommendation accepted.";
  if (a.decision === "disapprove") return comment ? `Disapproved — ${comment}` : "Disapproved.";
  return comment; // custom
}

/**
 * Apply gate-shaped answers ([{id, decision, comment}]) to a PRD package:
 * write `answer:` fields into the :::questions records, append a [Decided]
 * row per answer to the :::decisions block (created after the questions block
 * when absent), append ledger events, bump state.json, and re-render.
 *
 * Returns { applied: [...], skipped: [...], remainingOpen }.
 */
export function applyAnswers(root, slug, answers, { who = "author" } = {}) {
  const prd = locatePrd(root, slug);
  const raw = readFileSync(prd.srcAbs, "utf8");
  const lines = raw.split("\n");
  const block = parseQuestionsBlock(lines);
  if (!block) throw new Error(`${prd.rel}/index.doc.md has no :::questions block`);

  const norm = (id) => {
    const s = String(id || "").trim();
    return /^\d+$/.test(s) ? `Q${s}` : s;
  };
  const byId = new Map();
  for (const r of block.records) if (r.id) byId.set(r.id, r);

  const applied = [];
  const skipped = [];
  const targets = [];
  for (const a of answers) {
    const id = norm(a.id);
    const rec = byId.get(id);
    const text = answerText({ ...a, comment: a.comment });
    if (!rec) {
      skipped.push({ id, reason: "no matching question record" });
      continue;
    }
    if (!text) {
      skipped.push({ id, reason: "empty answer text (custom answer needs a comment)" });
      continue;
    }
    targets.push({ rec, id, a, text });
  }

  // Edit bottom-up so record line indexes stay valid.
  targets.sort((x, y) => y.rec.first - x.rec.first);
  for (const t of targets) {
    // Replace an existing answer field line, else append one after the record.
    let answerLine = -1;
    for (let i = t.rec.first; i <= t.rec.last; i++) {
      if (/^\s+answer\s*:/.test(lines[i])) {
        answerLine = i;
        break;
      }
    }
    const fieldLine = `  answer: ${t.text}`;
    if (answerLine !== -1) lines.splice(answerLine, 1, fieldLine);
    else lines.splice(t.rec.last + 1, 0, fieldLine);
  }

  // Append [Decided] rows to the decisions block (create one after the
  // questions block if the doc has none) — newest decisions land at the tail,
  // which is exactly what the renderer keeps visible.
  const today = new Date().toISOString().slice(0, 10);
  const rows = targets.map(
    (t) => `${(t.rec.title || t.id).replace(/\s*::\s*/g, " — ")} :: [Decided ${today}] ${t.text}`,
  );
  if (rows.length) {
    let decOpen = -1;
    for (let i = 0; i < lines.length; i++) {
      if (/^:::decisions\b/.test(lines[i].trim())) {
        decOpen = i;
        break;
      }
    }
    if (decOpen !== -1) {
      let decClose = -1;
      for (let i = decOpen + 1; i < lines.length; i++) {
        if (lines[i].trim() === ":::") {
          decClose = i;
          break;
        }
      }
      if (decClose !== -1) lines.splice(decClose, 0, ...rows);
    } else {
      // No decisions block yet: create one right after the questions block
      // close (attention order: questions, then decisions, then content).
      const refreshed = parseQuestionsBlock(lines);
      const insertAt = refreshed ? refreshed.end + 1 : lines.length;
      lines.splice(insertAt, 0, "", ":::decisions", ...rows, ":::");
    }
  }

  writeFileSync(prd.srcAbs, lines.join("\n"));

  for (const t of targets) {
    appendLedger(prd.ledgerAbs, {
      event: "question_answered",
      actor: who,
      summary: `${t.id} ${t.a.decision || "custom"}${t.a.comment ? ` — ${t.a.comment}` : ""}`,
    });
    applied.push({ id: t.id, decision: t.a.decision || "custom" });
  }
  if (applied.length) mutateState(prd.stateAbs, () => {});

  const after = parseQuestionsBlock(readFileSync(prd.srcAbs, "utf8").split("\n"));
  const remainingOpen = after ? after.records.filter((r) => !r.answered).length : 0;
  const renderStatus = applied.length ? rerender(root, slug, { quiet: true }) : 0;
  return { applied, skipped, remainingOpen, renderStatus };
}

/**
 * Parse ANY of the three answer payload shapes into gate-shaped answers:
 *   1. gate JSON ({answers:[...]} or a bare array)
 *   2. the doc's "Copy answers" packet (Q1 — title: APPROVE …)
 *   3. bare shorthand tokens ("1r — note | 2 custom answer")
 */
export function parseAnswersPayload(rawText) {
  const raw = String(rawText || "").trim();
  if (!raw) return [];
  if (raw.startsWith("{") || raw.startsWith("[")) {
    try {
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed) ? parsed : parsed.answers;
      if (Array.isArray(list))
        return list
          .filter((a) => a && a.id)
          .map((a) => ({ id: a.id, decision: a.decision || "custom", comment: a.comment || "" }));
    } catch {
      /* fall through to text forms */
    }
  }
  const answers = [];
  const lineRe =
    /^(Q?[\w-]+)\s*(?:—|-)\s*.*?:\s*(APPROVE|DISAPPROVE|CUSTOM)\b\s*(?:\(accept recommendation\)\.?)?\s*(?:Note:\s*|—\s*|-\s*)?(.*)$/i;
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || /^Re:/i.test(t) || /^Shorthand:/i.test(t)) continue;
    const m = t.match(lineRe);
    if (m) {
      answers.push({
        id: m[1],
        decision: m[2].toLowerCase(),
        comment: (m[3] || "").trim(),
      });
    }
  }
  if (answers.length) return answers;
  // Shorthand fallback: "1r — note" (approve) / "2 custom answer" tokens.
  for (const token of raw.split(/\n|\|/)) {
    const m = token.trim().match(/^(\d+)\s*(r)?\s*(?:—|-{1,2})?\s*(.*)$/u);
    if (!m) continue;
    answers.push({
      id: `Q${m[1]}`,
      decision: m[2] ? "approve" : "custom",
      comment: (m[3] || "").trim(),
    });
  }
  return answers;
}
