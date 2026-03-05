# VS Code Agents Instructions

This file provides instructions for AI coding agents working with the VS Code codebase.

For detailed project overview, architecture, coding guidelines, and validation steps, see the [Copilot Instructions](.github/copilot-instructions.md).

## Cursor Cloud specific instructions

### System dependencies

The following system packages are required for native module compilation and must be present before `npm install`:

`libkrb5-dev`, `libx11-dev`, `libxkbfile-dev`, `pkg-config`, `libsecret-1-dev`

For running the Electron app headlessly: `xvfb`, `libgtk-3-0`, `libgbm1`, `libnss3`, `libasound2t64`, `scrot` (for screenshots).

### Key dev commands

| Task | Command |
|---|---|
| Install deps (root) | `npm install` (postinstall handles native modules + Electron headers) |
| Install deps (build/) | `cd build && npm install` |
| Download Electron | `npm run electron` |
| Download remote node | `npm run gulp node` |
| Compile all | `npm run compile` |
| Watch (incremental) | `npm run watch` |
| Download built-in extensions | `npm run download-builtin-extensions` |
| Lint (ESLint) | `npm run eslint` |
| Lint (Stylelint) | `npm run stylelint` |
| Hygiene check | `npm run hygiene` |
| Unit tests (Node) | `npm run test-node` |
| Unit tests (Electron) | `scripts/test.sh [--grep pattern]` |
| Integration tests | `scripts/test-integration.sh` |
| Launch desktop (Electron) | `scripts/code.sh` |
| Launch web (code-server) | `scripts/code-server.sh` |
| Launch web (test-web) | `scripts/code-web.sh` |
| Layering check | `npm run valid-layers-check` |

### Running Electron headlessly

Start a virtual framebuffer before launching the Electron app:

```
Xvfb :99 -screen 0 1280x800x24 &
export DISPLAY=:99
```

Then launch with: `DISPLAY=:99 VSCODE_SKIP_PRELAUNCH=1 scripts/code.sh --disable-gpu --disable-dev-shm-usage --no-sandbox`

The `--disable-dev-shm-usage` flag is important inside containers to avoid `ERR_INSUFFICIENT_RESOURCES` from Chromium shared memory limits.

### Gotchas

- The `.npmrc` configures npm to build native modules against Electron headers (not Node.js). This is why `npm install` requires the Electron-specific `disturl` and `target` settings.
- `npm run compile` takes ~2.5 minutes for a full build. Use `npm run watch` for incremental compilation during development.
- DBus errors in Electron logs (e.g., `Failed to connect to the bus`) are harmless in headless/container environments.
- The `hygiene` task may fail on pre-existing issues in the repo (e.g., missing copyright headers); these are not caused by your changes.
