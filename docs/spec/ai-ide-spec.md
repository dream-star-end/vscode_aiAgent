# AI IDE 产品需求规格说明书 (Spec)

> 基于 VS Code OSS (v1.110.0) fork，构建开源 AI 原生 IDE
>
> 版本: v2.0.0-draft | 日期: 2026-03-02
>
> v2.0: 新增核心特色「7x24 自主 Agent」；借鉴 Claude Code 引入 Hooks、三层压缩、分层权限、项目持久上下文

---

## 1. 项目概述与核心定位

基于 VS Code OSS (MIT) fork，构建开源、支持多模型、可私有部署的 AI 原生 IDE。

**核心差异化（三句话）**：
1. **7x24 自主 Agent**：以目标驱动，不需要用户推动即可持续运行直至达成目标——这是市面上没有的
2. **IDE + Agent 双形态**：既有 Cursor 级别的编辑体验（补全/Chat/Inline Chat），又有 Claude Code 级别的 Agent 深度
3. **完全开源 + 多模型自由**：不锁定任何 AI 服务商，支持本地模型，代码不外传

### 1.1 竞品定位

| 维度 | Claude Code | Cursor | Devin | OpenHands | **我们** |
|------|------------|--------|-------|-----------|---------|
| 形态 | 终端 Agent | IDE | 云端 Agent | 开源 Agent | **IDE + 7x24 Agent** |
| 代码补全 | 无 | 极好 | 无 | 无 | 好 |
| Agent 深度 | 极强 | 强 | 极强 | 强 | **极强** |
| 持续自主运行 | 否(会话制) | 部分(Cloud Agent) | 部分(定时) | 是(30h+) | **是(7x24 目标驱动)** |
| 多模型 | 仅 Claude | 多模型 | 有限 | 多模型 | **完全开放** |
| 开源 | 否 | 否 | 否 | 是 | **是** |
| 费用 | $100+/月 | $20/月 | $500/月 | 自付API | **自付API** |

### 1.2 可复用的已有能力

| 已有框架 | 复用方式 |
|---------|---------|
| Chat UI / Inline Chat / Inline Completions | 注册自有 Participant / Provider |
| Language Model API / Tool 系统 / MCP | 扩展注册 |
| Skills (`SKILL.md` + `promptSyntax/`) | 复用并增强 |
| 子 Agent (`RunSubagentTool`) | 复用并增强 |
| 文件监视 / Ripgrep / 符号系统 / Tree-sitter | 直接复用 |

---

## 2. 核心特色：7x24 自主 Agent ⭐⭐⭐

### 2.1 概念

用户定义一个**目标**（而非单步任务），Agent 自动将目标分解为任务图，然后**持续自主推进**——搜索代码、编写实现、运行测试、修复错误、提交代码——无需用户推动，直至目标完成或遇到需要人类决策的节点。

**与现有产品的本质区别**：

| 维度 | 现有产品 (Cursor/Claude Code) | 我们的 7x24 Agent |
|------|----------------------------|------------------|
| 驱动方式 | 用户发一条指令→Agent 执行→停下等用户 | 用户定义目标→Agent 自主持续推进 |
| 生命周期 | 单次会话，需要用户在场 | **跨会话持久运行**，用户可离开 |
| 错误处理 | 遇错停下等用户 | **自主诊断修复**，实在不行才暂停 |
| 上下文 | 单窗口上下文 | **持久任务状态**，上下文可压缩/恢复 |
| 进度感知 | 用户实时观看 | **异步通知**，用户按需查看 |

### 2.2 架构：Planner + Worker + Judge

借鉴 Cursor 的大规模 Agent 实验结论（扁平自协调失败，分角色成功）：

```
用户定义目标: "把 Express 项目迁移到 NestJS，保持 API 兼容"
     │
     ▼
┌─────────────┐
│  Planner     │  持久运行，负责全局规划
│  (强模型)    │  · 分解目标为任务 DAG（有向无环图）
│             │  · 根据执行结果动态调整计划
│             │  · 检测阻塞点，决定是否需要人类介入
└──────┬──────┘
       │ 分派任务
       ▼
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│  Worker 1    │  │  Worker 2    │  │  Worker 3    │
│  (快速模型)  │  │  (快速模型)  │  │  (快速模型)  │
│  迁移用户模块 │  │  迁移订单模块 │  │  编写测试    │
│  独立上下文   │  │  独立上下文   │  │  独立上下文   │
└──────┬──────┘  └──────┬──────┘  └──────┬──────┘
       │                │                │
       └────────────────┼────────────────┘
                        ▼
                 ┌─────────────┐
                 │   Judge      │  每个 Worker 完成后
                 │  (强模型)    │  · 验证：build + test + lint
                 │             │  · 代码审查：质量/安全/风格
                 │             │  · 决定：接受/打回/需要人类审查
                 └──────┬──────┘
                        │
                        ▼
                  继续下一轮 / 通知用户 / 完成
```

### 2.3 持久任务状态

7x24 运行的关键是**任务状态持久化**——Agent 必须能跨上下文压缩、跨 IDE 重启、甚至跨天保持任务进度。

```
~/.ai-studio/tasks/{goal-id}/
├── goal.json              # 用户原始目标 + 约束
├── plan.json              # 当前任务 DAG（Planner 维护）
├── progress.json          # 各任务状态 (pending/running/done/failed/blocked)
├── checkpoints/           # 每个任务完成时的 Git 快照
│   ├── task-001.patch
│   ├── task-002.patch
│   └── ...
├── context/               # 持久上下文
│   ├── project-summary.md # 项目摘要（不随压缩丢失）
│   ├── decisions.md       # 关键决策记录（不随压缩丢失）
│   └── learnings.md       # Agent 学到的项目知识
├── logs/                  # 执行日志
│   └── {timestamp}.jsonl
└── notifications/         # 待发送的用户通知
```

### 2.4 自主错误恢复

这是 7x24 运行最难也最关键的部分——Agent 必须能自己处理大部分错误：

| 错误类型 | 自主恢复策略 | 需要人类介入的条件 |
|---------|-------------|-----------------|
| 编译错误 | 分析错误信息→修复代码→重新编译，最多重试 3 次 | 3 次修复失败 |
| 测试失败 | 分析失败测试→修复代码→重跑，最多重试 3 次 | 3 次修复失败 |
| 合并冲突 | 分析冲突→自动解决简单冲突 | 复杂语义冲突 |
| API 限流 | 指数退避等待→切换 fallback 模型 | 所有 Provider 不可用 |
| Token 耗尽 | 压缩上下文→降级到更小模型 | 预算硬上限已达 |
| 需求歧义 | 记录歧义点→按最合理假设继续→标记为需审查 | 多个同等合理的选择 |
| 未知错误 | 回滚到检查点→尝试替代方案 | 2 次替代方案都失败 |

### 2.5 人机协作模式

7x24 不等于完全无人。Agent 在关键节点会暂停等待人类：

| 暂停条件 | 通知方式 | 用户操作 |
|---------|---------|---------|
| 自主恢复 3 次失败 | IDE 通知 + 系统通知 | 介入修复/跳过/终止 |
| 需要架构决策 | IDE 通知 | 选择方案 A/B/C |
| 单个目标阶段完成 | IDE 通知 | 审查 Diff + 确认继续 |
| Token 预算达到 80% | IDE 通知 | 追加预算/终止 |
| 整个目标完成 | IDE 通知 + 邮件/Slack 可选 | 审查 + 合并 |

**三种运行模式**：

| 模式 | 说明 | 适用场景 |
|------|------|---------|
| **全自主** | Agent 自主运行，仅在无法恢复时暂停 | 明确的、有测试覆盖的任务 |
| **半自主** | 每个阶段完成后暂停等待审查 | 重要功能开发 |
| **监督式** | 每个工具调用都需确认（≈传统 Agent） | 敏感操作、学习 Agent 行为 |

### 2.6 成本控制

持续运行最大的顾虑是成本。必须有多层成本控制：

| 控制层 | 机制 |
|--------|------|
| 模型路由 | Planner/Judge 用强模型，Worker 用快速便宜模型 |
| Prompt 缓存 | 系统提示/工具定义/项目摘要走 Provider 缓存（降 ~90%） |
| 预算上限 | 每个目标可设 Token 预算上限，达到 80% 通知，100% 暂停 |
| 空闲检测 | 无待执行任务时 Agent 休眠，不消耗 Token |
| 用量仪表盘 | 实时显示 Token 消耗、按任务/模型细分、费用估算 |

### 2.7 关键需求汇总

| 编号 | 需求 |
|------|------|
| FR-AUTO-01 | 目标定义：用户用自然语言描述高级目标，可附加约束(不改X文件、用Y框架等) |
| FR-AUTO-02 | 自动分解：Planner 将目标分解为任务 DAG，支持并行和依赖关系 |
| FR-AUTO-03 | 持续执行：Worker 持续执行任务，无需用户逐步推动 |
| FR-AUTO-04 | 自验证：每个任务完成后自动 build + test + lint |
| FR-AUTO-05 | 自主错误恢复：编译/测试失败自动修复，最多重试 N 次 |
| FR-AUTO-06 | 检查点：每个任务完成时创建 Git 检查点，支持任意回滚 |
| FR-AUTO-07 | 持久状态：任务进度持久化到磁盘，IDE 重启后可恢复 |
| FR-AUTO-08 | 异步通知：关键节点通知用户(IDE/系统通知/可选邮件Slack) |
| FR-AUTO-09 | 人机暂停：不确定时主动暂停等人类决策 |
| FR-AUTO-10 | 三种模式：全自主/半自主/监督式 |
| FR-AUTO-11 | 预算控制：Token 预算上限 + 用量仪表盘 |
| FR-AUTO-12 | 进度仪表盘：任务 DAG 可视化 + 各任务状态 + 时间线 |
| FR-AUTO-13 | 并行 Worker：无依赖任务并行执行（最多 N 个 Worker） |
| FR-AUTO-14 | 动态重规划：执行过程中 Planner 可根据结果调整计划 |

---

## 3. 借鉴 Claude Code 的增强设计

### 3.1 三层上下文压缩（替代原 5 级线性压缩）

借鉴 Claude Code 的三层压缩模型，比我们之前的 L1-L5 线性压缩更实用：

| 层 | 名称 | 触发 | 机制 | 保留 |
|----|------|------|------|------|
| 1 | **Micro-compaction** | 每次工具调用后 | 大工具输出卸载到磁盘，上下文只保留摘要引用 | 最近 1-2 次工具结果完整保留 |
| 2 | **Auto-compaction** | 剩余空间 < 安全阈值 | 全文摘要：历史→单句，工具结果→统计 | 关键状态恢复：当前任务+TODO+最近文件+决策记录 |
| 3 | **Manual /compact** | 用户或 7x24 Agent 主动触发 | 深度摘要+状态重建 | 从持久任务状态（2.3）恢复完整工作上下文 |

**与 7x24 Agent 的配合**：7x24 Agent 可以在每个任务边界自动触发 Manual compact，因为持久任务状态在磁盘上，压缩不会丢失进度。这解决了 Claude Code 最大的痛点（压缩后遗忘）。

### 3.2 Hooks 生命周期系统

借鉴 Claude Code 的 Hooks，让用户可以在 Agent 生命周期的关键节点插入自定义逻辑：

| 事件 | 触发时机 | 典型用途 |
|------|---------|---------|
| `SessionStart` | 会话开始 | 加载项目配置、启动服务 |
| `PreToolUse` | 工具调用前 | 阻止危险命令、自动 lint |
| `PostToolUse` | 工具调用后 | 文件保存后自动格式化 |
| `PreCompact` | 上下文压缩前 | 保存关键状态到磁盘 |
| `SubagentStart/Stop` | 子 Agent 生命周期 | 资源分配和清理 |
| `TaskComplete` | 7x24 任务完成 | 运行集成测试、发通知 |
| `GoalComplete` | 7x24 目标完成 | 生成总结报告、创建 PR |

Hook 类型：Shell 命令 | HTTP 端点 | 自定义脚本。返回值可控制流程（继续/阻止/修改）。

### 3.3 分层权限系统

借鉴 Claude Code 的权限模型，替代我们之前简单的"确认+白名单"：

| 层 | 操作 | 默认行为 | 持久范围 |
|----|------|---------|---------|
| 只读 | readFile, search, listDir, symbols | 自动允许 | — |
| 编辑 | editFile, createFile | 需确认 | 会话内持久 |
| 执行 | terminal, bash | 需确认 | 按项目+命令持久 |
| 危险 | deleteFile, git push, deploy | 始终确认 | 不持久 |

支持 specifier 粒度：`Bash(npm run *)` 允许所有 npm 脚本；`Read(.env)` 单独控制 .env 读取。

权限评估顺序：deny → ask → allow。7x24 全自主模式下，编辑和执行层自动允许，仅危险层需确认。

### 3.4 项目持久上下文 (AISTUDIO.md)

借鉴 Claude Code 的 `CLAUDE.md`，复用 VS Code 已有的 `copilot-instructions.md` 机制：

用户在项目根目录创建 `AISTUDIO.md`（或复用 `.github/copilot-instructions.md`），内容每次会话自动加载到固定区（2%预算）：

```markdown
# 项目规则
- 包管理器用 pnpm，不要用 npm
- API 端点都在 src/api/ 下，遵循 RESTful 规范
- 测试命令: pnpm test
- 不要修改 src/core/ 下的任何文件
- 提交信息格式: type(scope): description
```

与 Skills 的区别：AISTUDIO.md 是**全局始终加载的**项目规则；Skills 是**按需匹配**的领域知识。

### 3.5 Token 安全保护

Claude Code 最大的痛点之一是 Token 耗尽时代码损坏。我们必须避免：

| 保护机制 | 说明 |
|---------|------|
| 写前检查点 | 每次 editFile 前自动创建 Git stash 检查点 |
| Token 余量预测 | 每步开始前预估所需 Token，不足时主动压缩或暂停 |
| 原子操作 | 多文件修改要么全部成功，要么全部回滚 |
| 优雅降级 | Token 接近上限时：停止新任务→完成当前步骤→保存状态→暂停 |

---

## 4. 基础功能模块

> 以下模块在之前版本中已详细定义，此处保留核心要点。

### 4.1 品牌定制

修改 `product.json` 品牌信息 + `resources/` 图标。保持 VS Code Extension API 100% 兼容。

### 4.2 AI Provider 抽象层

统一多模型抽象。接口：`chatCompletion()` / `codeCompletion()` / `generateEmbedding()` / `listModels()`。
P0: OpenAI, Anthropic, DeepSeek。P1: Ollama, 自定义端点。支持 fallback、热切换、API Key 加密。

### 4.3 智能代码补全

复用 `InlineCompletionsProvider`。FIM 协议 | 防抖 | LRU 缓存 | 前缀复用 | 预取 | 流式 | 即时取消。

### 4.4 AI Chat + Inline Chat

复用 VS Code Chat/InlineChat 框架。多轮对话 | `@` 上下文引用 | Diff 预览 | 模型切换。

### 4.5 上下文管理

按模型 `effectiveInputBudget` 百分比分配预算（固定区 10% + 动态区 75% + 弹性区 15%）。三层压缩（3.1）。工具定义动态加载（4.7）。小上下文自适应。

### 4.6 子 Agent

独立上下文 | 结果精炼摘要(≤2000 Token) | 专业化(CodeSearch/CodeAnalyzer/CodeWriter/TestRunner/WebResearcher/Planner) | 并行执行 | 快速模型优先。

### 4.7 工具体系

核心工具常驻(~8 个) + 索引工具按需加载(`toolSearch`)。MCP 生态为主。自研仅 4 个(smartApplyDiff/codebaseSearch/projectAnalyzer/toolSearch)。

### 4.8 Skills

复用 VS Code `SKILL.md`。按相关度注入 | Skill 索引 | 手动触发 | 预算感知 | Skill+Tool 联动。

### 4.9 本地代码知识引擎

复用 DeepWiki-Open (RAG/FAISS/嵌入) + CodeWiki (AST/依赖图/层级分解)。自研增量编排层(FileWatcher+指纹+增量分派+懒更新)。两阶段集成(MCP→sidecar)。

### 4.10 终端 AI / 设置配置

后续扩展，复用 VS Code 已有能力。

---

## 5. 性能设计

### 5.1 性能预算

| 场景 | 延迟预算 |
|------|---------|
| 代码补全（冷/缓存） | < 800ms / < 50ms |
| Chat TTFT / 渲染 | < 1.5s / ≥ 30fps |
| Agent 单步 / 子 Agent | < 3s / < 30s |
| @codebase 查询 / 增量索引 | < 500ms / < 2s |
| 7x24 单任务周期 | < 5min（典型），自动压缩+恢复无感知 |
| IDE 启动 | 与原版 VS Code 持平 |

### 5.2 性能红线

主线程不执行 AI 操作 | 按键 < 16ms | IDE 启动不变慢 | 内存不失控(中型 ≤1.5GB) | 所有 AI 操作可取消 | **7x24 Agent Token 消耗可预测可控制**

### 5.3 关键优化策略

**补全**：即时取消 | LRU 缓存 | 前缀复用 | 预取 | Worker 线程组装
**Agent**：流式输出 | 增量渲染 | 并行工具 | 检查点增量快照 | 超时熔断
**上下文**：Token 计数缓存 | Tiktoken WASM | Micro-compaction 磁盘卸载 | 摘要异步+缓存
**7x24**：Prompt 缓存(~90%降本) | 模型路由(Worker用便宜模型) | 空闲休眠 | 持久状态免重建
**知识引擎**：独立进程 | 优先级队列 | 增量 FAISS/AST | 嵌入批处理 | 渐进式索引

---

## 6. 非功能性需求

| 类别 | 需求 |
|------|------|
| 安全 | API Key 加密 · 代码不外传 · 分层权限(3.3) · Token 安全保护(3.5) |
| 兼容性 | VS Code 扩展 100% 兼容 · Windows / macOS / Linux |
| 可用性 | 离线模式(Ollama) · AI 不可用不影响编辑 · 7x24 Agent 断线自动恢复 |
| 可维护性 | VS Code 分层架构 · 编码规范 |
| 可观测性 | AI 日志 · 性能埋点 · Token 用量仪表盘 · 7x24 任务进度仪表盘 |

---

## 7. 技术决策

### 复用 vs 自研

| 模块 | 决策 | 来源 |
|------|------|------|
| Chat / InlineChat / Completions / LM API / Tool / MCP / Skills | **复用** | VS Code |
| 文件监视 / Ripgrep / 符号 / Tree-sitter | **复用** | VS Code |
| AST 依赖图 + RAG + FAISS | **复用** | CodeWiki + DeepWiki-Open |
| 文件/Git/Web 工具 | **复用** | MCP 生态 |
| **AI Provider 抽象层** | **自研** | |
| **7x24 自主 Agent (Planner+Worker+Judge)** | **自研** | ⭐ 核心特色 |
| **持久任务状态 + 自主错误恢复** | **自研** | ⭐ 核心特色 |
| **三层上下文压缩 + 按比例预算** | **自研** | 借鉴 Claude Code |
| **Hooks 生命周期** | **自研** | 借鉴 Claude Code |
| **分层权限系统** | **自研** | 借鉴 Claude Code |
| **工具索引 + 子 Agent 增强 + Skill 匹配 + 增量编排层** | **自研** | |
| **品牌定制** | **修改** | product.json |

---

## 8. 实施阶段

```
Week  1-2   Phase 0: 品牌定制 + AI Provider + MCP 预配置 + 分层权限
Week  3-6   Phase 1: 补全 + Chat + InlineChat + 三层上下文压缩 + 工具索引 + Hooks
Week  7-12  Phase 2: 7x24 Agent (Planner+Worker+Judge+持久状态+自主恢复+任务仪表盘)
Week 13-16  Phase 3: 代码知识引擎 (MCP → sidecar + 增量层) + Skills
Week 17-22  Phase 4: 性能优化 + 成本优化 + 测试 + 打包
```

> 注：Phase 2 从 4 周扩展到 6 周，因为 7x24 Agent 是全新核心能力，需要更多时间。

---

## 附录: 术语表

| 术语 | 定义 |
|------|------|
| 7x24 Agent | 以目标驱动的持续自主运行 Agent，不需要用户逐步推动 |
| Planner | 负责目标分解和动态重规划的强模型 Agent |
| Worker | 执行具体任务的快速模型 Agent，独立上下文 |
| Judge | 验证 Worker 产出质量的评审 Agent |
| Task DAG | 有向无环的任务依赖图 |
| Micro-compaction | 大工具输出即时卸载到磁盘的压缩层 |
| FIM | Fill-In-Middle，代码补全协议 |
| MCP | Model Context Protocol |
| Hook | Agent 生命周期事件的自定义回调 |
| Skill | Markdown 领域知识，Agent 内化为行为准则 |
| AISTUDIO.md | 项目级持久上下文文件，每次会话自动加载 |
| effectiveInputBudget | maxInputTokens - maxOutputTokens |

---

> **文档状态**: 待确认。确认后将基于此 Spec 编写系统设计文档。
