import { loadConfig } from "../config.mjs";
import { docsRouteForTarget, docsUrlForTarget, joinUrl, localDocsBase, preferredDocsBase } from "../links.mjs";

function flag(args, name) {
  return args.includes("--" + name);
}

function firstTarget(args) {
  return args.find((arg) => !arg.startsWith("--")) || "";
}

// A link that nothing serves is worse than no link — three broken-PRD-link
// incidents in three days came from handing out URLs no one had verified.
// Probe with a short timeout; report, never hang.
async function probe(url) {
  if (!/^https?:\/\//.test(url)) return { ok: false, note: "not an http(s) url" };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 1500);
  try {
    const r = await fetch(url, { method: "GET", redirect: "follow", signal: ctrl.signal });
    return { ok: r.ok, note: `HTTP ${r.status}` };
  } catch (e) {
    return { ok: false, note: e.name === "AbortError" ? "timeout" : (e.cause?.code || e.message) };
  } finally {
    clearTimeout(timer);
  }
}

export async function run({ root, args }) {
  const config = loadConfig(root);
  const target = firstTarget(args);
  const route = docsRouteForTarget(root, target);
  const preferred = preferredDocsBase(config, { root });
  const localBase = localDocsBase(config, { root });
  const payload = {
    kind: preferred.kind,
    route,
    url: docsUrlForTarget(config, target, { root }),
    localUrl: joinUrl(localBase, route),
  };

  const verified = await probe(payload.url);
  payload.verified = verified.ok;
  payload.probe = verified.note;

  if (flag(args, "json")) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  } else {
    process.stdout.write(`${payload.url}\n`);
    if (!verified.ok) {
      process.stderr.write(
        `htw link: WARNING — nothing verified at that URL (${verified.note}). Start the docs server (\`htw serve\`) and re-check before handing the link out.\n`,
      );
    }
  }
  if (flag(args, "strict") && !verified.ok) return 2;
  return 0;
}
