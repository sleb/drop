import { $ } from "bun";
import { chmod } from "node:fs/promises";

export type Cmd = string[];

export interface WriteOpts {
  mode?: number;
  owner?: string;
}

// All side effects go through a Ctx so --dry-run can print them instead.
// In dry-run mode, probes (ok/output/read) report "not done" so every step
// shows the commands it would run.
export interface Ctx {
  dryRun: boolean;
  log(line: string): void;
  run(cmd: Cmd): Promise<void>;
  ok(cmd: Cmd): Promise<boolean>;
  output(cmd: Cmd): Promise<string>;
  read(path: string): Promise<string | null>;
  write(path: string, content: string, opts?: WriteOpts): Promise<void>;
}

const SAFE = /^[\w@%+=:,./-]+$/;

export function quote(arg: string): string {
  return SAFE.test(arg) ? arg : `'${arg.replaceAll("'", `'\\''`)}'`;
}

export function format(cmd: Cmd): string {
  return cmd.map(quote).join(" ");
}

function describeWrite(path: string, opts: WriteOpts): string {
  const attrs = [
    opts.mode !== undefined ? `mode ${opts.mode.toString(8)}` : null,
    opts.owner ? `owner ${opts.owner}` : null,
  ].filter(Boolean);
  return attrs.length ? `write ${path} (${attrs.join(", ")})` : `write ${path}`;
}

export function dryCtx(log: (line: string) => void = console.log): Ctx {
  return {
    dryRun: true,
    log,
    async run(cmd) {
      log(`    $ ${format(cmd)}`);
    },
    async ok() {
      return false;
    },
    async output() {
      return "";
    },
    async read() {
      return null;
    },
    async write(path, content, opts = {}) {
      log(`    ${describeWrite(path, opts)}`);
      for (const line of content.trimEnd().split("\n")) log(`    | ${line}`);
    },
  };
}

export function liveCtx(log: (line: string) => void = console.log): Ctx {
  return {
    dryRun: false,
    log,
    async run(cmd) {
      log(`    $ ${format(cmd)}`);
      await $`${cmd}`;
    },
    async ok(cmd) {
      const { exitCode } = await $`${cmd}`.quiet().nothrow();
      return exitCode === 0;
    },
    async output(cmd) {
      const { exitCode, stdout } = await $`${cmd}`.quiet().nothrow();
      return exitCode === 0 ? stdout.toString().trim() : "";
    },
    async read(path) {
      const file = Bun.file(path);
      return (await file.exists()) ? file.text() : null;
    },
    async write(path, content, opts = {}) {
      log(`    ${describeWrite(path, opts)}`);
      await Bun.write(path, content);
      if (opts.mode !== undefined) await chmod(path, opts.mode);
      if (opts.owner) await $`chown ${`${opts.owner}:${opts.owner}`} ${path}`;
    },
  };
}
