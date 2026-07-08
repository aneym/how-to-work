/**
 * htw stage — atomic lifecycle-stage transitions.
 *
 *   htw stage set <slug> <stage> [--who <name>]   move a PRD to a stage on
 *     EVERY surface in one transaction: state.json (the authority),
 *     frontmatter mirror, a ledger event, re-render (which auto-registers).
 *   htw stage get <slug>                          print the stage on each surface.
 *
 * The stage argument is alias-tolerant ("in progress", "executing", "done" …)
 * and always resolves to a canonical lifecycle label — free-text stage strings
 * were the top cause of blank stage bars and divergent surfaces.
 *
 * Node ESM, built-ins only.
 */
import { resolveDocArg, usageFor } from "../command-specs.mjs";
import {
  appendLedger,
  canonicalStage,
  locatePrd,
  mutateFrontmatter,
  mutateState,
  readJsonMaybe,
  rerender,
  stageSequence,
} from "../prd-files.mjs";

function argValue(args, flag) {
  const i = args.indexOf(flag);
  return i !== -1 && i + 1 < args.length ? args[i + 1] : null;
}

export async function run({ root, args }) {
  const sub = args[0];

  if (sub === "get") {
    const { slug } = resolveDocArg(args.slice(1));
    if (!slug) {
      process.stderr.write(`htw stage: usage — ${usageFor("stage get")}\n`);
      return 64;
    }
    const prd = locatePrd(root, slug);
    const state = readJsonMaybe(prd.stateAbs);
    process.stdout.write(
      JSON.stringify(
        {
          slug,
          state: state?.stage ?? null,
          frontmatter: prd.fm.data.stage ?? null,
          authority: state?.stage ?? prd.fm.data.stage ?? null,
        },
        null,
        2,
      ) + "\n",
    );
    return 0;
  }

  const resolved = resolveDocArg(args.slice(1));
  const input = resolved.rest
    .filter((a, i, arr) => !a.startsWith("--") && arr[i - 1] !== "--who")
    .join(" ");
  if (sub !== "set" || !resolved.slug || !input) {
    process.stderr.write(`htw stage: usage — ${usageFor("stage set")} | ${usageFor("stage get")}\n`);
    return 64;
  }

  const slug = resolved.slug;
  const who = argValue(args, "--who") || "htw";

  const prd = locatePrd(root, slug);
  const label = canonicalStage(prd.config, root, input);
  if (!label) {
    process.stderr.write(
      `htw stage: "${input}" does not map to the lifecycle — use one of: ${stageSequence(prd.config, root).join(" | ")}\n`,
    );
    return 1;
  }

  mutateState(prd.stateAbs, (state) => {
    state.stage = label;
    state.status = label;
  });
  mutateFrontmatter(prd.srcAbs, (data) => {
    data.stage = label;
  });
  appendLedger(prd.ledgerAbs, {
    event: "stage_change",
    actor: who,
    summary: `Stage → ${label}`,
  });
  const rc = rerender(root, slug, { quiet: true });
  process.stdout.write(
    `htw stage: ${slug} → "${label}" — state.json + frontmatter + ledger updated, ` +
      (rc === 0 ? "re-rendered + registered.\n" : "but RE-RENDER FAILED — run `htw render " + slug + "`.\n"),
  );
  return rc;
}
