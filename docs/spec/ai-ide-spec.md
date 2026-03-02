# AI IDE 产品需求规格说明书 (Spec)

> 基于 VS Code OSS (v1.110.0) fork，构建开源 AI 原生 IDE
>
> 版本: v1.0.0-draft | 日期: 2026-03-02

---

## 1. 项目概述

基于 VS Code OSS (MIT) fork，构建开源、支持多模型、可私有部署的 AI 原生 IDE。对标 Cursor / Windsurf，核心差异：**完全开源、多模型自由切换、MCP 工具生态、代码知识引擎复用 DeepWiki-Open + CodeWiki**。

### 1.1 可复用的已有能力

| 已有框架 | 位置 | 复用方式 |
|---------|------|---------|
| Chat UI 框架 | `src/vs/workbench/contrib/chat/` | 注册自有 Participant |
| Inline Chat | `src/vs/workbench/contrib/inlineChat/` | 适配自有 AI Provider |
| Inline Completions | `src/vs/editor/contrib/inlineCompletions/` | 复用 Ghost Text 渲染 |
| Language Model API | `ILanguageModelsService` | 扩展，注册自有 Provider |
| Tool 系统 | `ILanguageModelToolsService` | 复用，添加工具 |
| MCP 集成 | `src/vs/workbench/contrib/mcp/` | 直接复用 |
| 子 Agent | `RunSubagentTool` | 复用并增强 |
| Skills 系统 | `SKILL.md` + `promptSyntax/` | 复用并增强 |
| 文件监视 / Ripgrep / 符号系统 / Tree-sitter | 各 `platform/` 及 `editor/` | 直接复用 |

---

## 2. 功能模块规格

### 2.1 品牌定制

修改 `product.json`：`nameShort`、`applicationName`、`dataFolderName`、`urlProtocol`、`defaultChatAgent` 等。替换 `resources/` 中的图标。保持 VS Code Extension API 100% 兼容。

### 2.2 AI Provider 抽象层

统一多模型服务抽象，所有 AI 功能通过此层访问 LLM。

**P0 Provider**：OpenAI (GPT-4o/o1/o3)、Anthropic (Claude)、DeepSeek (Coder-V2/V3)
**P1 Provider**：本地 Ollama、自定义 OpenAI 兼容端点
**P2 Provider**：Google Gemini

**核心接口**：

| 接口 | 功能 |
|------|------|
| `chatCompletion()` | 流式聊天补全，支持 Tool-Use |
| `codeCompletion()` | 代码补全 (FIM 协议) |
| `generateEmbedding()` | 文本嵌入 |
| `listModels()` | 可用模型列表 |

**关键需求**：多 Provider 配置 + 不同场景指定不同模型 + API Key 加密存储 + 自定义端点 + 热切换无需重启 + fallback 模型

### 2.3 智能代码补全

复用 `InlineCompletionsProvider` + Ghost Text 渲染。注册自有 Provider 对接 AI Provider 层。

**关键需求**：FIM 协议 | 多行补全 | 防抖触发(350ms) | LRU 缓存(100条) | 前缀复用 | 预测性预取 | 流式渲染 | 即时取消 | Tab/Ctrl+→ 接受 | 按语言启停

### 2.4 AI Chat 面板

复用 `IChatService` / Chat UI 框架，注册内置 Chat Participant。

**关键需求**：多轮对话 | 上下文引用 (`@file` `@folder` `@symbol` `@codebase` `@terminal` `@git` `@docs` `@web`) | 代码块一键应用 | Diff 预览(逐块接受/拒绝) | 模型切换 | 对话历史 | Markdown 渲染

> **后续扩展**：图片输入（多模态）、Mermaid 图渲染等，复用已有 `mermaid-chat-features` 扩展即可，不在核心 Spec 中展开。

### 2.5 Inline Chat

复用 `src/vs/workbench/contrib/inlineChat/` 框架，适配自有 AI Provider。

**关键需求**：选中代码对话(`Ctrl+K`) | 编辑器内 Diff 展示 | Tab 接受 / Esc 拒绝 | 预设快捷操作(解释/重构/修复/生成测试/加文档) | 连续对话

### 2.6 AI Agent 系统 ⭐

**本产品最核心的差异化能力。** 自主执行多步骤开发任务。

**关键需求**：

| 需求 | 说明 |
|------|------|
| 自然语言任务 → 自动规划 → 自主执行 | Tool-Use 循环 (Think → Tool → Observe) |
| 多文件编辑 + Diff 审查 | 逐文件/逐块接受拒绝，一键全部接受/拒绝 |
| 检查点回滚 | 每步创建检查点，支持回滚到任意点 |
| 人工确认 + 中途打断 + 追加指令 | 危险操作需确认，用户可随时中断或追加 |
| 实时进度 + 步骤超时 | 每步显示进度，单步 >30s 提示用户 |
| 并行工具调用 | 无依赖的工具并行执行 |
| 迭代上限 | 可配置，默认 25 |

### 2.7 上下文管理系统 ⭐

Agent 质量的命脉。当前 VS Code 无上下文裁剪、无摘要、无预算管理、工具定义全量注入。

#### 按比例预算分配

上下文预算按模型 `effectiveInputBudget = maxInputTokens - maxOutputTokens` 的**百分比**动态分配：

| 区域 | 占比 | 可压缩 |
|------|------|--------|
| 固定区：系统提示词 | 3% | 否 |
| 固定区：核心工具定义（常驻） | 3% | 否 |
| 固定区：项目摘要 | 2% | 否 |
| 固定区：Skills 指令 | 2% | 按相关度裁剪 |
| 动态区 P0：用户消息 + 附件 + 检索结果 | 20% | 按相关度裁剪 |
| 动态区 P1：活跃上下文（工具结果、子 Agent 摘要） | 30% | 可压缩 |
| 动态区 P2：历史对话 | 20% | 旧的被摘要化 |
| 动态区 P3：补充上下文（README、Git Diff） | 5% | 可丢弃 |
| 弹性区：溢出缓冲 | 15% | 各区溢出时使用 |

#### 小上下文自适应

- `< 16K`：工具定义压缩为仅 name+单句描述、Skills 最多 2 个、历史仅 3 轮
- `< 8K`：仅 3 个核心工具、历史仅 1 轮、项目摘要单句

#### 分层压缩（5 级）

| 等级 | 触发 | 策略 |
|------|------|------|
| L1 | >70% | 丢弃 P3 补充上下文 |
| L2 | >80% | 历史替换为单句摘要 |
| L3 | >85% | 工具结果替换为统计摘要 |
| L4 | >90% | 代码骨架化(仅签名)；移除非核心工具定义 |
| L5 | >95% | 仅当前轮次；仅核心工具 |

**其他关键需求**：上下文使用量 UI 指示 | 子 Agent 结果仅摘要注入 | 工具定义动态加载(见 2.9) | Skills 按相关度注入(见 2.10)

### 2.8 子 Agent 架构 ⭐

主 Agent 委派子任务给专业子 Agent，**子 Agent 使用独立上下文，主 Agent 仅获取精炼摘要**。

#### 与现有实现的差异

| 维度 | 现状 (RunSubagentTool) | 目标 |
|------|----------------------|------|
| 上下文 | 中间过程流入主 UI | 独立窗口，中间过程对主 Agent 不可见 |
| 结果 | markdown 全文返回 | 结构化精炼摘要（上限 2000 Token） |
| 模型 | 同主 Agent | 可用更快更便宜的模型 |
| 专业化 | 通用 | 内置专业子 Agent |
| 递归 | 禁止 | 支持（深度上限默认 2） |

#### 内置专业子 Agent

| 子 Agent | 职责 | 推荐模型 | 工具集 |
|----------|------|---------|--------|
| CodeSearch | 找到相关代码 | 快速模型 | ripgrep, symbols, codebaseIndex |
| CodeAnalyzer | 分析代码逻辑和依赖 | 强模型 | readFile, symbols, callHierarchy |
| CodeWriter | 按规格编写代码 | 强模型 | editFile, createFile |
| TestRunner | 运行测试并分析 | 快速模型 | terminal, readFile |
| WebResearcher | 查文档和方案 | 快速模型 | fetchPage, webSearch |
| Planner | 任务分解 | 强模型 | 无 |

**其他关键需求**：并行执行 | 产出物(文件修改)直通不占摘要预算 | 元数据上报(token/耗时)

### 2.9 工具体系

**核心原则：不自己逐一开发工具。** MCP 生态为主 + VS Code 内置复用 + 仅自研差异化工具。

#### 工具索引与按需加载

**问题**：50-100+ 工具全量注入上下文可能消耗 10K-50K Token。

**解决**：分两层——

- **核心工具（常驻上下文，~8 个，~2-3K Token）**：editFile, readFile, search, listDirectory, terminal, runSubagent, codebaseSearch, **toolSearch**
- **索引工具（按需加载）**：其他所有工具构建索引。Agent 通过 `toolSearch` 工具按需检索加载；或系统根据用户意图自动推荐。

`toolSearch` 输入：`query`(描述需要什么能力) + 可选 `category` 过滤。索引方式：关键词匹配（默认），可扩展为语义匹配。

#### MCP 推荐预配置

filesystem / git / fetch / memory (官方) | mcp-deepwiki / codewiki-mcp | Code Pathfinder / Playwright (社区)

#### 自研工具（仅 4 个）

| 工具 | 自研原因 |
|------|---------|
| smartApplyDiff | LLM 输出行号不精确，需 fuzzy match |
| codebaseSearch | 深度集成本地知识引擎 |
| projectAnalyzer | 集成 CodeWiki 分解能力 |
| toolSearch | 工具索引检索 |

**其他需求**：MCP 工具自动注册 | 危险工具确认 | 工具白名单 | MCP Server 管理 UI

### 2.10 Skills 能力

复用 VS Code 已有 Skills 系统（`SKILL.md` + `<skills>` 注入），增强相关度匹配。

**Skills vs Tools**：Skills 是领域知识和操作规范（Markdown 文档，LLM 内化为行为准则）；Tools 是可调用的函数。

**关键需求**：自动发现 `.github/skills/` 等目录 | 个人 Skills (`~/.agents/skills/`) | **按相关度注入（不是全部加载）** | Skill 索引 | 手动 `/name` 触发 | `disable-model-invocation` 标记 | 纳入上下文预算(固定区 2%) | Skill+Tool 联动

> **后续扩展**：Skill 创建向导、Skill 市场等，属于锦上添花，后续迭代。

### 2.11 本地代码知识引擎

让 AI 理解整个代码库。**策略：复用开源引擎 + 自研增量编排层。**

#### 复用的开源组件

| 来源 | 复用内容 |
|------|---------|
| **DeepWiki-Open** (MIT, 13.3K+ stars) | `rag_engine.py` (FAISS 向量检索), `embedding_service.py` (多 Provider 嵌入), `data_pipeline.py` (智能分块) |
| **CodeWiki** (FSoft-AI4Code, 7 语言) | `decomposition/` (AST → 依赖图 → 层级分解), `agent/` (多 Agent 递归分析) |

#### 自研增量编排层（两个开源项目都没有）

| 模块 | 功能 |
|------|------|
| 文件变更收集器 | 复用 VS Code FileWatcher，500ms 防抖+批量合并 |
| 文件指纹缓存 | SHA256 比对，跳过未变文件 |
| 增量分派器 | 单文件维度增量解析和嵌入更新 |
| 缓存失效管理 | 级联标记 stale，懒更新 |
| 查询路由 | 结构查询→CodeWiki，语义查询→DeepWiki |
| IPC 通信 | JSON-RPC over stdio (Python sidecar) |

**关键需求**：后台渐进式首次索引(优先当前文件) | 增量更新(<2s) | 级联失效+懒更新 | `@codebase` 语义搜索 | `@docs` 文档检索 | 结构查询("谁调用了X") | 项目摘要 | 不阻塞 UI | 离线可用(Ollama) | 代码不外传 | 大项目降级

**集成两阶段**：第一阶段通过 MCP Server 接入(1-2 周)；第二阶段 fork 定制为 sidecar + 增量层(3-4 周)。

### 2.12 终端 AI 增强 / 设置与配置

> 均属于锦上添花功能，框架复用 VS Code 已有能力即可实现，不在此展开设计。

**终端增强**：自然语言转命令 | 错误分析 | 命令解释 | Agent 终端集成。复用 VS Code Terminal API。

**设置配置**：Provider/模型配置 | 补全/Agent/子Agent 参数 | MCP Server 管理 | 知识引擎配置 | Skills 管理 | 隐私设置。初期用 `settings.json`，后续按需做可视化 UI。

---

## 3. 性能设计

### 3.1 性能预算总表

| 场景 | 延迟预算 |
|------|---------|
| 代码补全（冷启动） | < 800ms（防抖 350 + 组装 50 + API ~400） |
| 代码补全（缓存命中） | < 50ms |
| Chat 首 Token (TTFT) | < 1.5s |
| Chat 流式渲染 | ≥ 30fps |
| Agent 单步 (Think→Tool→Observe) | < 3s |
| 子 Agent（典型搜索类） | < 30s |
| `@codebase` 查询 | < 500ms |
| 增量索引（单文件保存） | < 2s |
| Diff 审查渲染（10 文件） | < 500ms |
| IDE 启动时间 | 与原版 VS Code 持平（AI 全部延迟初始化） |

### 3.2 性能红线

| 红线 | 说明 |
|------|------|
| **主线程不执行 AI 操作** | LLM 调用、Token 计数、上下文组装全部在 Worker/独立进程 |
| **用户输入不被阻塞** | 按键延迟 < 16ms，任何后台操作期间 |
| **IDE 启动不变慢** | AI 功能全部延迟初始化 |
| **内存不失控** | 所有缓存有上限，超出降级而非 OOM；中型项目 ≤1.5GB，大型 ≤2.5GB |
| **AI 操作可取消** | 所有 AI 操作支持 CancellationToken |

### 3.3 关键优化策略

**代码补全**：即时取消旧请求 | LRU 缓存(100条) | 前缀复用 | 预测性预取 | 流式渲染 | 上下文在 Worker 线程组装 | 本地模型预热

**Chat / Agent**：流式输出 | Markdown 增量渲染(30fps 节流) | 代码块延迟高亮 | 工具结果懒渲染 | HTTP/2 连接复用 | 并行工具调用 | 检查点增量快照(仅 diff) | Diff 虚拟化滚动 | 超时熔断(30s)

**上下文管理**：Token 计数缓存+增量计数 | 本地 Tiktoken WASM | 固定内容预计算 | 摘要异步生成+缓存 | L1-L2 压缩快速路径(<5ms)

**子 Agent**：并行执行 | 快速模型优先 | 轻量上下文(不继承历史) | 提前终止 | 摘要本地规则优先(必要时才用 LLM) | Token 硬上限

**知识引擎**：独立进程 | 优先级队列(当前文件优先) | 防抖批量 | 指纹跳过 | 增量 FAISS add/remove | 增量 AST (Tree-sitter) | 嵌入批处理+磁盘缓存 | 渐进式首次索引 | 大文件跳过 | .gitignore 遵循

**工具调用**：MCP Server 预启动+保活 | 结果缓存(30s) | 大结果截断+摘要 | 内置工具走进程内快速路径

**网络**：HTTP/2 复用 | 连接预热 | 指数退避重试(3 次) | 断线优雅降级 | 本地模型零网络

---

## 4. 非功能性需求

| 类别 | 需求 |
|------|------|
| 安全 | API Key 加密存储(OS 密钥链) · 代码不外传(索引 100% 本地) · Agent 沙箱(危险操作确认) · MCP Server 权限控制 |
| 兼容性 | VS Code 扩展 100% 兼容 · Windows / macOS / Linux |
| 可用性 | 离线模式(Ollama) · AI 不可用时不影响编辑功能 |
| 可维护性 | 遵循 VS Code 分层架构 · 遵循编码规范 |
| 可观测性 | AI 操作日志(模型/Token/延迟) · 性能度量埋点 · 用量统计(Token/费用) |

---

## 5. 技术决策

### 复用 vs 自研总览

| 模块 | 决策 | 来源 |
|------|------|------|
| Chat / Inline Chat / Ghost Text / LM API / Tool 系统 / MCP / Skills | **复用** | VS Code 已有框架 |
| 文件监视 / Ripgrep / 符号系统 / Tree-sitter | **复用** | VS Code 平台层 |
| AST 依赖图 + 层级分解 | **复用** | CodeWiki |
| RAG + FAISS + 嵌入 | **复用** | DeepWiki-Open |
| 文件/Git/Web 等工具 | **复用** | MCP 开源 Server |
| **AI Provider 抽象层** | **自研** | — |
| **上下文管理器(按比例预算+压缩)** | **自研** | — |
| **工具索引与按需加载** | **自研** | — |
| **子 Agent 增强(独立上下文+摘要)** | **自研** | — |
| **知识引擎增量编排层** | **自研** | — |
| **Skill 相关度匹配** | **自研** | — |
| **品牌定制** | **修改** | product.json + 资源 |

---

## 6. 实施阶段

```
Week  1-2   Phase 0: 品牌定制 + AI Provider 抽象层 + MCP 预配置
Week  3-6   Phase 1: 代码补全 + Chat + Inline Chat + 上下文管理器 + 工具索引
Week  7-10  Phase 2: Agent 系统 + 子 Agent 增强 + Skills 集成 + Diff 审查
Week 11-14  Phase 3: 代码知识引擎 (MCP 接入 → sidecar + 增量层)
Week 15-20  Phase 4: 性能优化 + 测试 + 构建打包
```

---

## 附录: 术语表

| 术语 | 定义 |
|------|------|
| FIM | Fill-In-Middle，代码补全协议 |
| MCP | Model Context Protocol，LLM 与工具/数据源的标准协议 |
| RAG | Retrieval-Augmented Generation，检索增强生成 |
| FAISS | Facebook AI Similarity Search，向量相似度搜索 |
| Sidecar | 与主进程并行运行的辅助进程 |
| Tool-Use Loop | Agent 的 Think→Tool Call→Observe 循环 |
| Skill | Markdown 形式的领域知识/操作规范，Agent 内化为行为准则 |
| Tool Index | 非核心工具的索引，Agent 按需检索加载 |
| TTFT | Time To First Token，首 Token 延迟 |
| effectiveInputBudget | maxInputTokens - maxOutputTokens，可用输入预算 |

---

> **文档状态**: 待确认。确认后将基于此 Spec 编写系统设计文档。
