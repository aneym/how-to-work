/**
 * stages — the canonical How To Work lifecycle.
 *
 * SEAM-1: the lifecycle used to be read eagerly at module-eval from the consuming
 * repo's `src/lib/stages.json` (doc-kit.mjs:1003-1005). That ENOENT-crashed the
 * whole engine on any repo that did not ship that exact file. The lifecycle now
 * lives INLINE here as the zero-config default, and `loadStages(config)` honors an
 * optional `config.doc.stagesPath` override — resolved lazily, only when a render
 * actually needs the stage bar.
 *
 * The inline default is byte-for-byte the lifecycle Homebase ships in
 * src/lib/stages.json, so Homebase output never regresses when no override is set.
 *
 * Node ESM, built-ins only.
 */
import { readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";

// The canonical How To Work lifecycle. A PRD renders the stage bar by DEFAULT
// (opt out only via frontmatter "stageBar": false); its `stage` is matched (with
// aliases) to one of these and drawn as a monochrome segmented bar + status text,
// in place of a progress %. Keep `sequence` ordered; `aliases` map lowercased
// stage strings to a 0-based index.
export const DEFAULT_STAGES = {
  sequence: [
    "Working doc",
    "Draft PRD",
    "Ready for approval",
    "Approved",
    "In execution",
    "Done",
  ],
  aliases: {
    "working doc": 0,
    working: 0,
    idea: 0,
    draft: 1,
    "draft prd": 1,
    scoping: 1,
    "ready for approval": 2,
    ready: 2,
    review: 2,
    approved: 3,
    "in execution": 4,
    executing: 4,
    "in progress": 4,
    "in-progress": 4,
    build: 4,
    building: 4,
    active: 4,
    done: 5,
    complete: 5,
    completed: 5,
    implemented: 5,
    shipped: 5,
    archive: 5,
    archived: 5,
  },
};

/**
 * Resolve the lifecycle. With no `config.doc.stagesPath`, returns the inline
 * default (no filesystem read, never throws). With an override set, reads that
 * JSON file (absolute path honored, otherwise resolved against `root`); on any
 * read/parse failure falls back to the inline default rather than crashing.
 */
export function loadStages(config = {}, root = process.cwd()) {
  const stagesPath = config?.doc?.stagesPath;
  if (!stagesPath) return DEFAULT_STAGES;
  const abs = isAbsolute(stagesPath) ? stagesPath : join(root, stagesPath);
  try {
    const parsed = JSON.parse(readFileSync(abs, "utf8"));
    if (parsed && Array.isArray(parsed.sequence) && parsed.aliases) return parsed;
  } catch {
    // fall through to the inline default
  }
  return DEFAULT_STAGES;
}
