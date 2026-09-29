# drop

An executable `bun` script that sets up a fresh DigitalOcean droplet (Ubuntu LTS, x86_64) for Rust development.

## Plan

### What gets installed

#### 1. As `root`

**System**

- `apt update && apt full-upgrade`
- Timezone `America/Los_Angeles`, locale `en_US.UTF-8`
- Ghostty's terminfo (`xterm-ghostty`), compiled with `tic -x` from a copy embedded in the binary (`infocmp -x xterm-ghostty` on macOS). Ubuntu only ships it in the `ghostty` GUI package.
- Last step: if the upgrade left `/var/run/reboot-required`, schedule a reboot one minute out (`shutdown -r +1`), so the script and cloud-init finish first

**User & security** (first, before the upgrade, so `scott` can SSH in within seconds of boot while the rest runs)

- Create a non-root, passwordless, sudo user named `scott` (`adduser --disabled-password`, so key-based SSH only; `NOPASSWD` rule in `/etc/sudoers.d/scott`)
- Copy root's `authorized_keys` to the new user

**`apt` packages**

- Build toolchain: `build-essential`, `pkg-config`, `libssl-dev`, `cmake`, `clang`
- Core utilities: `git`, `curl`, `wget`, `unzip`, `zsh`
- Homebrew prerequisites: `procps`, `file`
- Security: `unattended-upgrades`

Build dependencies stay on `apt` (never Homebrew) so Rust crates with C code link against the system libraries.

#### 2. As `scott`

**Shell**

- Set `zsh` as the login shell (done by root with `chsh`)
- `oh-my-zsh`

**Rust toolchain** (official `rustup` installer)

- `rustup` with the stable toolchain
- Components: `rustfmt`, `clippy`, `rust-analyzer`, `rust-src`
- `~/.cargo/config.toml`: use `sccache` as `rustc-wrapper`
- Linking uses Rust's default (the bundled `rust-lld` since Rust 1.90), no custom linker

**Homebrew** (installed to `/home/linuxbrew/.linuxbrew`, packages installed via `brew bundle` with a Brewfile)

- Editor and terminal: `neovim`, `herdr`
- CLI tools: `ripgrep`, `fd`, `bat`, `eza`, `zoxide`, `fzf`, `gh`, `bun`, `jq`, `htop`
- Rust build helpers: `sccache`
- Cargo tools: `cargo-nextest`, `bacon`, `cargo-watch`, `cargo-edit`, `cargo-audit`, `cargo-outdated`, `cargo-expand`
  - All of these are in `homebrew/core`; any that ever drop out get installed with `cargo install` instead
- The Brewfile is written to `~/.Brewfile`

**Config**

- `.zshrc`: `brew shellenv`, cargo env, `zoxide` init, in a `# >>> drop >>>` block after oh-my-zsh's template
- Git config: name=`sleb`, email=`scott.g.lebaron@gmail.com`, default branch=`main`
- `neovim` config: clone `sleb/kickstart` into `~/.config/nvim`

### Script design

- Runs on the droplet at first boot as a [user data](https://docs.digitalocean.com/products/droplets/how-to/provide-user-data/) script. It only provisions a droplet, it doesn't create one.
- Packaged as a single-file executable with `bun` embedded (`bun build --compile --target=bun-linux-x64`) so Bun doesn't need to be on the droplet
- Published as a GitHub Release asset on `sleb/drop`
- Idempotent: every step checks whether it's already done, so re-running is safe
- `--dry-run` prints the commands without running them
- Clear per-step logging with timing
- After a step runs, its check runs again, so a command that exits 0 without doing its job fails right away
- Fails fast: the first failing step stops the run with a non-zero exit. Fix it and re-run.
- No optional extras or flags beyond `--dry-run`. "Do or do not..."

### User data

User data is limited to 64 KB of text, so the binary can't go in it. Instead, the user data is a small stub that downloads and runs the binary:

```bash
#!/bin/bash
set -euo pipefail
curl -fsSL https://github.com/sleb/drop/releases/latest/download/drop-linux-x64 -o /usr/local/bin/drop
chmod +x /usr/local/bin/drop
/usr/local/bin/drop 2>&1 | tee /var/log/drop.log
```

Paste it into the droplet's "User data" field, or pass it with `doctl compute droplet create --user-data-file stub.sh ...`. Progress is logged to `/var/log/drop.log` and `/var/log/cloud-init-output.log`.

## Development

```bash
bun install
bun run index.ts --dry-run   # print every command; nothing runs
bun test
bun build --compile --target=bun-linux-x64 index.ts --outfile drop-linux-x64
```

- `index.ts`: argument parsing and the root/Linux guard
- `src/config.ts`: everything installed or written, including the embedded files
- `src/steps.ts`: the steps, each with a `done` check and a `run` action
- `src/ctx.ts`: the one place commands run and files are written, with dry-run and live versions
- `src/provision.ts`: runs the steps with logging and timing
