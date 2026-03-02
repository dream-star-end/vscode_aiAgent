# VS Code Agents Instructions

This file provides instructions for AI coding agents working with the VS Code codebase.

For detailed project overview, architecture, coding guidelines, and validation steps, see the [Copilot Instructions](.github/copilot-instructions.md).

## Cursor Cloud specific instructions

### Quick reference

- **Node.js**: v22.22.0 (specified in `.nvmrc`)
- **Package manager**: npm (uses `package-lock.json`)
- **Build system**: Gulp 4 + esbuild transpilation
- **Compile**: `npm run compile` (full build) or `npm run watch` (incremental dev watch)
- **Lint**: `npm run eslint` (ESLint), `npm run stylelint` (Stylelint), `npm run hygiene` (full hygiene)
- **Unit tests**: `npm run test-node` (Node unit tests), `./scripts/test.sh` (Electron unit tests)
- **Integration tests**: `./scripts/test-integration.sh`
- **Launch desktop**: `VSCODE_SKIP_PRELAUNCH=1 ./scripts/code.sh --disable-gpu` (use `--disable-dev-shm-usage` in Docker)
- **Launch web**: `./scripts/code-web.sh`
- **Layering check**: `npm run valid-layers-check`

### Non-obvious caveats

- The `postinstall` script cascades `npm install` into ~60 subdirectories (build, remote, extensions, test infra). A root `npm install` takes ~2 minutes.
- `npm run electron` downloads the correct Electron binary to `.build/electron/`. This is idempotent and fast when already cached.
- `npm run compile` does a full Gulp compile including TypeScript type-checking and extension compilation (~2.5 min). For development iteration, prefer `npm run watch` which runs 3 parallel watchers.
- `scripts/code.sh` runs `build/lib/preLaunch.ts` by default, which ensures node_modules, Electron, and compilation. Set `VSCODE_SKIP_PRELAUNCH=1` to skip this if you've already compiled.
- In Docker/container environments, use `--disable-dev-shm-usage` flag when launching the Electron app. The dbus connection errors in containers are benign.
- The `DISPLAY` environment variable must be set (e.g., `:1`) and an X server (like Xvfb) must be running to launch the desktop Electron app in headless environments.
- Native modules (`node-pty`, `@vscode/sqlite3`, `kerberos`) require `libkrb5-dev`, `libx11-dev`, `libxkbfile-dev`, `libsecret-1-dev`, and build tools (`gcc`, `g++`, `make`, `python3`) for compilation.
