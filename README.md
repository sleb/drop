# drop

An executable `bun` script that sets up a fresh DigitalOcean droplet (Ubuntu LTS, x86_64) for Rust development.

## Plan

### What gets installed

#### 1. As `root`

**System**

- `apt update && apt full-upgrade`
- Timezone `America/Los_Angeles`, locale `en_US.UTF-8`
- zram swap (compressed swap in RAM) so small droplets don't run out of memory compiling Rust, without the disk wear of a swap file
  - `/etc/systemd/zram-generator.conf`: `zram-size = ram`, `compression-algorithm = zstd`
  - `vm.swappiness = 180` (the kernel should prefer zram over dropping file cache)

**User & security**

- Create a non-root, passwordless, sudo user named `scott`
- Copy root's `authorized_keys` to the new user

**`apt` packages**

- Build toolchain: `build-essential`, `pkg-config`, `libssl-dev`, `cmake`, `clang`, `lld`
- Core utilities: `git`, `curl`, `wget`, `unzip`, `zsh`
- Homebrew prerequisites: `procps`, `file`
- Swap: `systemd-zram-generator`
- Security: `unattended-upgrades`

Build dependencies stay on `apt` (never Homebrew) so Rust crates with C code link against the system libraries.

#### 2. As `scott`

**Shell**

- Set `zsh` as the login shell (done by root with `chsh`)
- `oh-my-zsh`

**Rust toolchain** (official `rustup` installer)

- `rustup` with the stable toolchain
- Components: `rustfmt`, `clippy`, `rust-analyzer`, `rust-src`
- `~/.cargo/config.toml`: link with `mold`, use `sccache` as `rustc-wrapper`

**Homebrew** (installed to `/home/linuxbrew/.linuxbrew`, packages installed via `brew bundle` with a Brewfile)

- Editor and terminal: `neovim`, `herdr`
- CLI tools: `ripgrep`, `fd`, `bat`, `eza`, `zoxide`, `fzf`, `gh`, `bun`, `jq`, `htop`
- Rust build helpers: `mold`, `sccache`
- Cargo tools: `cargo-nextest`, `bacon`, `cargo-watch`, `cargo-edit`, `cargo-audit`, `cargo-outdated`, `cargo-expand`
  - Any that turn out not to be in Homebrew get installed with `cargo install` instead

**Config**

- `.zshrc`: `brew shellenv`, cargo env, `zoxide` init
- Git config: name=`sleb`, email=`scott.g.lebaron@gmail.com`, default branch=`main`
- `neovim` config: clone `sleb/kickstart` into `~/.config/nvim`

### Script design

- Runs on the droplet at first boot as a [user data](https://docs.digitalocean.com/products/droplets/how-to/provide-user-data/) script. It only provisions a droplet, it doesn't create one.
- Packaged as a single-file executable with `bun` embedded (`bun build --compile --target=bun-linux-x64`) so Bun doesn't need to be on the droplet
- Published as a GitHub Release asset on `sleb/drop`
- Idempotent: every step checks whether it's already done, so re-running is safe
- `--dry-run` prints the commands without running them
- Clear per-step logging with timing
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
bun run index.ts
```
