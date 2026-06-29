import { installAgentInterfaces } from "../interface-files.mjs";

function flag(args, name) {
  return args.includes(`--${name}`);
}

export async function run({ root, args }) {
  const force = flag(args, "force");
  const { written, skipped } = installAgentInterfaces(root, { force });

  if (written.length) {
    process.stdout.write("htw interfaces: installed agent interface files:\n");
    for (const rel of written) process.stdout.write(`  + ${rel}\n`);
  } else {
    process.stdout.write("htw interfaces: all agent interface files already exist.\n");
  }

  if (skipped.length && !force) {
    process.stdout.write(
      `htw interfaces: skipped ${skipped.length} existing file(s); pass --force to overwrite.\n`,
    );
  }

  return 0;
}
