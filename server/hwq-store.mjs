/**
 * hwq-store — file-backed human-in-the-loop question store.
 *
 * Ported VERBATIM from Homebase server/hwq/store.ts (the proven engine), with
 * two intentional public-package changes:
 *
 *   1. The hermes-typed fields are STRIPPED from the data shape (critique
 *      must-fix #8): no `hermes` / HwqHermesTarget, no `OpenAskOptions.hermes`.
 *      The ask carries only the generic ask/answer/delivery shape; ANY delivery
 *      target is the concern of the optional onAnswer(ask) seam in hwq-server,
 *      never of the store.
 *   2. The data directory is resolvable (configureStore) so a `--root` / mounted
 *      server can point the file at the consuming repo. It DEFAULTS to
 *      {cwd}/data/hwq.json — identical to the original — so nothing regresses.
 *
 * Imports are node:fs/promises, node:crypto, node:path only. Zero dependencies.
 *
 * It tracks PRD/doc question-ask sessions only, not app data. File-backed so it
 * survives a server restart and is shared between any servers run from the repo.
 *
 * @typedef {Object} HwqAnswer
 * @property {string} id
 * @property {string} title
 * @property {string} decision
 * @property {string} comment
 *
 * @typedef {Object} HwqSubmission
 * @property {string} doc
 * @property {string} docKey
 * @property {number} total
 * @property {HwqAnswer[]} answers
 * @property {string} payload
 * @property {number} submittedAt
 *
 * @typedef {"pending"|"delivered"|"error"} HwqDeliveryStatus
 *
 * @typedef {Object} HwqDelivery
 * @property {HwqDeliveryStatus} status
 * @property {number} attempts
 * @property {number} enqueuedAt
 * @property {number|null} lastAttemptAt
 * @property {number|null} deliveredAt
 * @property {string|null} error
 * @property {unknown} result
 *
 * @typedef {Object} HwqAsk
 * @property {string} askId
 * @property {string} docKey
 * @property {string} prompt
 * @property {number|null} openAt          null => not currently waiting
 * @property {HwqSubmission|null} submission
 * @property {HwqDelivery|null} delivery
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";

// Default to {cwd}/data — identical to the Homebase original. configureStore()
// lets a mounted server repoint this at a resolved repo root without chdir.
let dataDir = path.resolve(process.cwd(), "data");

/** Repoint the backing directory (file becomes <dir>/hwq.json). */
export function configureStore({ dataDir: dir } = {}) {
  if (dir) dataDir = path.resolve(dir);
}

function hwqFile() {
  return path.join(dataDir, "hwq.json");
}

/** Coerce a persisted ask to the current generic shape. */
function normalizeAsk(value) {
  return {
    askId: value.askId,
    docKey: value.docKey,
    prompt: value.prompt ?? "",
    openAt: value.openAt ?? null,
    submission: value.submission ?? null,
    delivery: value.delivery ?? null,
  };
}

async function readState() {
  try {
    const raw = await readFile(hwqFile(), "utf8");
    const parsed = JSON.parse(raw);
    return Object.fromEntries(
      Object.entries(parsed).map(([key, ask]) => [key, normalizeAsk(ask)]),
    );
  } catch {
    return {};
  }
}

async function writeState(state) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(hwqFile(), JSON.stringify(state, null, 2), "utf8");
}

/** @returns {HwqAsk} */
export async function openAsk(docKey, prompt) {
  const state = await readState();
  const ask = {
    askId: randomUUID(),
    docKey,
    prompt: prompt || "",
    openAt: Date.now(),
    submission: null,
    delivery: null,
  };
  state[docKey] = ask;
  await writeState(state);
  return ask;
}

/** @returns {Promise<HwqAsk|null>} */
export async function getAsk(docKey) {
  const state = await readState();
  return state[docKey] ?? null;
}

/** @returns {Promise<HwqSubmission>} */
export async function submitAnswers(docKey, input) {
  const state = await readState();
  const submission = { ...input, submittedAt: Date.now() };
  const existing = state[docKey];
  if (existing) {
    existing.submission = submission;
    existing.openAt = null; // close the ask
    // Leave delivery null on submit; the optional onAnswer retry loop arms a
    // pending delivery on its first attempt (see listPendingDeliveryAsks).
    existing.delivery = null;
  } else {
    state[docKey] = {
      askId: randomUUID(),
      docKey,
      prompt: "",
      openAt: null,
      submission,
      delivery: null,
    };
  }
  await writeState(state);
  return submission;
}

/**
 * Asks that have a submission but have not yet been delivered. With the hermes
 * field stripped, "deliverable" is simply: there is a submission and delivery is
 * not yet "delivered". The retry loop only consults this when onAnswer is wired.
 * @returns {Promise<HwqAsk[]>}
 */
export async function listPendingDeliveryAsks() {
  const state = await readState();
  return Object.values(state).filter(
    (ask) => !!ask.submission && ask.delivery?.status !== "delivered",
  );
}

/** @returns {Promise<HwqDelivery|null>} */
export async function markDeliveryAttempt(docKey) {
  const state = await readState();
  const ask = state[docKey];
  if (!ask) return null;
  const previous = ask.delivery;
  ask.delivery = {
    status: "pending",
    attempts: (previous?.attempts ?? 0) + 1,
    enqueuedAt: previous?.enqueuedAt ?? Date.now(),
    lastAttemptAt: Date.now(),
    deliveredAt: null,
    error: null,
    result: previous?.result ?? null,
  };
  await writeState(state);
  return ask.delivery;
}

/** @returns {Promise<HwqDelivery|null>} */
export async function markDeliverySuccess(docKey, result) {
  const state = await readState();
  const ask = state[docKey];
  if (!ask) return null;
  const previous = ask.delivery;
  ask.delivery = {
    status: "delivered",
    attempts: previous?.attempts ?? 0,
    enqueuedAt: previous?.enqueuedAt ?? Date.now(),
    lastAttemptAt: previous?.lastAttemptAt ?? Date.now(),
    deliveredAt: Date.now(),
    error: null,
    result,
  };
  await writeState(state);
  return ask.delivery;
}

/** @returns {Promise<HwqDelivery|null>} */
export async function markDeliveryError(docKey, error) {
  const state = await readState();
  const ask = state[docKey];
  if (!ask) return null;
  const previous = ask.delivery;
  ask.delivery = {
    status: "error",
    attempts: previous?.attempts ?? 0,
    enqueuedAt: previous?.enqueuedAt ?? Date.now(),
    lastAttemptAt: previous?.lastAttemptAt ?? Date.now(),
    deliveredAt: null,
    error,
    result: previous?.result ?? null,
  };
  await writeState(state);
  return ask.delivery;
}

export async function closeAsk(docKey) {
  const state = await readState();
  if (state[docKey]) {
    state[docKey].openAt = null;
    await writeState(state);
  }
}
