# VS Code Agents Instructions

This file provides instructions for AI coding agents working with the VS Code codebase.

For detailed project overview, architecture, coding guidelines, and validation steps, see the [Copilot Instructions](.github/copilot-instructions.md).

## Cursor Cloud specific instructions

### Services overview

This is the VS Code (Code - OSS) repository. The main product is the Electron-based desktop editor, but it also includes a web server variant and ~105 built-in extensions. The core dev loop is: install deps, compile TypeScript, run the Electron app.

### Running VS Code (dev build)

1. **Compile**: `npm run compile` (or use `npm run watch` for incremental dev). The `out/` directory must exist before tests or the app can run.
2. **Launch**: `bash scripts/code.sh` — this runs `preLaunch.ts` (which calls `npm run electron` + compile if needed) then starts the Electron app. In Docker/CI, add `--no-sandbox`. In headless Linux, start `Xvfb :99 -screen 0 1920x1080x24 -ac` first and export `DISPLAY=:99`. Set `VSCODE_SKIP_PRELAUNCH=1` if you've already compiled and downloaded Electron to skip the pre-launch step.
3. **Web variant**: `bash scripts/code-web.sh` launches a browser-based version on localhost.

### Lint / Test / Build commands

Standard commands are in `package.json` scripts. Key ones:
- **Lint**: `npm run eslint`, `npm run hygiene`, `npm run valid-layers-check`
- **Unit tests (Node)**: `npm run test-node` — requires compiled `out/` directory
- **Unit tests (Electron)**: `scripts/test.sh` (add `--grep <pattern>` to filter)
- **Integration tests**: `scripts/test-integration.sh`
- **Compile**: `npm run compile` (one-shot) or `npm run watch` (incremental)
- **TypeScript layer checks**: `npm run valid-layers-check`

### Gotchas

- The `out/` directory is **not** committed. You must run `npm run compile` (or `npm run watch`) before tests or launching the app. Without it, `test-node` appears to pass instantly with zero tests.
- `npm install` triggers `preinstall.ts` (validates Node version, installs native headers) and `postinstall.ts` (runs `npm install` in ~40+ subdirectories). This can take 2+ minutes. It is cached and subsequent runs are near-instant if nothing changed.
- Native modules are built against Electron headers (configured in root `.npmrc`), while `remote/` modules target Node.js headers. Do not mix these.
- The Docker environment produces harmless dbus errors on startup; these can be ignored.
- `npm run electron` downloads the Electron binary to `.build/electron/`. This is also cached.
