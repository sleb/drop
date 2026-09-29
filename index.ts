#!/usr/bin/env bun
import { $ } from "bun";
import { dryCtx, liveCtx } from "./src/ctx.ts";
import { provision } from "./src/provision.ts";
import { steps } from "./src/steps.ts";

const USAGE = "usage: drop [--dry-run]";

const fail = (message: string): never => {
  console.error(`drop: ${message}`);
  process.exit(1);
};

const args = Bun.argv.slice(2);
if (args.some((a) => a !== "--dry-run")) fail(USAGE);
const dryRun = args.includes("--dry-run");

if (!dryRun) {
  if (process.platform !== "linux")
    fail("only runs on Linux (use --dry-run to preview)");
  if (process.getuid?.() !== 0) fail("must run as root");
  // cloud-init runs user data with a minimal environment and no TTY.
  $.env({
    ...process.env,
    HOME: process.env.HOME ?? "/root",
    PATH:
      process.env.PATH ??
      "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
    DEBIAN_FRONTEND: "noninteractive",
    NEEDRESTART_MODE: "a",
  });
  $.cwd("/");
}

const ctx = dryRun ? dryCtx() : liveCtx();
try {
  await provision(ctx, steps);
} catch (err) {
  fail(err instanceof Error ? err.message : String(err));
}
