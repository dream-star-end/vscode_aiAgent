# AI IDE 产品需求规格说明书 (Spec)

> 基于 VS Code OSS (v1.110.0) fork 开发的 AI 原生集成开发环境
>
> 版本: v0.1.0-draft
>
> 日期: 2026-03-02

---

## 目录

- [1. 项目概述](#1-项目概述)
- [2. 产品定位与目标](#2-产品定位与目标)
- [3. 功能模块规格](#3-功能模块规格)
  - [3.1 品牌定制](#31-品牌定制)
  - [3.2 AI Provider 抽象层](#32-ai-provider-抽象层)
  - [3.3 智能代码补全](#33-智能代码补全)
  - [3.4 AI Chat 面板](#34-ai-chat-面板)
  - [3.5 Inline Chat（编辑器内对话）](#35-inline-chat编辑器内对话)
  - [3.6 AI Agent 系统](#36-ai-agent-系统)
  - [3.7 上下文管理系统](#37-上下文管理系统)
  - [3.8 子 Agent 架构](#38-子-agent-架构)
  - [3.9 本地代码知识引擎](#39-本地代码知识引擎)
  - [3.10 工具体系](#310-工具体系)
  - [3.11 终端 AI 增强](#311-终端-ai-增强)
  - [3.12 设置与配置](#312-设置与配置)
- [4. 非功能性需求](#4-非功能性需求)
- [5. 技术约束与决策](#5-技术约束与决策)
- [6. 竞品对标](#6-竞品对标)
- [7. 实施阶段规划](#7-实施阶段规划)

---

## 1. 项目概述

### 1.1 背景

当前 AI 编程工具市场被 Cursor、Windsurf 等闭源产品主导。本项目基于 VS Code OSS (MIT 协议) 进行 fork 开发，目标是构建一个开源的、可自由配置多种 AI 模型的智能 IDE。

### 1.2 基础代码库

| 属性 | 值 |
|------|-----|
| 上游仓库 | microsoft/vscode |
| 基础版本 | v1.110.0 |
| 协议 | MIT |
| 架构 | Electron + TypeScript，分层架构 (base → platform → editor → workbench) |
| 扩展体系 | VS Code Extension API 完全兼容 |

### 1.3 可复用的已有能力

VS Code 已经提供了以下与 AI 相关的成熟框架，本项目将直接复用而非重建：

| 已有框架 | 位置 | 复用方式 |
|---------|------|---------|
| Chat UI 框架 | `src/vs/workbench/contrib/chat/` | 直接复用，注册自有 Participant |
| Inline Chat 框架 | `src/vs/workbench/contrib/inlineChat/` | 直接复用，适配自有 AI Provider |
| Inline Completions | `src/vs/editor/contrib/inlineCompletions/` | 直接复用 Ghost Text 渲染系统 |
| Language Model API | `ILanguageModelsService` | 扩展，注册自有 Provider |
| Tool 系统 | `ILanguageModelToolsService` | 直接复用，添加工具 |
| MCP 集成 | `src/vs/workbench/contrib/mcp/` | 直接复用 |
| 子 Agent 基础 | `RunSubagentTool` | 复用并增强 |
| 文件监视 | `src/vs/platform/files/node/watcher/` | 直接复用 |
| 文本搜索 | Ripgrep 集成 | 直接复用 |
| 符号系统 | `ILanguageFeaturesService` | 直接复用 |
| Tree-sitter | `src/vs/editor/common/services/treeSitter/` | 直接复用（已支持增量解析） |

---

## 2. 产品定位与目标

### 2.1 核心定位

开源、可私有部署、支持多模型的 AI 原生 IDE。

### 2.2 差异化目标

| 目标 | 说明 |
|------|------|
| 完全开源 | 核心功能全部开源，不依赖任何闭源 AI 服务 |
| 多模型自由切换 | 支持 OpenAI / Anthropic / DeepSeek / 本地 Ollama 等 |
| 自定义端点 | 兼容 OpenAI API 格式的任意私有部署 |
| MCP 生态原生支持 | 工具能力通过 MCP 开源生态扩展，而非封闭开发 |
| 代码知识理解 | 集成 DeepWiki-Open + CodeWiki 的本地代码分析能力 |
| 上下文管理精细化 | 子 Agent 独立上下文、分层预算、自动压缩 |

### 2.3 目标用户

- 追求数据隐私、不愿将代码发送到第三方服务的开发者和企业
- 希望使用自有 AI 模型（私有部署或本地模型）的团队
- 希望在开源基础上进行二次定制的 AI 工具开发者

---

## 3. 功能模块规格

### 3.1 品牌定制

**目标**：将 VS Code OSS 重新品牌化为独立的 AI IDE 产品。

**范围**：

| 项目 | 当前值 | 目标值 | 涉及文件 |
|------|--------|--------|---------|
| 产品短名 | Code - OSS | AI Studio (暂定) | `product.json` |
| 产品全名 | Code - OSS | AI Studio - Intelligent Code Editor | `product.json` |
| 应用标识 | code-oss | ai-studio | `product.json` |
| 数据目录 | .vscode-oss | .ai-studio | `product.json` |
| URL 协议 | code-oss | ai-studio | `product.json` |
| 应用图标 | VS Code 图标 | 自定义图标 | `resources/` |
| 默认 AI 配置 | GitHub Copilot | 自有 AI 配置 | `product.json` → `defaultChatAgent` |
| 包标识 (macOS) | com.visualstudio.code.oss | 自定义 | `product.json` |
| 包标识 (Windows) | 现有 AppId | 新 AppId | `product.json` |
| 包名 (npm) | code-oss-dev | ai-studio | `package.json` |

**不变**：

- VS Code Extension API 完全兼容性
- 所有已有扩展可正常安装使用
- 快捷键和 UI 布局保持 VS Code 习惯

---

### 3.2 AI Provider 抽象层

**目标**：统一的多模型 AI 服务抽象，所有 AI 功能都通过此层访问 LLM。

**支持的 Provider**：

| Provider | 模型示例 | 用途 | 优先级 |
|----------|---------|------|--------|
| OpenAI | GPT-4o, GPT-4-turbo, o1, o3 | Chat、Agent、补全 | P0 |
| Anthropic | Claude 3.5 Sonnet, Claude 4 Opus | Chat、Agent、长上下文 | P0 |
| DeepSeek | DeepSeek-Coder-V2, DeepSeek-V3 | 代码补全、Chat | P0 |
| 本地 Ollama | Qwen2.5-Coder, CodeLlama, etc. | 离线补全、离线 Chat | P1 |
| 自定义 OpenAI 兼容 | 任意兼容端点 | 私有部署场景 | P1 |
| Google | Gemini 2.0 Pro/Flash | Chat、多模态 | P2 |

**核心接口**：

| 接口 | 功能 | 说明 |
|------|------|------|
| `chatCompletion()` | 流式聊天补全 | 支持 Tool-Use、多轮对话、流式输出 |
| `codeCompletion()` | 代码补全 (FIM) | Fill-In-Middle 协议，用于 Ghost Text |
| `generateEmbedding()` | 文本嵌入生成 | 用于代码语义搜索 |
| `listModels()` | 列出可用模型 | 用于模型选择 UI |

**关键需求**：

- FR-AI-01: 用户可在设置中配置多个 Provider，并为不同场景（Chat、补全、嵌入）指定不同模型
- FR-AI-02: 支持 API Key 加密存储（使用 OS 原生密钥链）
- FR-AI-03: 支持自定义 API 端点 URL（私有部署场景）
- FR-AI-04: 模型切换不需要重启 IDE
- FR-AI-05: 当一个 Provider 不可用时，支持配置 fallback 模型

---

### 3.3 智能代码补全

**目标**：在编辑器中实时提供 AI 驱动的代码补全建议（Ghost Text）。

**复用基础**：VS Code 已有的 `InlineCompletionsProvider` 体系和 Ghost Text 渲染系统。

**功能需求**：

| 编号 | 需求 | 说明 |
|------|------|------|
| FR-CC-01 | 实时代码补全 | 用户输入时自动触发，显示为 Ghost Text |
| FR-CC-02 | 多行补全 | 支持多行代码建议 |
| FR-CC-03 | FIM 协议 | 使用 Fill-In-Middle 格式发送光标前后代码 |
| FR-CC-04 | 上下文收集 | 当前文件内容 + 相关打开文件 + 导入文件的签名 |
| FR-CC-05 | 防抖触发 | 可配置的防抖延迟（默认 350ms） |
| FR-CC-06 | 结果缓存 | LRU 缓存最近的补全结果，光标回退时可复用 |
| FR-CC-07 | Tab 接受 | 按 Tab 键接受补全 |
| FR-CC-08 | 部分接受 | 按 Ctrl+→ 逐词接受 |
| FR-CC-09 | 状态指示 | 状态栏显示补全状态（加载中 / 已启用 / 已禁用） |
| FR-CC-10 | 按语言/项目启停 | 支持按编程语言或项目级别启停补全 |

---

### 3.4 AI Chat 面板

**目标**：侧边栏中的 AI 对话面板，支持多轮对话、上下文引用和代码应用。

**复用基础**：VS Code 已有的 `IChatService`、`IChatModel`、`IChatAgentService` 和 Chat UI 框架。

**功能需求**：

| 编号 | 需求 | 说明 |
|------|------|------|
| FR-CH-01 | 多轮对话 | 保持上下文的连续对话 |
| FR-CH-02 | `@file` 引用 | 在消息中引用指定文件作为上下文 |
| FR-CH-03 | `@folder` 引用 | 引用整个目录 |
| FR-CH-04 | `@symbol` 引用 | 引用特定函数/类/变量 |
| FR-CH-05 | `@codebase` 引用 | 触发代码知识引擎的语义检索 |
| FR-CH-06 | `@terminal` 引用 | 将终端输出作为上下文 |
| FR-CH-07 | `@git` 引用 | 引用 Git Diff 或提交历史 |
| FR-CH-08 | `@docs` 引用 | 触发 DeepWiki/CodeWiki 的文档检索 |
| FR-CH-09 | `@web` 引用 | 网络搜索结果作为上下文 |
| FR-CH-10 | 代码块渲染 | 回复中的代码块带语法高亮 |
| FR-CH-11 | 一键应用 | 代码块可一键插入/替换到编辑器 |
| FR-CH-12 | Diff 预览 | 修改建议以 Diff 形式展示，支持逐块接受/拒绝 |
| FR-CH-13 | 模型切换 | 对话中途可切换 AI 模型 |
| FR-CH-14 | 对话历史 | 保存和恢复历史会话 |
| FR-CH-15 | 图片输入 | 粘贴截图让 AI 分析（需多模态模型） |
| FR-CH-16 | Markdown 渲染 | 完整的 Markdown 渲染（表格、列表、Mermaid 图） |

---

### 3.5 Inline Chat（编辑器内对话）

**目标**：在编辑器内直接与 AI 交互，就地修改代码。

**复用基础**：VS Code 已有的 `src/vs/workbench/contrib/inlineChat/` 框架。

**功能需求**：

| 编号 | 需求 | 说明 |
|------|------|------|
| FR-IC-01 | 选中代码对话 | 选中代码后按快捷键弹出 Inline Chat |
| FR-IC-02 | Diff 展示 | 修改结果在编辑器内以 Diff 形式展示 |
| FR-IC-03 | 接受/拒绝 | Tab 接受，Esc 拒绝 |
| FR-IC-04 | 预设指令 | 快捷操作：解释代码、重构、修复 Bug、生成测试、添加文档 |
| FR-IC-05 | 连续对话 | 对结果不满意时可追加指令修改 |

**预设快捷操作**：

| 操作 | 快捷键（建议） | 说明 |
|------|---------------|------|
| 编辑器内对话 | `Ctrl+K` | 通用 Inline Chat |
| 解释代码 | `Ctrl+K E` | 解释选中代码 |
| 重构代码 | `Ctrl+K R` | 重构选中代码 |
| 修复问题 | `Ctrl+K F` | 修复选中代码的 Bug |
| 生成测试 | `Ctrl+K T` | 为选中代码生成单元测试 |
| 添加文档 | `Ctrl+K D` | 为函数/类生成文档注释 |

---

### 3.6 AI Agent 系统

**目标**：自主执行多步骤开发任务的 Agent，能理解需求、搜索代码、修改多文件、运行测试。类似 Cursor Composer / Windsurf Cascade。

**这是本产品最核心的差异化能力。**

**功能需求**：

| 编号 | 需求 | 说明 |
|------|------|------|
| FR-AG-01 | 自然语言任务 | 用户用自然语言描述开发需求 |
| FR-AG-02 | 任务规划 | Agent 自动将需求分解为可执行的步骤 |
| FR-AG-03 | 自主执行 | 通过 Tool-Use 循环自主执行步骤 |
| FR-AG-04 | 多文件编辑 | 一次任务可修改/创建/删除多个文件 |
| FR-AG-05 | Diff 审查 | 所有修改以 Diff 形式展示，用户可逐文件、逐块审查 |
| FR-AG-06 | 全部接受/拒绝 | 一键接受或拒绝所有修改 |
| FR-AG-07 | 检查点回滚 | 每次 Agent 操作创建检查点，支持回滚到任意检查点 |
| FR-AG-08 | 操作时间线 | 展示 Agent 的执行步骤时间线 |
| FR-AG-09 | 迭代最大次数 | 可配置的 Tool-Use 循环最大迭代次数（默认 25） |
| FR-AG-10 | 人工确认 | 危险操作（如删除文件、执行终端命令）需要用户确认 |
| FR-AG-11 | 中途打断 | 用户可以随时中断 Agent 执行 |
| FR-AG-12 | 追加指令 | Agent 执行过程中或完成后可追加指令 |

**Agent 执行流程**：

```
用户输入需求 → 任务规划 → [Think → Tool Call → Observe]循环
→ Diff 审查 → 用户确认 → 应用修改
```

---

### 3.7 上下文管理系统

**目标**：精细化管理 LLM 的上下文窗口，这是 Agent 高质量工作的关键。

**当前 VS Code 的不足**：没有上下文裁剪、没有自动摘要、历史原样传入、工具结果不压缩。

**功能需求**：

| 编号 | 需求 | 说明 |
|------|------|------|
| FR-CTX-01 | Token 预算分配 | 将上下文窗口分为固定区、动态区、保留区，按优先级分配 |
| FR-CTX-02 | 优先级排序 | 上下文内容按优先级排序：当前请求 > 活跃上下文 > 历史 > 补充 |
| FR-CTX-03 | 历史消息压缩 | 旧的对话历史自动替换为单句摘要 |
| FR-CTX-04 | 工具结果压缩 | 大量搜索结果等只保留 Top-K 最相关的，其余生成统计摘要 |
| FR-CTX-05 | 代码骨架化 | 上下文紧张时，代码只保留签名和文档，移除函数体 |
| FR-CTX-06 | 分层压缩 | 5 个压缩等级，从轻到重逐级应用 |
| FR-CTX-07 | 上下文使用量指示 | UI 上实时显示上下文使用百分比 |
| FR-CTX-08 | 子 Agent 结果仅摘要 | 子 Agent 的完整输出不进入主 Agent 上下文，只注入精炼摘要 |

**上下文预算分配模型**（以 128K Token 模型为例）：

| 区域 | 内容 | 预算 | 可压缩 |
|------|------|------|--------|
| 固定区 | 系统提示词 | ~2K | 否 |
| 固定区 | 工具定义 | ~3K | 可按需裁剪 |
| 固定区 | 项目上下文摘要 | ~1K | 否 |
| 动态区 P0 | 用户消息 + 附件 + 检索结果 | ~16K | 按相关度裁剪 |
| 动态区 P1 | 活跃上下文（打开文件、工具结果、子 Agent 摘要） | ~24K | 可压缩 |
| 动态区 P2 | 历史对话 | ~16K | 旧的被摘要化 |
| 动态区 P3 | 补充上下文（README、Git Diff） | ~4K | 可丢弃 |
| 保留区 | 输出 Token 预留 | ~16K | 否 |

**压缩等级**：

| 等级 | 策略 | 触发条件 |
|------|------|---------|
| L1 | 裁剪 P3 补充上下文 | 使用率 > 70% |
| L2 | 历史消息替换为单句摘要 | 使用率 > 80% |
| L3 | 工具结果替换为统计摘要 | 使用率 > 85% |
| L4 | 代码上下文骨架化（仅签名） | 使用率 > 90% |
| L5 | 仅保留当前轮次 | 使用率 > 95% |

---

### 3.8 子 Agent 架构

**目标**：支持主 Agent 将子任务委派给专业化的子 Agent，子 Agent 使用独立上下文，主 Agent 只获取精炼摘要。

**当前 VS Code `RunSubagentTool` 的不足**：

| 问题 | 现状 | 目标 |
|------|------|------|
| 上下文隔离 | 中间过程流式推到主 Agent UI | 子 Agent 中间过程对主 Agent 不可见 |
| 结果返回 | 所有 markdown 拼接返回 | 只返回结构化的精炼摘要 |
| 上下文大小 | 与主 Agent 共享概念 | 子 Agent 有独立的上下文窗口和 Token 预算 |
| 专业化 | 通用子 Agent | 有专门的搜索/分析/执行等专业子 Agent |
| 模型选择 | 使用主 Agent 的模型 | 子 Agent 可用更快更便宜的模型 |
| 递归调用 | 禁止 | 支持（有深度限制） |

**功能需求**：

| 编号 | 需求 | 说明 |
|------|------|------|
| FR-SA-01 | 独立上下文窗口 | 每个子 Agent 有自己的上下文窗口，不与主 Agent 共享历史 |
| FR-SA-02 | 结果摘要化 | 子 Agent 的完整输出经过摘要处理后才注入主 Agent 上下文 |
| FR-SA-03 | 摘要 Token 上限 | 每个子 Agent 返回的摘要有 Token 上限（默认 2000） |
| FR-SA-04 | 独立模型配置 | 子 Agent 可配置使用不同的（通常更快更便宜的）模型 |
| FR-SA-05 | 专业化子 Agent | 内置多种专业子 Agent（见下表） |
| FR-SA-06 | 限定工具集 | 每种子 Agent 只能使用其职责范围内的工具 |
| FR-SA-07 | 并行执行 | 无依赖的子 Agent 可并行执行 |
| FR-SA-08 | 递归深度限制 | 支持子 Agent 调用子 Agent，最大深度可配置（默认 2） |
| FR-SA-09 | 产出物直通 | 文件修改等产出物直接转发，不占摘要预算 |
| FR-SA-10 | 元数据上报 | 子 Agent 上报 token 消耗、工具调用次数、耗时等元数据 |

**内置专业子 Agent**：

| 子 Agent | 职责 | 推荐模型 | 上下文 | 工具集 |
|----------|------|---------|--------|--------|
| **CodeSearch** | 根据描述找到相关代码 | 快速模型 | 32K | ripgrep, symbols, fileFind, codebaseIndex |
| **CodeAnalyzer** | 深入分析代码逻辑和依赖 | 强模型 | 64K | readFile, symbols, callHierarchy, references |
| **CodeWriter** | 根据明确规格编写代码 | 强模型 | 32K | editFile, createFile |
| **TestRunner** | 运行测试并分析结果 | 快速模型 | 16K | terminal, readFile |
| **WebResearcher** | 查找文档和解决方案 | 快速模型 | 32K | fetchPage, webSearch |
| **Planner** | 任务分解和规划 | 强模型 | 16K | 无工具 |

**上下文隔离原则**：

```
主 Agent 看到的:
  "[CodeSearch] 在 src/auth/ 下找到 3 个认证相关文件:
   authService.ts (主服务), authMiddleware.ts (JWT验证), authTypes.ts (类型定义)"

主 Agent 看不到的（全在子 Agent 独立上下文内）:
  - ripgrep 搜索了 128 个文件
  - 匹配了 37 处结果
  - 读取了 5 个文件的完整内容（共 890 行）
  - 逐一分析了每个匹配的相关性
  - ...（可能消耗数万 tokens 的中间过程）
```

---

### 3.9 本地代码知识引擎

**目标**：让 AI 理解整个代码库的结构、依赖关系和语义。支持增量更新。

**核心策略：复用开源引擎 + 自研增量编排层。**

**不完全自研的原因**：DeepWiki-Open 和 CodeWiki 两个开源项目已经解决了核心分析能力的 ~80%。

#### 3.9.1 复用的开源组件

**从 DeepWiki-Open 复用**（MIT 协议，13.3K+ stars）：

| 模块 | 复用内容 | 用途 |
|------|---------|------|
| `rag_engine.py` | RAG 检索引擎 + FAISS 向量检索 | 代码语义搜索和问答 |
| `embedding_service.py` | 多 Provider 嵌入生成（OpenAI/Ollama/HuggingFace） | 代码向量化 |
| `data_pipeline.py` | 代码文件加载 + 智能分块 | 数据预处理 |
| `wiki_generator.py` | 结构化 Wiki 生成 | 项目文档生成 |
| 配置系统 | `embedder.json`, `repo.json` | 嵌入和仓库配置 |

**从 CodeWiki 复用**（FSoft-AI4Code，支持 7 语言，质量评分超 DeepWiki 4.73%）：

| 模块 | 复用内容 | 用途 |
|------|---------|------|
| `decomposition/` | AST 解析 → 依赖图 → 层级分解算法 | 代码结构理解 |
| `agent/` | 多 Agent 架构思想 | 多模块递归分析 |
| 7 语言 AST 支持 | Python/Java/JS/TS/C/C++/C# | 跨语言代码分析 |

#### 3.9.2 自研的增量编排层

**两个开源项目都不具备**的 IDE 场景能力，需要自研：

| 模块 | 功能 | 说明 |
|------|------|------|
| 文件变更收集器 | 监听文件系统变更 | 复用 VS Code FileWatcher，防抖+批量合并 |
| 文件指纹缓存 | SHA256 指纹比对 | 跳过内容未变的文件 |
| 增量分派器 | 将变更分派到 Python 引擎 | 单文件维度的增量解析和嵌入更新 |
| 缓存失效管理 | 摘要和索引的 stale 标记 | 级联失效，懒更新策略 |
| 查询路由 | 决定用哪个引擎回答查询 | 结构查询→CodeWiki，语义查询→DeepWiki |
| IPC 通信 | IDE ↔ Python sidecar | JSON-RPC over stdio |

#### 3.9.3 功能需求

| 编号 | 需求 | 说明 |
|------|------|------|
| FR-CK-01 | 首次全量索引 | 打开项目时后台渐进式索引，优先索引当前打开的文件 |
| FR-CK-02 | 增量更新 | 文件保存时仅重新索引变化的文件 |
| FR-CK-03 | 级联失效 | 文件变更时，依赖该文件的模块摘要标记为 stale |
| FR-CK-04 | 懒更新 | stale 摘要在查询时才重新生成，不立即重建 |
| FR-CK-05 | 语义搜索 | `@codebase` 触发向量语义搜索（DeepWiki RAG） |
| FR-CK-06 | 结构查询 | "谁调用了 X"、"X 依赖什么"等结构化查询（CodeWiki 依赖图） |
| FR-CK-07 | 项目摘要 | 自动生成项目结构、核心模块、技术栈的摘要 |
| FR-CK-08 | 索引状态指示 | 状态栏显示索引进度和状态 |
| FR-CK-09 | 不阻塞 UI | 索引在独立进程中运行 |
| FR-CK-10 | 离线可用 | 嵌入生成支持本地模型（Ollama），无需联网 |
| FR-CK-11 | 代码不外传 | 所有索引数据完全存储在本地 |

#### 3.9.4 集成方式（两阶段）

| 阶段 | 方式 | 工作量 | 能力 |
|------|------|--------|------|
| 第一阶段 | 通过 MCP Server 调用 DeepWiki + CodeWiki | 1-2 周 | 基础可用，全量索引 |
| 第二阶段 | Fork 并定制为 Python sidecar 进程 + 自研增量层 | 3-4 周 | 增量更新、深度集成 |

---

### 3.10 工具体系

**目标**：Agent 的工具能力主要来自 MCP 开源生态和 VS Code 内置工具，只对差异化能力自研。

**核心原则**：**不自己逐一开发工具。**

#### 3.10.1 工具来源分层

| 层 | 来源 | 示例 | 开发量 |
|----|------|------|--------|
| 第一层 | VS Code 内置工具（已有） | editFile, rename, usages, fetchWebPage, runSubagent | 0 |
| 第二层 | MCP 开源工具（接入即用） | filesystem, git, fetch, memory, code-pathfinder | 0（配置） |
| 第三层 | 自研增强工具（仅差异化） | smartApplyDiff, codebaseSearch, projectAnalyzer | 少量 |
| 第四层 | 用户/社区扩展工具 | `.toolsets.jsonc`, Extensions | 0 |

#### 3.10.2 推荐预配置的 MCP 工具

| MCP Server | 功能 | 来源 |
|-----------|------|------|
| `@modelcontextprotocol/server-filesystem` | 文件读写、目录遍历、搜索 | 官方 |
| `@modelcontextprotocol/server-git` | Git 操作 | 官方 |
| `@modelcontextprotocol/server-fetch` | 网页内容获取 | 官方 |
| `@modelcontextprotocol/server-memory` | 知识图谱持久化 | 官方 |
| `mcp-deepwiki` | 代码库文档问答 | DeepWiki |
| `codewiki-mcp` | 代码库结构分析 | CodeWiki |
| Code Pathfinder | 语义代码分析、调用图 | 社区 |
| Playwright MCP | 浏览器自动化 | 社区 |

#### 3.10.3 自研工具（仅以下几个）

| 工具 | 功能 | 自研原因 |
|------|------|---------|
| smartApplyDiff | 智能 Diff 应用（模糊匹配） | LLM 输出的代码行号可能不精确，需要 fuzzy match |
| codebaseSearch | 代码库语义搜索 | 需要深度集成本地知识引擎 |
| projectAnalyzer | 项目结构分析 | 需要集成 CodeWiki 的分解能力 |

#### 3.10.4 功能需求

| 编号 | 需求 | 说明 |
|------|------|------|
| FR-TL-01 | MCP 工具自动注册 | MCP Server 的工具自动出现在 Agent 可用工具列表中 |
| FR-TL-02 | 工具确认机制 | 危险工具（写文件、执行命令）需用户确认 |
| FR-TL-03 | 工具白名单 | 用户可配置自动批准的工具列表 |
| FR-TL-04 | MCP Server 管理 UI | 可视化的 MCP Server 启用/禁用/配置界面 |
| FR-TL-05 | 推荐 MCP Server | 产品内置推荐的 MCP Server 列表，一键安装 |
| FR-TL-06 | 自定义 MCP Server | 用户可添加自己的 MCP Server |

---

### 3.11 终端 AI 增强

**目标**：AI 辅助终端操作。

**复用基础**：VS Code Terminal API + `extensions/terminal-suggest/`。

**功能需求**：

| 编号 | 需求 | 说明 |
|------|------|------|
| FR-TM-01 | 自然语言转命令 | 在终端输入自然语言描述，AI 生成对应命令 |
| FR-TM-02 | 错误分析 | 命令执行失败时，AI 分析错误并建议修复 |
| FR-TM-03 | 命令解释 | 选中终端命令，AI 解释其含义和参数 |
| FR-TM-04 | Agent 终端集成 | Agent 可在终端执行命令并读取输出 |

---

### 3.12 设置与配置

**目标**：提供友好的 AI 功能配置界面。

**功能需求**：

| 编号 | 需求 | 说明 |
|------|------|------|
| FR-ST-01 | AI Provider 配置 | 可视化配置 AI 提供商、API Key、端点 |
| FR-ST-02 | 模型选择 | 为不同场景（Chat/补全/嵌入/Agent）选择模型 |
| FR-ST-03 | 补全设置 | 启停、防抖延迟、最大 Token 数 |
| FR-ST-04 | Agent 设置 | 最大迭代次数、自动应用开关、确认策略 |
| FR-ST-05 | MCP Server 管理 | MCP Server 的启用/禁用/配置 |
| FR-ST-06 | 知识引擎设置 | 索引启停、嵌入模型选择、排除规则 |
| FR-ST-07 | 隐私设置 | 控制哪些数据可以发送到 AI 服务 |

**核心配置项**：

```
aiStudio.provider                    # AI 提供商 (openai / anthropic / deepseek / ollama / custom)
aiStudio.apiKey                      # API Key (加密存储)
aiStudio.apiEndpoint                 # API 端点 URL

aiStudio.model.chat                  # Chat 模型
aiStudio.model.completion            # 代码补全模型
aiStudio.model.embedding             # 嵌入模型
aiStudio.model.agent                 # Agent 模型
aiStudio.model.subagent              # 子 Agent 默认模型

aiStudio.completion.enabled          # 补全启停
aiStudio.completion.debounceMs       # 防抖延迟 (默认 350)
aiStudio.completion.maxTokens        # 补全最大 Token (默认 256)

aiStudio.agent.maxIterations         # Agent 最大迭代 (默认 25)
aiStudio.agent.autoApply             # 自动应用修改 (默认 false)
aiStudio.agent.confirmDangerousOps   # 确认危险操作 (默认 true)

aiStudio.subagent.maxDepth           # 子 Agent 最大递归深度 (默认 2)
aiStudio.subagent.maxSummaryTokens   # 子 Agent 摘要 Token 上限 (默认 2000)

aiStudio.codebaseIndex.enabled       # 知识引擎启停
aiStudio.codebaseIndex.embeddingModel # 嵌入模型 (默认 local)
aiStudio.codebaseIndex.excludePatterns # 排除的文件模式
```

---

## 4. 非功能性需求

| 编号 | 类别 | 需求 | 指标 |
|------|------|------|------|
| NFR-01 | 性能 | 代码补全延迟 | 首次 < 1s，缓存命中 < 100ms |
| NFR-02 | 性能 | Chat 首 Token 延迟 | < 2s（取决于模型 Provider） |
| NFR-03 | 性能 | 索引不阻塞 UI | 索引在独立进程，UI 帧率不下降 |
| NFR-04 | 性能 | 增量索引延迟 | 单文件变更索引更新 < 3s |
| NFR-05 | 安全 | API Key 加密存储 | 使用 OS 原生密钥链 |
| NFR-06 | 安全 | 代码不外传 | 索引数据 100% 本地，代码仅发送到用户配置的 AI 端点 |
| NFR-07 | 安全 | Agent 沙箱 | 危险操作需确认，可配置白名单 |
| NFR-08 | 兼容性 | VS Code 扩展兼容 | 兼容所有 VS Code 扩展 |
| NFR-09 | 兼容性 | 跨平台 | Windows / macOS / Linux |
| NFR-10 | 可用性 | 离线模式 | 搭配 Ollama 可完全离线使用 |
| NFR-11 | 可维护性 | 遵循 VS Code 分层架构 | base → platform → editor → workbench |
| NFR-12 | 可维护性 | 代码规范 | 遵循 `.github/copilot-instructions.md` 中的编码规范 |

---

## 5. 技术约束与决策

### 5.1 架构约束

| 约束 | 说明 |
|------|------|
| 遵循 VS Code 分层架构 | base → platform → editor → workbench，禁止反向依赖 |
| 依赖注入 | 所有服务通过 `createDecorator` + `registerSingleton` 注册 |
| Contribution 模式 | 新功能通过 `workbench.contribution.ts` 注册 |
| Disposable 管理 | 所有资源通过 `DisposableStore` / `MutableDisposable` 管理 |
| 国际化 | 用户可见字符串使用 `nls.localize()` |

### 5.2 技术决策

| 决策 | 选择 | 理由 |
|------|------|------|
| AI 工具来源 | MCP 生态为主 | 避免造轮子，MCP 有 79.8K stars 的成熟生态 |
| 代码分析引擎 | 复用 DeepWiki-Open + CodeWiki | 两个项目合计解决 80% 核心能力 |
| Python sidecar 通信 | JSON-RPC over stdio | 与 LSP 相同模式，成熟可靠 |
| 向量存储 | FAISS（复用 DeepWiki） | 成熟、高性能、零外部依赖 |
| 本地嵌入 | Ollama / HuggingFace | 离线可用 |
| 工具确认 | 复用 `ILanguageModelToolsConfirmationService` | 已有成熟实现 |
| 子 Agent 通信 | 增强 `RunSubagentTool` | 在现有基础上增强，不重建 |

### 5.3 复用 vs 自研决策总览

| 模块 | 决策 | 来源 |
|------|------|------|
| Chat UI 框架 | 复用 | VS Code `contrib/chat/` |
| Inline Chat 框架 | 复用 | VS Code `contrib/inlineChat/` |
| Ghost Text 渲染 | 复用 | VS Code `contrib/inlineCompletions/` |
| Language Model API | 扩展 | VS Code `ILanguageModelsService` |
| Tool 注册/调用 | 复用 | VS Code `ILanguageModelToolsService` |
| MCP 集成 | 复用 | VS Code `contrib/mcp/` |
| 子 Agent 基础 | 增强 | VS Code `RunSubagentTool` |
| 文件监视 | 复用 | VS Code `platform/files/node/watcher/` |
| 文本搜索 | 复用 | VS Code Ripgrep 集成 |
| 符号系统 | 复用 | VS Code `ILanguageFeaturesService` |
| AST 解析 + 依赖图 | 复用 | CodeWiki `decomposition/` |
| RAG + 向量检索 | 复用 | DeepWiki-Open `rag_engine.py` |
| 嵌入生成 | 复用 | DeepWiki-Open `embedding_service.py` |
| 文件/Git/Web 工具 | 复用 | MCP 开源 Server |
| **AI Provider 抽象层** | **自研** | — |
| **上下文管理器** | **自研** | — |
| **子 Agent 增强** | **自研** | — |
| **增量编排层** | **自研** | — |
| **品牌定制** | **修改** | `product.json` + 资源 |

---

## 6. 竞品对标

| 功能 | Cursor | Windsurf | 本项目目标 |
|------|--------|----------|-----------|
| 代码补全 | Tab（专有模型） | 自有模型 | 多模型 + 本地模型 |
| Chat | 侧栏 Chat | 侧栏 Chat | 复用 VS Code Chat 框架 |
| Agent | Composer | Cascade | 自建 Agent + 子 Agent 架构 |
| 多模型 | 支持多个 | 有限 | 完全开放 + 自定义端点 |
| 本地模型 | 不支持 | 不支持 | **Ollama 原生支持** |
| MCP 工具 | 支持 | 有限 | **原生 VS Code MCP + 推荐市场** |
| 代码库理解 | 专有索引 | 专有索引 | **DeepWiki + CodeWiki + 本地索引** |
| 上下文管理 | 未知 | 未知 | **分层预算 + 自动压缩 + 子 Agent 隔离** |
| 子 Agent | 未知 | 未知 | **专业化子 Agent + 独立上下文** |
| 开源 | 闭源 | 闭源 | **完全开源 (MIT)** |
| 数据隐私 | 代码经过服务器 | 代码经过服务器 | **可完全离线 + 本地部署** |
| 扩展兼容 | 大部分兼容 | 大部分兼容 | **100% VS Code 扩展兼容** |

---

## 7. 实施阶段规划

### Phase 0: 基础搭建（第 1-2 周）

| 任务 | 说明 | 优先级 |
|------|------|--------|
| 品牌定制 | `product.json` + 图标 + 包标识 | P0 |
| AI Provider 抽象层 | 多 Provider 接口 + OpenAI/Anthropic 实现 | P0 |
| MCP 预配置 | 预配置推荐的 MCP Server 列表 | P0 |

### Phase 1: 核心 AI 功能（第 3-6 周）

| 任务 | 说明 | 优先级 |
|------|------|--------|
| 智能代码补全 | 注册 InlineCompletionsProvider + FIM | P0 |
| Chat 面板 | 内置 Chat Participant + 上下文引用 | P0 |
| Inline Chat 适配 | 对接自有 AI Provider | P0 |
| 上下文管理器 | 分层预算 + 压缩策略 | P0 |

### Phase 2: Agent 系统（第 7-10 周）

| 任务 | 说明 | 优先级 |
|------|------|--------|
| Agent Planner/Executor | 任务规划 + Tool-Use 循环 | P0 |
| 子 Agent 架构增强 | 独立上下文 + 结果摘要 + 专业化子 Agent | P0 |
| Diff 审查 UI | 多文件 Diff 审查 + 检查点回滚 | P0 |
| Agent 面板 UI | 操作时间线 + 状态展示 | P1 |

### Phase 3: 代码知识引擎（第 11-14 周）

| 任务 | 说明 | 优先级 |
|------|------|--------|
| MCP 接入（第一阶段） | 通过 MCP Server 接入 DeepWiki + CodeWiki | P1 |
| Python sidecar 集成（第二阶段） | Fork + 定制 + 增量编排层 | P1 |
| `@codebase` / `@docs` | 上下文提供者对接知识引擎 | P1 |

### Phase 4: 打磨与发布（第 15-18 周）

| 任务 | 说明 | 优先级 |
|------|------|--------|
| 终端 AI 增强 | 自然语言转命令 + 错误分析 | P2 |
| 设置 UI | AI 配置可视化界面 | P1 |
| MCP 管理 UI | MCP Server 可视化管理 | P2 |
| 测试与修复 | 全面测试 + Bug 修复 | P0 |
| 构建与打包 | 多平台构建流水线 | P0 |

### 总时间线概览

```
Week  1-2  ████ Phase 0: 品牌 + AI Provider + MCP 预配置
Week  3-6  ████████ Phase 1: 补全 + Chat + Inline Chat + 上下文管理
Week  7-10 ████████ Phase 2: Agent + 子 Agent + Diff 审查
Week 11-14 ████████ Phase 3: 代码知识引擎 (MCP → sidecar)
Week 15-18 ████████ Phase 4: 终端增强 + 设置UI + 测试 + 打包
```

---

## 附录 A: 术语表

| 术语 | 定义 |
|------|------|
| FIM | Fill-In-Middle，代码补全协议，提供光标前后代码让模型生成中间部分 |
| Ghost Text | 编辑器中灰色显示的 AI 补全建议文本 |
| MCP | Model Context Protocol，LLM 应用与外部工具/数据源的标准协议 |
| RAG | Retrieval-Augmented Generation，检索增强生成 |
| FAISS | Facebook AI Similarity Search，向量相似度搜索库 |
| HNSW | Hierarchical Navigable Small World，近似最近邻搜索算法 |
| Sidecar | 与主进程并行运行的辅助进程 |
| Tool-Use Loop | Agent 的思考→调用工具→观察结果循环 |
| Contribution | VS Code 的功能注册模式 |
| DI | Dependency Injection，依赖注入 |

## 附录 B: 关键文件索引

| 用途 | 路径 |
|------|------|
| 产品配置 | `product.json` |
| 包配置 | `package.json` |
| 编码规范 | `.github/copilot-instructions.md` |
| Desktop 工作台入口 | `src/vs/workbench/workbench.desktop.main.ts` |
| Chat 框架 | `src/vs/workbench/contrib/chat/` |
| Inline Chat 框架 | `src/vs/workbench/contrib/inlineChat/` |
| Inline Completions | `src/vs/editor/contrib/inlineCompletions/` |
| MCP 集成 | `src/vs/workbench/contrib/mcp/` |
| Tool 系统 | `src/vs/workbench/contrib/chat/common/tools/` |
| 子 Agent 工具 | `src/vs/workbench/contrib/chat/common/tools/builtinTools/runSubagentTool.ts` |
| Language Model API | `src/vs/workbench/contrib/chat/common/languageModels.ts` |
| Extension Host | `src/vs/workbench/api/common/extensionHostMain.ts` |
| 文件监视器 | `src/vs/platform/files/node/watcher/` |
| Tree-sitter | `src/vs/editor/common/services/treeSitter/` |
| 搜索服务 | `src/vs/workbench/services/search/` |

---

> **文档状态**: 待确认
>
> 请审阅以上所有内容，确认后我将基于此 Spec 编写详细的系统设计文档。
