/**
 * htw doctor — end-to-end docs-system diagnosis and mechanical repair.
 *
 *   htw doctor            report: engine/config drift, interface shims, docs
 *                         pipeline health (staleness, catalog, stage
 *                         divergence), and the judgment items an agent must
 *                         grill the author on
 *   htw doctor --fix      apply every MECHANICAL fix: restamp config, refresh
 *                         shims, sync divergent frontmatter stages from
 *                         state.json, scaffold missing state/ledger files,
 *                         re-render + re-register + re-index
 *   htw doctor --json     machine-readable report (for /htw-doctor)
 *
 * Exit codes: 0 = healthy (nothing pending), 1 = mechanical issues remain
 * (run --fix), 2 = mechanically clean but judgment items pending (grill the
 * author). Doctor never makes judgment calls: adopting hand-authored PRD
 * dirs, archiving docs, or re-asking rotting questions is the author's call.
 *
 * Node ESM, built-ins only.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../config.mjs";
import { auditAgentInterfaces, installAgentInterfaces } from "../interface-files.mjs";
import {
  canonicalStage,
  locatePrd,
  mutateFrontmatter,
  parseQuestionsBlock,
  readJsonMaybe,
} from "../prd-files.mjs";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BIN = join(PACKAGE_ROOT, "bin", "htw.mjs");

function htw(root, args) {
  return spawnSync(process.execPath, [BIN, "--root", root, ...args], { encoding: "utf8" });
}

function hasUnifiedConfig(root) {
  return (
    existsSync(join(root, ".agents", "skill-config", "workflow", "config.json")) ||
    existsSync(join(root, ".claude", "skill-config", "workflow", "config.json"))
  );
}

function slugFromSrc(src) {
  const m = /\/([^/]+)\/index\.doc\.md$/.exec(src) || /\/([^/]+)\.doc\.md$/.exec(src);
  return m ? m[1] : null;
}

/** Scan every .doc.md for unanswered :::questions records. */
function openQuestionScan(root, config) {
  const doc = config.doc || {};
  const out = [];
  const scan = (srcAbs, rel) => {
    let lines;
    try {
      lines = readFileSync(srcAbs, "utf8").split("\n");
    } catch {
      return;
    }
    const block = parseQuestionsBlock(lines);
    if (!block) return;
    const open = block.records.filter((r) => !r.answered).length;
    if (open > 0) out.push({ doc: rel, open });
  };
  const prdsAbs = join(root, doc.prdsDir || "docs/prds");
  if (existsSync(prdsAbs))
    for (const slug of readdirSync(prdsAbs)) {
      const p = join(prdsAbs, slug, "index.doc.md");
      if (existsSync(p)) scan(p, `${doc.prdsDir || "docs/prds"}/${slug}`);
    }
  const srcAbs = join(root, doc.sourcesDir || "docs/sources");
  if (existsSync(srcAbs))
    for (const f of readdirSync(srcAbs))
      if (f.endsWith(".doc.md")) scan(join(srcAbs, f), `${doc.sourcesDir || "docs/sources"}/${f}`);
  return out;
}

function legacyShims(root) {
  const found = [];
  for (const rt of [".codex", ".claude", ".agents"]) {
    for (const rel of [join(rt, "skills", "how-we-work"), join(rt, "commands", "how-we-work.md")]) {
      if (existsSync(join(root, rel))) found.push(rel);
    }
  }
  return found;
}

function runVerify(root) {
  const r = htw(root, ["verify", "--all", "--json"]);
  try {
    return JSON.parse(r.stdout);
  } catch {
    return { ok: r.status === 0, docs: [], unmanaged: [], parseError: (r.stderr || r.stdout).trim() };
  }
}

const MECHANICAL_RE =
  /stale render|no catalog entry|catalog href mismatch|generated HTML missing|preserved file missing|stage divergence/;

export async function run({ root, args }) {
  const fix = args.includes("--fix");
  const asJson = args.includes("--json");
  const say = asJson ? () => {} : (s) => process.stdout.write(s + "\n");
  const report = {
    ok: false,
    fixed: [],
    engine: {},
    interfaces: {},
    docs: {},
    judgment: [],
  };

  // --- 0. is this even an HTW repo? ---
  const config = loadConfig(root);
  const docsDir = join(root, (config.doc && config.doc.sourcesDir && dirname(config.doc.sourcesDir)) || "docs");
  if (!hasUnifiedConfig(root)) {
    const looksLikeHtw = existsSync(docsDir) || legacyShims(root).length > 0;
    report.judgment.push({
      kind: "not-initialized",
      detail: looksLikeHtw
        ? "docs/ or legacy shims exist but no unified config — run `npx --yes github:aneym/how-to-work init --migrate` if this repo should use How To Work"
        : "no How To Work config in this repo — run `npx --yes github:aneym/how-to-work init` to opt in",
    });
    report.ok = false;
    finish(report, say, asJson);
    return 2;
  }

  // --- 1. engine/config axis (delegates to `htw check`) ---
  let check = htw(root, ["check"]);
  if (check.status !== 0 && fix) {
    const init = htw(root, ["init", "--migrate", "--force"]);
    if (init.status === 0) {
      report.fixed.push("restamped config (init --migrate --force)");
      check = htw(root, ["check"]);
    }
  }
  report.engine = {
    ok: check.status === 0,
    detail: (check.stdout + check.stderr).trim().split("\n").slice(0, 6).join("\n"),
  };

  // --- 2. interface shims ---
  let iface = auditAgentInterfaces(root);
  if ((iface.missing.length || iface.stale.length) && fix) {
    installAgentInterfaces(root, { force: true });
    report.fixed.push(
      `refreshed ${iface.missing.length + iface.stale.length} interface shim(s) (interfaces --force)`,
    );
    iface = auditAgentInterfaces(root);
  }
  report.interfaces = {
    ok: !iface.missing.length && !iface.stale.length,
    missing: iface.missing,
    stale: iface.stale,
  };

  // --- 3. docs pipeline (delegates to `verify --json`) ---
  let verify = runVerify(root);
  if (fix && verify.docs) {
    // Stage divergence first (frontmatter must be synced from state BEFORE the
    // re-render), then one render --all (auto-registers), then the index.
    let mutated = false;
    for (const d of verify.docs) {
      const fails = d.fails || [];
      const slug = slugFromSrc(d.src);
      if (!slug) continue;
      if (fails.some((f) => /stage divergence/.test(f))) {
        try {
          const prd = locatePrd(root, slug);
          const state = readJsonMaybe(prd.stateAbs);
          const label = state && canonicalStage(prd.config, root, state.stage);
          if (label) {
            mutateFrontmatter(prd.srcAbs, (data) => {
              data.stage = label;
            });
            report.fixed.push(`${slug}: frontmatter stage synced from state.json → "${label}"`);
            mutated = true;
          }
        } catch {
          /* leave for the report */
        }
      }
      if (fails.some((f) => /preserved file missing/.test(f))) {
        try {
          const prd = locatePrd(root, slug);
          if (!existsSync(prd.stateAbs)) {
            writeFileSync(
              prd.stateAbs,
              JSON.stringify({ stage: prd.fm.data.stage || "Working doc", status: prd.fm.data.stage || "Working doc" }, null, 2) + "\n",
            );
            report.fixed.push(`${slug}: scaffolded missing state.json`);
            mutated = true;
          }
          if (!existsSync(prd.ledgerAbs)) {
            writeFileSync(prd.ledgerAbs, "");
            report.fixed.push(`${slug}: scaffolded missing ledger.jsonl`);
            mutated = true;
          }
        } catch {
          /* leave for the report */
        }
      }
    }
    const needsRender =
      mutated || verify.docs.some((d) => (d.fails || []).some((f) => MECHANICAL_RE.test(f)));
    if (needsRender) {
      const r = htw(root, ["render", "--all"]);
      if (r.status === 0) {
        htw(root, ["index"]);
        report.fixed.push("re-rendered + re-registered + re-indexed all docs");
      } else {
        report.fixed.push(`render --all FAILED: ${(r.stderr || r.stdout).trim().split("\n").pop()}`);
      }
    }
    verify = runVerify(root);
  }
  const remainingMechanical = (verify.docs || [])
    .filter((d) => (d.fails || []).some((f) => MECHANICAL_RE.test(f)))
    .map((d) => ({ src: d.src, fails: d.fails.filter((f) => MECHANICAL_RE.test(f)) }));
  // verify.ok is the STRICT view (it also fails on judgment-class findings like
  // hand-authored dirs). Doctor's mechanical view excludes those — they land in
  // the judgment list below instead of blocking the "run --fix" signal.
  const docsMechanicalOk =
    remainingMechanical.length === 0 &&
    (verify.theme ? !!verify.theme.ok : true) &&
    !verify.parseError;
  report.docs = {
    ok: !!verify.ok,
    mechanicalOk: docsMechanicalOk,
    total: (verify.docs || []).length,
    failing: (verify.docs || []).filter((d) => !d.ok).map((d) => ({ src: d.src, fails: d.fails })),
    mechanicalRemaining: remainingMechanical,
  };

  // --- 4. judgment items (doctor never decides these) ---
  for (const u of verify.unmanaged || [])
    report.judgment.push({
      kind: "hand-authored-prd",
      detail: `${u}: index.html with no index.doc.md source — adopt (recreate the source), archive, or delete? Ask the author.`,
    });
  for (const d of verify.docs || [])
    for (const f of d.fails || [])
      if (/does not map to the lifecycle/.test(f))
        report.judgment.push({ kind: "unmappable-stage", detail: `${d.src}: ${f} — ask the author which canonical stage this is, then \`htw stage set\`.` });
  for (const q of openQuestionScan(root, config))
    report.judgment.push({
      kind: "open-questions",
      detail: `${q.doc}: ${q.open} unanswered grill question${q.open === 1 ? "" : "s"} — still relevant? Re-ask (\`htw grill ask --apply\`) or resolve (\`htw grill resolve\`).`,
    });
  for (const l of legacyShims(root))
    report.judgment.push({ kind: "legacy-shim", detail: `${l}: legacy how-we-work shim — remove? (canonical entrypoint is /htw)` });

  const mechanicalOk = report.engine.ok && report.interfaces.ok && docsMechanicalOk;
  report.ok = mechanicalOk && report.judgment.length === 0;

  finish(report, say, asJson);
  if (!mechanicalOk) return 1;
  if (report.judgment.length) return 2;
  return 0;
}

function finish(report, say, asJson) {
  if (asJson) {
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
    return;
  }
  const mark = (ok) => (ok ? "OK  " : "FAIL");
  say(`htw doctor`);
  if (report.fixed.length) {
    say(`  fixed:`);
    for (const f of report.fixed) say(`    + ${f}`);
  }
  if (report.engine.detail !== undefined) {
    say(`  ${mark(report.engine.ok)} engine/config`);
    if (!report.engine.ok) for (const l of report.engine.detail.split("\n")) say(`       ${l}`);
  }
  if (report.interfaces.missing) {
    say(`  ${mark(report.interfaces.ok)} interface shims${report.interfaces.ok ? "" : ` — ${report.interfaces.missing.length} missing, ${report.interfaces.stale.length} stale (fix: interfaces --force)`}`);
  }
  if (report.docs.total !== undefined) {
    say(`  ${mark(report.docs.ok)} docs pipeline (${report.docs.total} docs)`);
    for (const d of report.docs.failing || [])
      say(`       ${d.src}\n         - ${(d.fails || []).join("\n         - ")}`);
  }
  if (report.judgment.length) {
    say(`  NEEDS the author (${report.judgment.length}) — grill, don't guess:`);
    for (const j of report.judgment) say(`    ? [${j.kind}] ${j.detail}`);
  }
  say(
    report.ok
      ? `  healthy.`
      : report.judgment.length && report.engine.ok && report.interfaces.ok && report.docs.mechanicalOk
        ? `  mechanically clean — ${report.judgment.length} judgment item(s) pending (grill the author).`
        : `  issues found — run \`htw doctor --fix\` for the mechanical ones.`,
  );
}
