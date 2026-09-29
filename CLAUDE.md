# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

The README is the source of truth for what the droplet setup installs and how the script is designed. Read it before changing behavior, and update it when the plan changes.

## Commands

- Run locally (safe on macOS only with `--dry-run`): `bun run index.ts --dry-run`
- Build the release binary: `bun build --compile --target=bun-linux-x64 index.ts --outfile drop-linux-x64`
- Typecheck: `bunx tsc --noEmit`
- Lint and format check: `bun run check`; apply fixes (formatting, import sorting, safe lint fixes): `bun run fix`
- Test: `bun test`, single file `bun test path/to/file.test.ts`, single test `bun test -t "name pattern"`

## Runtime constraints

- Development happens on macOS, but the script only really runs on an Ubuntu x86_64 droplet. Anything that executes system commands must go through the `--dry-run` path so it can be exercised locally.
- The script runs as `root` under cloud-init at first boot, with no TTY and no user to answer prompts. Every command must be non-interactive (`DEBIAN_FRONTEND=noninteractive`, `NONINTERACTIVE=1` for the Homebrew installer, `-y` flags).
- Homebrew refuses to run as root. Run the `scott` phase with `sudo -u scott -H` and a login-style environment, not by switching the whole process's user.
- The compiled binary is self-contained. Don't rely on files next to it at runtime; embed config (Brewfile, zram config, etc.) in the source.

## Bun

Use Bun, not Node.js: `bun <file>`, `bun test`, `bun install`, `bunx`. Bun loads `.env` automatically, so don't use dotenv. Use `Bun.$` for shell commands (not execa) and `Bun.file`/`Bun.write` over `node:fs` read/write. API docs are in `node_modules/bun-types/docs/**.mdx`.
