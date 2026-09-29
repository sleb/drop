import { expect, test } from "bun:test";
import { ZSHRC_BLOCK } from "./config.ts";
import { dryCtx, format } from "./ctx.ts";
import { provision } from "./provision.ts";
import { missingComponents, missingPackages, steps, upsertBlock } from "./steps.ts";

test("format quotes only args that need it", () => {
  expect(format(["apt-get", "-o", "DPkg::Lock::Timeout=600"])).toBe(
    "apt-get -o DPkg::Lock::Timeout=600",
  );
  expect(format(["bash", "-c", "echo 'hi' $HOME"])).toBe(`bash -c 'echo '\\''hi'\\'' $HOME'`);
});

test("missingPackages", () => {
  const out = "git installed\ncurl not-installed\n";
  expect(missingPackages(["git", "curl", "zsh"], out)).toEqual(["curl", "zsh"]);
});

test("missingComponents", () => {
  const out = "cargo-x86_64-unknown-linux-gnu\nclippy-x86_64-unknown-linux-gnu\nrust-src\n";
  expect(missingComponents(["clippy", "rust-src", "rustfmt"], out)).toEqual(["rustfmt"]);
});

test("upsertBlock appends to a file without the block", () => {
  expect(upsertBlock("", ZSHRC_BLOCK)).toBe(ZSHRC_BLOCK);
  expect(upsertBlock("export A=1", ZSHRC_BLOCK)).toBe(`export A=1\n\n${ZSHRC_BLOCK}`);
});

test("upsertBlock replaces an existing block and is stable", () => {
  const old = "before\n# >>> drop >>>\nstale\n# <<< drop <<<\nafter\n";
  const updated = upsertBlock(old, ZSHRC_BLOCK);
  expect(updated).toBe(`before\n${ZSHRC_BLOCK}after\n`);
  expect(upsertBlock(updated, ZSHRC_BLOCK)).toBe(updated);
});

test("dry run prints every step without executing anything", async () => {
  const lines: string[] = [];
  await provision(
    dryCtx((l) => lines.push(l)),
    steps,
  );
  const output = lines.join("\n");

  for (const step of steps) expect(output).toContain(step.name);
  expect(output).not.toContain("already done");
  expect(output).toContain("apt-get -y -o DPkg::Lock::Timeout=600");
  expect(output).toContain("sudo -u scott -H bash -lc");
  expect(output).toContain("write /etc/sudoers.d/scott (mode 440)");
  expect(output).toContain(`Finished ${steps.length} steps`);
});
