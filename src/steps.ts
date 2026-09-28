import * as c from "./config.ts";
import type { Cmd, Ctx } from "./ctx.ts";

export interface Step {
  name: string;
  // Returns true when the step's end state is already in place. Steps without
  // a check are naturally idempotent and always run.
  done?: (ctx: Ctx) => Promise<boolean>;
  run: (ctx: Ctx) => Promise<void>;
}

// Homebrew refuses to run as root, so the user phase runs through sudo with a
// login shell and the user's own HOME.
export function asUser(script: string): Cmd {
  return ["sudo", "-u", c.USER, "-H", "bash", "-lc", `cd ~ && ${script}`];
}

const APT: Cmd = [
  "apt-get",
  "-y",
  // cloud-init and apt-daily may still hold the lock at first boot.
  "-o",
  "DPkg::Lock::Timeout=600",
  "-o",
  "Dpkg::Options::=--force-confdef",
  "-o",
  "Dpkg::Options::=--force-confold",
];

const BREW_ENV = `eval "$(${c.BREW} shellenv)"`;

const exists = (path: string): Cmd => ["test", "-e", path];

async function fileIs(ctx: Ctx, path: string, content: string) {
  return (await ctx.read(path)) === content;
}

// Parses `dpkg-query -W -f='${Package} ${db:Status-Status}\n'` output.
export function missingPackages(wanted: string[], dpkgOutput: string): string[] {
  const installed = new Set(
    dpkgOutput
      .split("\n")
      .map((line) => line.trim().split(/\s+/))
      .filter(([, status]) => status === "installed")
      .map(([pkg]) => pkg),
  );
  return wanted.filter((pkg) => !installed.has(pkg));
}

// Parses `rustup component list --installed`, whose lines look like
// `clippy-x86_64-unknown-linux-gnu` or `rust-src`.
export function missingComponents(wanted: string[], rustupOutput: string): string[] {
  const lines = rustupOutput.split("\n").map((l) => l.trim());
  return wanted.filter((comp) => !lines.some((l) => l === comp || l.startsWith(`${comp}-x86_64`)));
}

// Replaces the marked block in a shell rc file, or appends it if absent.
export function upsertBlock(existing: string, block: string): string {
  const [start, end] = [block.split("\n")[0]!, block.trimEnd().split("\n").at(-1)!];
  const i = existing.indexOf(start);
  const j = existing.indexOf(end, i);
  if (i !== -1 && j !== -1) {
    return existing.slice(0, i) + block + existing.slice(j + end.length).replace(/^\n/, "");
  }
  const sep = existing === "" || existing.endsWith("\n") ? "" : "\n";
  return `${existing}${sep}${existing ? "\n" : ""}${block}`;
}

async function aptStatus(ctx: Ctx) {
  const out = await ctx.output([
    "dpkg-query",
    "-W",
    "-f=${Package} ${db:Status-Status}\\n",
    ...c.APT_PACKAGES,
  ]);
  return missingPackages(c.APT_PACKAGES, out);
}

export const rootSteps: Step[] = [
  {
    name: "Upgrade system packages",
    async run(ctx) {
      await ctx.run([...APT, "update"]);
      await ctx.run([...APT, "full-upgrade"]);
    },
  },
  {
    name: "Install apt packages",
    async done(ctx) {
      return (await aptStatus(ctx)).length === 0;
    },
    async run(ctx) {
      await ctx.run([...APT, "install", ...(await aptStatus(ctx))]);
    },
  },
  {
    name: `Set timezone to ${c.TIMEZONE}`,
    async done(ctx) {
      return (await ctx.output(["timedatectl", "show", "-p", "Timezone", "--value"])) === c.TIMEZONE;
    },
    async run(ctx) {
      await ctx.run(["timedatectl", "set-timezone", c.TIMEZONE]);
    },
  },
  {
    name: `Set locale to ${c.LOCALE}`,
    async done(ctx) {
      const current = (await ctx.read("/etc/default/locale")) ?? "";
      const generated = await ctx.output(["locale", "-a"]);
      return current.includes(`LANG=${c.LOCALE}`) && generated.split("\n").includes("en_US.utf8");
    },
    async run(ctx) {
      await ctx.run(["locale-gen", c.LOCALE]);
      await ctx.run(["update-locale", `LANG=${c.LOCALE}`]);
    },
  },
  {
    name: `Create user ${c.USER}`,
    async done(ctx) {
      return ctx.ok(["id", "-u", c.USER]);
    },
    async run(ctx) {
      // No password; SSH keys and the NOPASSWD sudoers rule are the only way in.
      await ctx.run(["adduser", "--disabled-password", "--comment", "", c.USER]);
    },
  },
  {
    name: `Grant ${c.USER} passwordless sudo`,
    async done(ctx) {
      return fileIs(ctx, c.SUDOERS_PATH, c.SUDOERS);
    },
    async run(ctx) {
      await ctx.write(c.SUDOERS_PATH, c.SUDOERS, { mode: 0o440 });
      await ctx.run(["visudo", "--check", "--file", c.SUDOERS_PATH]);
    },
  },
  {
    name: `Copy root's authorized_keys to ${c.USER}`,
    async done(ctx) {
      return ctx.ok(["cmp", "-s", "/root/.ssh/authorized_keys", `${c.HOME}/.ssh/authorized_keys`]);
    },
    async run(ctx) {
      const owner = ["-o", c.USER, "-g", c.USER];
      await ctx.run(["install", "-d", "-m", "700", ...owner, `${c.HOME}/.ssh`]);
      await ctx.run([
        "install",
        "-m",
        "600",
        ...owner,
        "/root/.ssh/authorized_keys",
        `${c.HOME}/.ssh/authorized_keys`,
      ]);
    },
  },
  {
    name: `Set ${c.USER}'s login shell to zsh`,
    async done(ctx) {
      const entry = await ctx.output(["getent", "passwd", c.USER]);
      return entry.split(":").at(-1) === c.ZSH;
    },
    async run(ctx) {
      await ctx.run(["chsh", "--shell", c.ZSH, c.USER]);
    },
  },
];

export const userSteps: Step[] = [
  {
    name: "Install oh-my-zsh",
    async done(ctx) {
      return ctx.ok(exists(`${c.HOME}/.oh-my-zsh`));
    },
    async run(ctx) {
      await ctx.run(
        asUser(
          'sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)" "" --unattended',
        ),
      );
    },
  },
  {
    name: "Install rustup",
    async done(ctx) {
      return ctx.ok(exists(c.RUSTUP));
    },
    async run(ctx) {
      await ctx.run(
        asUser(
          "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --no-modify-path --profile minimal --default-toolchain none",
        ),
      );
    },
  },
  {
    name: "Install stable Rust toolchain and components",
    async done(ctx) {
      const out = await ctx.output(asUser(`${c.RUSTUP} component list --installed --toolchain stable`));
      return missingComponents(c.RUST_COMPONENTS, out).length === 0;
    },
    async run(ctx) {
      const components = c.RUST_COMPONENTS.flatMap((comp) => ["--component", comp]);
      await ctx.run(
        asUser(`${c.RUSTUP} toolchain install stable --profile minimal ${components.join(" ")}`),
      );
      await ctx.run(asUser(`${c.RUSTUP} default stable`));
    },
  },
  {
    name: "Install Homebrew",
    async done(ctx) {
      return ctx.ok(exists(c.BREW));
    },
    async run(ctx) {
      await ctx.run(
        asUser(
          'NONINTERACTIVE=1 bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"',
        ),
      );
    },
  },
  {
    name: "Install Homebrew packages",
    async done(ctx) {
      return (
        (await fileIs(ctx, c.BREWFILE_PATH, c.BREWFILE)) &&
        (await ctx.ok(asUser(`${BREW_ENV} && brew bundle check --file ${c.BREWFILE_PATH}`)))
      );
    },
    async run(ctx) {
      await ctx.write(c.BREWFILE_PATH, c.BREWFILE, { mode: 0o644, owner: c.USER });
      await ctx.run(asUser(`${BREW_ENV} && brew bundle install --file ${c.BREWFILE_PATH}`));
    },
  },
  {
    name: "Configure cargo to use sccache",
    async done(ctx) {
      return fileIs(ctx, c.CARGO_CONFIG_PATH, c.CARGO_CONFIG);
    },
    async run(ctx) {
      await ctx.write(c.CARGO_CONFIG_PATH, c.CARGO_CONFIG, { mode: 0o644, owner: c.USER });
    },
  },
  {
    name: "Configure .zshrc",
    async done(ctx) {
      return ((await ctx.read(c.ZSHRC_PATH)) ?? "").includes(c.ZSHRC_BLOCK);
    },
    async run(ctx) {
      const existing = (await ctx.read(c.ZSHRC_PATH)) ?? "";
      await ctx.write(c.ZSHRC_PATH, upsertBlock(existing, c.ZSHRC_BLOCK), {
        mode: 0o644,
        owner: c.USER,
      });
    },
  },
  {
    name: "Configure git",
    async done(ctx) {
      for (const [key, value] of Object.entries(c.GIT_CONFIG)) {
        if ((await ctx.output(asUser(`git config --global --get ${key}`))) !== value) return false;
      }
      return true;
    },
    async run(ctx) {
      for (const [key, value] of Object.entries(c.GIT_CONFIG)) {
        await ctx.run(asUser(`git config --global ${key} '${value}'`));
      }
    },
  },
  {
    name: "Clone neovim config",
    async done(ctx) {
      return ctx.ok(exists(`${c.NVIM_DIR}/.git`));
    },
    async run(ctx) {
      await ctx.run(asUser(`git clone ${c.NVIM_REPO} ${c.NVIM_DIR}`));
    },
  },
];

// Last, so everything else is in place before the new kernel boots.
const rebootStep: Step = {
  name: "Reboot if upgrades need it",
  async done(ctx) {
    return ctx.ok([
      "sh",
      "-c",
      "test ! -e /var/run/reboot-required || test -e /run/systemd/shutdown/scheduled",
    ]);
  },
  async run(ctx) {
    // Scheduled rather than immediate so drop and cloud-init exit cleanly
    // first; otherwise cloud-init would run the user data again after boot.
    await ctx.run(["shutdown", "-r", "+1", "drop: rebooting to finish upgrades"]);
  },
};

export const steps: Step[] = [...rootSteps, ...userSteps, rebootStep];
