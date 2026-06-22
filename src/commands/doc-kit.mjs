/**
 * doc-kit passthrough — wires the engine's render commands (new, render,
 * register, verify, contract) through the `htw` CLI.
 *
 * doc-kit.mjs is written as a self-running script: it parses process.argv and
 * dispatches at module load. So we do NOT import it (that would run its main
 * with the wrong argv). Instead we spawn it as a child process with its cwd set
 * to the resolved root — doc-kit resolves every path from process.cwd(), so the
 * child cwd IS how `--root` takes effect, with zero change to the engine.
 *
 * Node ESM, built-ins only.
 */
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { PACKAGE_ROOT } from "../config.mjs";

const DOC_KIT = join(PACKAGE_ROOT, "src", "doc-kit.mjs");

/**
 * Run a doc-kit subcommand against `root`. Returns the child's exit code (or 1
 * if it was killed by a signal), so the caller can `process.exit` with it.
 */
export function run(command, { root, args }) {
  const result = spawnSync(process.execPath, [DOC_KIT, command, ...args], {
    cwd: root,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  return typeof result.status === "number" ? result.status : 1;
}
