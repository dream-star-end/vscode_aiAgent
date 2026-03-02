# AI Studio (VS Code Fork) Agents Instructions

This file provides instructions for AI coding agents working with the AI Studio codebase (VS Code OSS fork).

For VS Code base project overview, architecture, coding guidelines, and validation steps, see the [Copilot Instructions](.github/copilot-instructions.md).

## AI Studio 开发规则

### 任务管理

- **任务清单**: 所有开发任务定义在 [`docs/tasks.md`](docs/tasks.md) 中，严格按照任务清单推进开发。
- **状态更新**: 每完成一个任务，**立即**更新 `docs/tasks.md` 中对应任务的状态（`[ ]` → `[~]` → `[x]`）。
- **依赖顺序**: 不得跳过任务依赖。开始一个任务前，确认其所有依赖任务已标记为 `[x]`。
- **阻塞处理**: 如果任务被阻塞，标记为 `[!]` 并在旁边注明阻塞原因，然后继续其他不被阻塞的任务。
- **进度统计**: 每次提交时更新 `docs/tasks.md` 底部的进度统计表。

### 核心文档

| 文档 | 路径 | 用途 |
|------|------|------|
| 产品需求规格 | `docs/spec/ai-ide-spec.md` | 功能需求和验收标准的最终来源 |
| 论文调研 | `docs/spec/research-insights.md` | 设计决策的学术依据 |
| 系统设计 | `docs/design/system-design.md` | 架构、接口和数据流的实现参考 |
| 任务清单 | `docs/tasks.md` | 开发进度跟踪，每次提交必须同步更新 |

### VS Code 分层规则

新增模块必须遵循 VS Code 的 `base → platform → editor → workbench` 分层：
- `platform` 层：`IAIProviderService`、`IPermissionService`（不依赖 workbench 层类型）
- `workbench/services` 层：`IContextManagerService`、`ITaskPersistenceService`、`IHooksService`、`IModelRouterService`
- `workbench/contrib` 层：`aiAgent/`、`aiCompletion/`、`aiDashboard/`

使用 `npm run valid-layers-check` 验证分层合规。

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
