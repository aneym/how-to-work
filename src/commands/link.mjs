import { loadConfig } from "../config.mjs";
import { docsRouteForTarget, docsUrlForTarget, joinUrl, localDocsBase, preferredDocsBase } from "../links.mjs";

function flag(args, name) {
  return args.includes("--" + name);
}

function firstTarget(args) {
  return args.find((arg) => !arg.startsWith("--")) || "";
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

  if (flag(args, "json")) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  } else {
    process.stdout.write(`${payload.url}\n`);
  }
  return 0;
}
