// Everything the script installs or writes. Embedded here because the compiled
// binary is self-contained and can't read files next to it at runtime.

// `infocmp -x xterm-ghostty` from Ghostty on macOS; bundled into the binary.
import ghosttyTerminfo from "./xterm-ghostty.txt";

export const USER = "scott";
export const HOME = `/home/${USER}`;
export const TIMEZONE = "America/Los_Angeles";
export const LOCALE = "en_US.UTF-8";
export const ZSH = "/usr/bin/zsh";

export const BREW_PREFIX = "/home/linuxbrew/.linuxbrew";
export const BREW = `${BREW_PREFIX}/bin/brew`;
export const RUSTUP = `${HOME}/.cargo/bin/rustup`;

export const APT_PACKAGES = [
  // Build toolchain
  "build-essential",
  "pkg-config",
  "libssl-dev",
  "cmake",
  "clang",
  // Core utilities
  "git",
  "curl",
  "wget",
  "unzip",
  "zsh",
  // Homebrew prerequisites
  "procps",
  "file",
  // Security
  "unattended-upgrades",
];

export const RUST_COMPONENTS = ["rustfmt", "clippy", "rust-analyzer", "rust-src"];

export const GHOSTTY_TERMINFO = ghosttyTerminfo;
export const GHOSTTY_TERMINFO_PATH = "/tmp/xterm-ghostty.terminfo";

export const SUDOERS_PATH = `/etc/sudoers.d/${USER}`;
export const SUDOERS = `${USER} ALL=(ALL) NOPASSWD:ALL
`;

export const BREWFILE_PATH = `${HOME}/.Brewfile`;
export const BREWFILE = `# Editor and terminal
brew "neovim"
brew "herdr"

# CLI tools
brew "ripgrep"
brew "fd"
brew "bat"
brew "eza"
brew "zoxide"
brew "fzf"
brew "gh"
brew "bun"
brew "jq"
brew "htop"

# Rust build helpers
brew "sccache"

# Cargo tools
brew "cargo-nextest"
brew "bacon"
brew "cargo-watch"
brew "cargo-edit"
brew "cargo-audit"
brew "cargo-outdated"
brew "cargo-expand"
`;

export const CARGO_CONFIG_PATH = `${HOME}/.cargo/config.toml`;
export const CARGO_CONFIG = `[build]
rustc-wrapper = "${BREW_PREFIX}/bin/sccache"
`;

export const ZSHRC_PATH = `${HOME}/.zshrc`;
export const ZSHRC_BLOCK = `# >>> drop >>>
eval "$(${BREW} shellenv)"
. "$HOME/.cargo/env"
eval "$(zoxide init zsh)"
# <<< drop <<<
`;

export const GIT_CONFIG: Record<string, string> = {
  "user.name": "sleb",
  "user.email": "scott.g.lebaron@gmail.com",
  "init.defaultBranch": "main",
};

export const NVIM_REPO = "https://github.com/sleb/kickstart";
export const NVIM_DIR = `${HOME}/.config/nvim`;
