# AI IDE 产品需求规格说明书 (Spec)

> 基于 VS Code OSS (v1.110.0) fork 开发的 AI 原生集成开发环境
>
> 版本: v0.2.0-draft
>
> 日期: 2026-03-02
>
> 变更记录:
> - v0.2.0: 新增第 4 章「性能专项设计」，覆盖 10 个性能子领域、5 条性能红线、端到端预算表
> - v0.1.0: 初始版本

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
- [4. 性能专项设计](#4-性能专项设计)
  - [4.1 代码补全性能](#41-代码补全性能)
  - [4.2 Chat 与 Agent 响应性能](#42-chat-与-agent-响应性能)
  - [4.3 上下文管理性能](#43-上下文管理性能)
  - [4.4 子 Agent 性能](#44-子-agent-性能)
  - [4.5 代码知识引擎性能](#45-代码知识引擎性能)
  - [4.6 工具调用性能](#46-工具调用性能)
  - [4.7 UI 响应性能](#47-ui-响应性能)
  - [4.8 内存管理](#48-内存管理)
  - [4.9 网络性能](#49-网络性能)
  - [4.10 性能预算总表](#410-性能预算总表)
- [5. 其他非功能性需求](#5-其他非功能性需求)
- [6. 技术约束与决策](#6-技术约束与决策)
- [7. 竞品对标](#7-竞品对标)
- [8. 实施阶段规划](#8-实施阶段规划)

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
| FR-CC-11 | 请求取消 | 新输入立即取消进行中的补全请求，避免过时结果闪烁 |
| FR-CC-12 | 前缀复用 | 用户继续输入时，已有补全是当前输入的前缀则直接截取复用 |
| FR-CC-13 | 预测性预取 | 接受补全后自动预取下一个可能位置的补全 |
| FR-CC-14 | 流式补全 | 支持流式返回，第一行可用时即刻渲染，不等全部完成 |

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
| FR-AG-13 | 实时进度 | 每一步显示当前步骤名、已用时间、工具调用计数 |
| FR-AG-14 | 步骤超时 | 单步超过 30s 提示用户可跳过或重试 |
| FR-AG-15 | 并行工具调用 | 无依赖的工具调用并行执行 |

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
| FR-CK-12 | 渐进式可用 | 首次索引分批进行，每批完成后即可查询已索引部分 |
| FR-CK-13 | 大文件跳过 | 超过配置阈值的文件自动跳过索引 |
| FR-CK-14 | 优先级队列 | 当前打开和正在编辑的文件优先索引 |
| FR-CK-15 | 大项目降级 | 超大项目自动降级索引粒度，保证可用性 |

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
aiStudio.codebaseIndex.maxFileSize   # 索引的最大文件大小 (默认 1MB)

aiStudio.performance.completionDebounceMs   # 补全防抖 (默认 350)
aiStudio.performance.completionCacheSize    # 补全缓存条数 (默认 100)
aiStudio.performance.agentStepTimeoutS      # Agent 单步超时 (默认 30)
aiStudio.performance.networkTimeoutS        # 网络请求超时 (默认 60)
aiStudio.performance.networkRetryCount      # 网络重试次数 (默认 3)
aiStudio.performance.mcpServerIdleTimeoutM  # MCP Server 空闲超时 (默认 10 分钟)
aiStudio.performance.sidecarIdleTimeoutM    # Python sidecar 空闲超时 (默认 10 分钟)
aiStudio.performance.maxConcurrentSubagents # 最大并行子 Agent 数 (默认 3)
aiStudio.performance.maxConcurrentTools     # 最大并行工具调用数 (默认 5)
```

---

## 4. 性能专项设计

> 性能是 AI IDE 的生命线。补全卡顿 500ms 用户就会关闭功能，Agent 执行超过 2 分钟用户就会失去耐心。本章对每个模块的性能需求做出明确定义，并给出关键的优化策略。

### 4.1 代码补全性能

代码补全是用户每秒都在感知的功能，对延迟极度敏感。

#### 4.1.1 性能指标

| 指标 | 目标值 | 说明 |
|------|--------|------|
| 触发到 Ghost Text 显示（冷启动） | < 800ms | 首次补全，无缓存 |
| 触发到 Ghost Text 显示（缓存命中） | < 50ms | 光标回退到已缓存位置 |
| 触发到 Ghost Text 显示（预取命中） | < 100ms | 预测性预取命中 |
| 连续输入时的请求取消延迟 | < 10ms | 新输入必须立即取消旧请求 |
| 补全请求并发数 | 最多 1 | 严格单请求，新请求取消旧请求 |
| 内存中缓存条目数 | ≤ 100 | LRU 淘汰 |
| 每次请求上下文组装耗时 | < 50ms | 不得阻塞 UI 线程 |

#### 4.1.2 优化策略

| 编号 | 策略 | 说明 |
|------|------|------|
| PERF-CC-01 | 请求防抖 | 用户停止输入后等待 N ms（默认 350ms，可配置）再触发 |
| PERF-CC-02 | 即时取消 | 新的击键立即通过 `AbortController` / `CancellationToken` 取消进行中的请求 |
| PERF-CC-03 | LRU 缓存 | 按 `(文件路径, 光标位置前缀哈希)` 作为 key 缓存最近 100 条结果 |
| PERF-CC-04 | 前缀复用 | 用户继续输入时，如果新输入是已有补全的前缀，直接截取已有结果 |
| PERF-CC-05 | 预测性预取 | 用户接受补全后，立即预取下一个可能位置的补全 |
| PERF-CC-06 | 上下文预计算 | 文件打开/切换时预先计算好补全所需的上下文（相关文件签名等），缓存在内存 |
| PERF-CC-07 | 流式渲染 | 支持流式返回补全结果，先显示第一行，后续行增量更新 |
| PERF-CC-08 | 模型预热 | 本地模型（Ollama）在 IDE 启动时预加载模型到显存 |
| PERF-CC-09 | 上下文窗口裁剪 | FIM 请求的上下文严格控制在模型限制内，前缀/后缀各不超过配置上限 |
| PERF-CC-10 | 后台线程组装 | 上下文组装（收集相关文件、构建 FIM prompt）在 Worker 线程完成，不阻塞主线程 |

#### 4.1.3 请求生命周期时序

```
用户输入字符
  │
  ├─ 立即取消上一次进行中的请求 (<10ms)
  │
  ├─ 检查 LRU 缓存 → 命中则立即显示 (<50ms)
  │
  ├─ 重置防抖计时器 (350ms)
  │
  │  ... 用户继续输入 → 重复以上流程 ...
  │
  │  ... 用户停止输入 350ms ...
  │
  ├─ 防抖触发
  │   ├─ 检查前缀复用 → 可复用则截取 (<50ms)
  │   ├─ [Worker 线程] 组装 FIM 上下文 (<50ms)
  │   ├─ 发送 API 请求
  │   ├─ 流式接收第一行 → 立即渲染 Ghost Text
  │   ├─ 后续行增量更新
  │   └─ 完整结果写入 LRU 缓存
  │
  └─ 用户接受补全 (Tab)
      └─ 立即预取下一位置的补全
```

---

### 4.2 Chat 与 Agent 响应性能

#### 4.2.1 性能指标

| 指标 | 目标值 | 说明 |
|------|--------|------|
| Chat 首 Token 延迟 (TTFT) | < 1.5s | 从发送到第一个 Token 出现 |
| Chat 流式渲染帧率 | ≥ 30fps | Markdown 渲染不卡顿 |
| Agent 单步 Tool-Use 延迟 | < 3s | Think + Tool Call + Observe 单步 |
| Agent 总任务完成时间 | 用户可接受 | 复杂任务可达数分钟，但需有进度反馈 |
| 请求排队等待时间 | < 100ms | 并发请求的排队开销 |
| Diff 审查渲染时间 | < 500ms | 10 个文件的 Diff 一次性渲染 |
| 检查点创建时间 | < 200ms | 每次 Agent 操作后的快照 |

#### 4.2.2 优化策略

| 编号 | 策略 | 说明 |
|------|------|------|
| PERF-AG-01 | 流式输出 | 所有 LLM 调用使用流式返回，实时渲染到 UI |
| PERF-AG-02 | Markdown 增量渲染 | 不在每个 Token 到达时重新渲染整段 Markdown，而是增量 append |
| PERF-AG-03 | 代码块延迟高亮 | 代码块在接收完成后再做语法高亮，流式期间用纯文本 |
| PERF-AG-04 | 工具结果懒渲染 | 工具结果在 UI 中先显示摘要，用户展开时再渲染完整内容 |
| PERF-AG-05 | 连接复用 | HTTP/2 连接复用，避免每次请求重新握手 |
| PERF-AG-06 | Agent 进度指示 | 每一步都有实时进度指示（当前步骤名、已用时间、工具调用计数） |
| PERF-AG-07 | 并行工具调用 | 无依赖的工具调用并行执行（如同时搜索多个关键词） |
| PERF-AG-08 | 检查点增量快照 | 检查点只记录变更的文件 diff，而非全量文件快照 |
| PERF-AG-09 | Diff 虚拟化渲染 | 多文件 Diff 使用虚拟滚动，只渲染可见区域 |
| PERF-AG-10 | 超时熔断 | 单步超过 30s 自动提示用户，可选跳过或重试 |

---

### 4.3 上下文管理性能

上下文组装和 Token 计算是每次 LLM 调用的必经之路，必须极快。

#### 4.3.1 性能指标

| 指标 | 目标值 | 说明 |
|------|--------|------|
| 上下文组装耗时 | < 100ms | 从请求触发到 prompt 组装完毕 |
| Token 计数耗时 | < 50ms | 单次上下文的 Token 计数 |
| 历史压缩耗时 | < 500ms | 对旧历史的摘要化处理 |
| 上下文预算计算 | < 10ms | 判断当前使用率和压缩等级 |

#### 4.3.2 优化策略

| 编号 | 策略 | 说明 |
|------|------|------|
| PERF-CTX-01 | Token 计数缓存 | 每段内容首次计数后缓存 Token 数，内容不变则复用 |
| PERF-CTX-02 | 增量 Token 计数 | 上下文变化时只重新计算变化的部分，不重新计算整体 |
| PERF-CTX-03 | 快速 Tokenizer | 使用本地 Tiktoken WASM 做 Token 计数，不调用 API |
| PERF-CTX-04 | 预计算上下文模板 | 系统提示、工具定义等固定内容的 Token 数在启动时预计算 |
| PERF-CTX-05 | 摘要异步生成 | 历史压缩使用快速小模型异步执行，不阻塞当前请求 |
| PERF-CTX-06 | 摘要缓存 | 已生成的历史摘要缓存复用，对话不变则摘要不重新生成 |
| PERF-CTX-07 | 分层淘汰快速路径 | 压缩等级 L1-L2（丢弃/截断）在 < 5ms 内完成，无需 LLM 调用 |
| PERF-CTX-08 | 上下文指纹 | 为每轮上下文生成指纹，检测到相同指纹时直接复用已组装的 prompt |

---

### 4.4 子 Agent 性能

子 Agent 引入了额外的 LLM 调用开销，需要精心优化以避免用户等待过长。

#### 4.4.1 性能指标

| 指标 | 目标值 | 说明 |
|------|--------|------|
| 子 Agent 启动开销 | < 50ms | 创建子 Agent 会话的开销（不含 LLM 调用） |
| 子 Agent 总执行时间 | < 30s（典型） | 搜索类子 Agent 应在 30s 内完成 |
| 结果摘要生成时间 | < 2s | 对子 Agent 完整输出的摘要处理 |
| 并行子 Agent 数量 | ≤ 3 | 同时执行的子 Agent 上限 |
| 子 Agent 上下文组装 | < 30ms | 子 Agent 的轻量上下文组装 |

#### 4.4.2 优化策略

| 编号 | 策略 | 说明 |
|------|------|------|
| PERF-SA-01 | 并行执行 | 无依赖的子 Agent 并行启动（如搜索 Agent 和 Web 研究 Agent） |
| PERF-SA-02 | 快速模型优先 | 搜索和执行类子 Agent 默认使用快速便宜模型（如 GPT-4o-mini） |
| PERF-SA-03 | 轻量上下文 | 子 Agent 不继承主 Agent 的历史，只注入任务描述 + 项目摘要 |
| PERF-SA-04 | 提前终止 | 子 Agent 达到目标后立即停止，不消耗剩余迭代次数 |
| PERF-SA-05 | 结果流式上报 | 子 Agent 产出物（如文件修改）在完成时立即上报，不等待摘要生成 |
| PERF-SA-06 | 摘要本地化 | 结果摘要由主 Agent 进程内的快速规则生成（结构化数据），必要时才用 LLM |
| PERF-SA-07 | 子 Agent 复用 | 同一会话中相同类型的子 Agent 复用连接和上下文模板 |
| PERF-SA-08 | Token 预算上限 | 子 Agent 有硬性 Token 消耗上限，超出时强制终止并返回已有结果 |

---

### 4.5 代码知识引擎性能

代码索引是最重的后台任务，必须做到用户无感知。

#### 4.5.1 性能指标

| 指标 | 目标值 | 说明 |
|------|--------|------|
| 首次全量索引（中型项目 ~5 万行） | < 3 分钟 | 后台进行，不阻塞任何操作 |
| 首次全量索引（大型项目 ~50 万行） | < 15 分钟 | 后台渐进式 |
| 增量索引（单文件变更） | < 2s | 保存文件到索引更新完毕 |
| 增量索引（批量 10 个文件变更，如 git checkout） | < 10s | 批量变更合并处理 |
| 语义搜索查询延迟 | < 500ms | `@codebase` 查询到结果返回 |
| 结构查询延迟 | < 200ms | "谁调用了 X" 等图查询 |
| Python sidecar 启动时间 | < 3s | 从 IDE 启动到 sidecar 就绪 |
| sidecar IPC 单次调用开销 | < 10ms | JSON-RPC 通信本身的开销 |
| FAISS 索引内存占用（5 万行项目） | < 100MB | 向量索引的内存消耗 |
| FAISS 索引内存占用（50 万行项目） | < 500MB | 需能支撑大型项目 |
| SQLite 磁盘占用（5 万行项目） | < 50MB | 符号索引 + 元数据 |

#### 4.5.2 优化策略

| 编号 | 策略 | 说明 |
|------|------|------|
| PERF-CK-01 | 独立进程 | 索引在 Utility Process（或 Python sidecar）中运行，永不阻塞 UI |
| PERF-CK-02 | 优先级队列 | 当前打开文件 > 当前项目文件 > 其他文件，按优先级索引 |
| PERF-CK-03 | 防抖批量处理 | 文件变更 500ms 防抖，批量合并后一次性分派 |
| PERF-CK-04 | 文件指纹跳过 | SHA256 指纹比对，内容未变的文件直接跳过（保存但未改内容的场景） |
| PERF-CK-05 | 增量向量更新 | FAISS 的 `add` / `remove` 操作，不重建整个索引 |
| PERF-CK-06 | 增量 AST 解析 | 复用 Tree-sitter 的增量解析能力，只重新解析变化的文件区域 |
| PERF-CK-07 | 懒摘要更新 | 依赖文件变更时只标记相关摘要为 stale，查询时才重新生成 |
| PERF-CK-08 | sidecar 预启动 | IDE 启动时立即后台启动 Python sidecar，不等待用户首次使用 |
| PERF-CK-09 | sidecar 连接池 | 维护多个并发 IPC 连接（默认 3），支持并行索引任务 |
| PERF-CK-10 | 嵌入批处理 | 嵌入生成批量请求（如 20 个代码块一次 API 调用），减少网络往返 |
| PERF-CK-11 | 嵌入缓存 | 已计算的嵌入持久化到磁盘，下次启动时直接加载 |
| PERF-CK-12 | 索引预热 | 打开项目时加载 FAISS 索引到内存，首次查询无冷启动 |
| PERF-CK-13 | 大文件跳过 | 超过配置阈值（默认 1MB）的文件跳过索引 |
| PERF-CK-14 | .gitignore 遵循 | 自动排除 .gitignore 列出的文件和目录 |
| PERF-CK-15 | 渐进式首次索引 | 首次索引分批进行，每批完成后即可查询已索引部分 |

---

### 4.6 工具调用性能

MCP 工具调用是 Agent 每一步都要经过的环节。

#### 4.6.1 性能指标

| 指标 | 目标值 | 说明 |
|------|--------|------|
| 内置工具调用延迟 | < 100ms | editFile, rename, usages 等 |
| MCP 工具调用延迟 | < 500ms | MCP Server 单次工具调用 |
| MCP Server 冷启动 | < 3s | 首次调用时 MCP Server 启动 |
| 工具结果处理（压缩/裁剪） | < 50ms | 大结果集的压缩处理 |
| 并行工具调用数 | ≤ 5 | 同时进行的工具调用上限 |

#### 4.6.2 优化策略

| 编号 | 策略 | 说明 |
|------|------|------|
| PERF-TL-01 | MCP Server 预启动 | 常用 MCP Server 在 IDE 启动时预启动，避免首次冷启动 |
| PERF-TL-02 | MCP Server 保活 | MCP Server 进程保活，不在空闲时关闭（可配置超时） |
| PERF-TL-03 | 工具结果缓存 | 相同参数的工具调用在短时间内（如 30s）缓存结果 |
| PERF-TL-04 | 大结果截断 | 工具返回超过 Token 阈值（如 10K）时自动截断并附加摘要 |
| PERF-TL-05 | 并行调用 | Agent 同时需要多个工具结果时并行调用 |
| PERF-TL-06 | 流式工具结果 | 支持工具的流式返回（如大文件读取），边读边处理 |
| PERF-TL-07 | 内置工具快速路径 | 内置工具（editFile 等）走 IDE 内进程调用，不经过 IPC |

---

### 4.7 UI 响应性能

IDE 的 UI 在任何情况下都不能卡顿——即使后台在做重型 AI 操作。

#### 4.7.1 性能指标

| 指标 | 目标值 | 说明 |
|------|--------|------|
| UI 主线程帧率 | ≥ 60fps | 任何后台操作期间 |
| 按键响应延迟 | < 16ms | 用户输入到字符出现 |
| 编辑器滚动帧率 | ≥ 60fps | 大文件滚动 |
| Chat 面板打开时间 | < 200ms | 从点击到面板可见 |
| Agent 面板 Diff 渲染 | < 500ms | 10 个文件的 Diff 列表渲染 |
| 设置页面加载 | < 300ms | AI 设置页面渲染完成 |

#### 4.7.2 优化策略

| 编号 | 策略 | 说明 |
|------|------|------|
| PERF-UI-01 | 严格主线程保护 | 所有 AI 操作（API 调用、上下文组装、Token 计数）禁止在主线程执行 |
| PERF-UI-02 | Web Worker 计算 | Token 计数、上下文压缩、Diff 计算在 Worker 中执行 |
| PERF-UI-03 | 虚拟化长列表 | Chat 历史、Agent 时间线、Diff 列表使用虚拟滚动 |
| PERF-UI-04 | 渲染节流 | 流式输出的 Markdown 渲染限制在 30fps，不在每个 Token 都触发 |
| PERF-UI-05 | 延迟加载 | AI 功能的 UI 组件延迟加载，不在 IDE 启动时全部初始化 |
| PERF-UI-06 | 骨架屏 | Chat 回复、Agent 步骤在加载时显示骨架占位 |
| PERF-UI-07 | 取消可响应 | 用户点击取消后 < 100ms 内 UI 响应（即使后台请求需要更久才能中断） |

---

### 4.8 内存管理

AI IDE 引入了向量索引、多进程、大量缓存等额外内存消耗，必须有严格的内存预算。

#### 4.8.1 内存预算

| 组件 | 预算 | 说明 |
|------|------|------|
| VS Code 基础（渲染进程） | ~500MB | 与原版 VS Code 持平 |
| AI 功能（渲染进程内） | ≤ 100MB | 缓存、上下文数据、UI 状态 |
| Python sidecar 进程 | ≤ 500MB | FAISS 索引 + CodeWiki/DeepWiki 引擎 |
| MCP Server 进程（每个） | ≤ 100MB | 按 Server 类型不同 |
| 补全缓存 | ≤ 20MB | LRU 100 条 |
| 上下文缓存 | ≤ 30MB | Token 计数缓存、摘要缓存 |
| 总计（中型项目） | ≤ 1.5GB | 所有进程合计 |
| 总计（大型项目） | ≤ 2.5GB | 包含大型向量索引 |

#### 4.8.2 优化策略

| 编号 | 策略 | 说明 |
|------|------|------|
| PERF-MEM-01 | LRU 淘汰 | 所有缓存使用 LRU 策略，超出容量自动淘汰最旧条目 |
| PERF-MEM-02 | 弱引用 | 非关键缓存使用 `WeakRef`，允许 GC 在内存压力时回收 |
| PERF-MEM-03 | 按需加载索引 | FAISS 索引支持 mmap 模式，只加载查询涉及的部分到内存 |
| PERF-MEM-04 | sidecar 休眠 | Python sidecar 空闲超过配置时间（默认 10 分钟）后释放大型数据结构 |
| PERF-MEM-05 | 进程内存监控 | 定期检查各进程内存使用，超过预算时触发缓存清理 |
| PERF-MEM-06 | 大项目降级 | 超大项目（>100 万行）自动降级：减少向量维度、增大分块粒度、限制索引范围 |
| PERF-MEM-07 | 子 Agent 会话及时清理 | 子 Agent 完成后立即释放其上下文和中间结果，只保留摘要 |

---

### 4.9 网络性能

AI 功能严重依赖网络 API 调用，网络优化直接影响用户体验。

#### 4.9.1 性能指标

| 指标 | 目标值 | 说明 |
|------|--------|------|
| API 连接建立 | < 200ms | TLS 握手 + TCP 连接 |
| 网络中断恢复 | < 5s | 断网后重连 |
| 并发 API 连接数 | ≤ 4 | 主 Agent + 子 Agent 并发调用 |

#### 4.9.2 优化策略

| 编号 | 策略 | 说明 |
|------|------|------|
| PERF-NET-01 | HTTP/2 复用 | 同一 Provider 的请求复用 HTTP/2 连接 |
| PERF-NET-02 | 连接预热 | IDE 启动时预建立到配置的 AI Provider 的连接 |
| PERF-NET-03 | 请求重试 | 网络错误自动重试（指数退避，最多 3 次） |
| PERF-NET-04 | 超时配置 | 连接超时 10s，读取超时 60s（Agent 模式 120s），可配置 |
| PERF-NET-05 | 断线优雅降级 | 网络中断时：补全自动暂停、Chat 显示重试按钮、Agent 暂停等待 |
| PERF-NET-06 | 本地模型零网络 | Ollama 本地模型走 localhost，无网络延迟 |
| PERF-NET-07 | 请求压缩 | 大 prompt 启用 gzip 压缩（当 body > 10KB） |

---

### 4.10 性能预算总表

以下是整个系统的端到端性能预算一览：

| 场景 | 操作 | 端到端延迟预算 | 分解 |
|------|------|---------------|------|
| **代码补全** | 用户停止输入 → Ghost Text 显示 | **< 800ms** | 防抖 350ms + 上下文组装 50ms + API 调用 ~400ms |
| **代码补全（缓存）** | 光标移动 → Ghost Text 显示 | **< 50ms** | 缓存查找 < 5ms + 渲染 < 45ms |
| **Chat** | 发送消息 → 首 Token | **< 1.5s** | 上下文组装 100ms + API TTFT ~1.4s |
| **Chat 渲染** | Token 流 → 屏幕更新 | **< 33ms/帧** | 30fps 渲染节流 |
| **Agent 单步** | Think → Tool → Observe | **< 3s** | LLM Think ~1.5s + Tool ~1s + 结果处理 0.5s |
| **子 Agent** | 启动 → 返回摘要 | **< 30s** | 典型搜索类子 Agent |
| **@codebase 查询** | 输入 → 结果 | **< 500ms** | 嵌入查询 100ms + FAISS 检索 200ms + 结果格式化 200ms |
| **增量索引** | 文件保存 → 索引更新 | **< 2s** | 防抖 500ms + AST 解析 500ms + 嵌入 500ms + 写入 500ms |
| **Diff 审查** | Agent 完成 → Diff 可见 | **< 500ms** | Diff 计算 200ms + 渲染 300ms |
| **IDE 启动** | 启动 → 编辑器可用 | **与原版 VS Code 持平** | AI 功能全部延迟初始化 |

#### 性能红线（必须遵守的硬性约束）

| 红线 | 说明 |
|------|------|
| **主线程不得执行 AI 操作** | 任何 LLM 调用、Token 计数、上下文组装都不能在主线程 |
| **用户输入不得被阻塞** | 即使 AI 后台重负载，按键延迟必须 < 16ms |
| **IDE 启动时间不增加** | AI 功能全部延迟初始化，不增加 IDE 启动时间 |
| **内存不失控** | 所有缓存有上限，所有进程有预算，超出时降级而非 OOM |
| **AI 操作可取消** | 所有 AI 操作必须支持 CancellationToken，用户可随时中断 |

---

## 5. 其他非功能性需求

| 编号 | 类别 | 需求 | 指标 |
|------|------|------|------|
| NFR-01 | 安全 | API Key 加密存储 | 使用 OS 原生密钥链（Keytar / SecretStorage） |
| NFR-02 | 安全 | 代码不外传 | 索引数据 100% 本地，代码仅发送到用户配置的 AI 端点 |
| NFR-03 | 安全 | Agent 沙箱 | 危险操作（删除文件、执行命令）需用户确认，可配置白名单 |
| NFR-04 | 安全 | MCP Server 沙箱 | MCP Server 有权限控制，敏感工具需授权 |
| NFR-05 | 兼容性 | VS Code 扩展兼容 | 兼容所有 VS Code 扩展 |
| NFR-06 | 兼容性 | 跨平台 | Windows / macOS / Linux |
| NFR-07 | 可用性 | 离线模式 | 搭配 Ollama 可完全离线使用 |
| NFR-08 | 可用性 | 优雅降级 | AI 服务不可用时不影响基础编辑功能 |
| NFR-09 | 可维护性 | 遵循 VS Code 分层架构 | base → platform → editor → workbench，禁止反向依赖 |
| NFR-10 | 可维护性 | 代码规范 | 遵循 `.github/copilot-instructions.md` 中的编码规范 |
| NFR-11 | 可观测性 | AI 操作日志 | 每次 LLM 调用记录：模型、Token 用量、延迟、成功/失败 |
| NFR-12 | 可观测性 | 性能度量 | 关键路径埋点：补全延迟、TTFT、索引耗时、工具调用延迟 |
| NFR-13 | 可观测性 | 用量统计 | 用户可查看 Token 消耗、API 调用次数、费用估算 |

---

## 6. 技术约束与决策

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

## 7. 竞品对标

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

## 8. 实施阶段规划

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
