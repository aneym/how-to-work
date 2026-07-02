/**
 * htw ledger — schema-checked ledger appends.
 *
 *   htw ledger add <slug> <event> [--body "…"] [--who <name>] [--no-render]
 *
 * Agents used to hand-craft `printf '{"ts":…}' >> ledger.jsonl` lines, which is
 * how four incompatible event schemas ended up in the fleet. This appends the
 * ONE canonical shape ({ts, event, actor, summary}) and re-renders so the
 * Ledger tab never lags the file.
 *
 * Node ESM, built-ins only.
 */
import { appendLedger, locatePrd, rerender } from "../prd-files.mjs";

function argValue(args, flag) {
  const i = args.indexOf(flag);
  return i !== -1 && i + 1 < args.length ? args[i + 1] : null;
}

export async function run({ root, args }) {
  const sub = args[0];
  if (sub !== "add" || !args[1] || !args[2]) {
    process.stderr.write(
      "htw ledger: usage — htw ledger add <slug> <event> [--body \"…\"] [--who <name>] [--no-render]\n",
    );
    return 64;
  }
  const slug = args[1];
  const event = args[2];
  const summary = argValue(args, "--body") || "";
  const who = argValue(args, "--who") || "htw";

  const prd = locatePrd(root, slug);
  const entry = appendLedger(prd.ledgerAbs, { event, actor: who, summary });
  let rc = 0;
  if (!args.includes("--no-render")) rc = rerender(root, slug, { quiet: true });
  process.stdout.write(
    `htw ledger: appended ${entry.event} (${entry.ts}) to ${prd.rel}/ledger.jsonl` +
      (rc === 0 ? " and re-rendered.\n" : " — RE-RENDER FAILED, run `htw render " + slug + "`.\n"),
  );
  return rc;
}
