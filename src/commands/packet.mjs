/**
 * packet — list and validate doc packets (docs/packets/<slug>/packet.json).
 *
 * Prints each packet with its goal and member docs grouped under their slug, and
 * flags any member `ref` that is not a registered catalog id (the navigator and
 * packet header silently show such refs as "unregistered", so this is the
 * CLI/CI gate). Exit 1 if any ref is unresolved or a manifest is malformed.
 *
 * Node ESM, built-ins only.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../config.mjs";

export async function run({ root }) {
  const config = loadConfig(root);
  const doc = config.doc || {};
  const packetsDir = doc.packetsDir || "docs/packets";
  const dir = join(root, packetsDir);
  if (!existsSync(dir)) {
    process.stdout.write(`No packets directory (${packetsDir}).\n`);
    return 0;
  }

  const ids = new Set();
  const catPath = join(root, doc.catalogPath || "docs/catalog.json");
  if (existsSync(catPath)) {
    try {
      const arr = JSON.parse(readFileSync(catPath, "utf8"));
      if (Array.isArray(arr)) for (const e of arr) if (e && e.id != null) ids.add(e.id);
    } catch {
      /* a broken catalog is reported by register/verify, not here */
    }
  }

  let problems = 0;
  let count = 0;
  for (const slug of readdirSync(dir).sort()) {
    const mf = join(dir, slug, "packet.json");
    if (!existsSync(mf)) continue;
    count++;
    let p;
    try {
      p = JSON.parse(readFileSync(mf, "utf8"));
    } catch (e) {
      process.stdout.write(`✗ ${slug}: invalid packet.json — ${e.message}\n`);
      problems++;
      continue;
    }
    const docs = Array.isArray(p.docs) ? p.docs : [];
    process.stdout.write(
      `${p.canonical ? "★" : "•"} ${p.title || slug} (${slug})${p.goal ? " — " + p.goal : ""}\n`,
    );
    for (const d of docs) {
      const ok = d && d.ref && ids.has(d.ref);
      if (!ok) problems++;
      process.stdout.write(
        `    [${(d && d.role) || "doc"}] ${(d && d.ref) || "(missing ref)"}` +
          (ok ? "" : "  ✗ not a registered catalog id") +
          "\n",
      );
    }
  }

  if (!count) {
    process.stdout.write(`No packets found in ${packetsDir}.\n`);
    return 0;
  }
  if (problems) {
    process.stderr.write(
      `\n${problems} issue(s): every packet doc ref must match a registered catalog id (run 'htw register --all').\n`,
    );
    return 1;
  }
  process.stdout.write(`\n${count} packet(s), all refs valid.\n`);
  return 0;
}
