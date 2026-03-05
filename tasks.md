# AI IDE 开发任务清单

> 基于 Spec v3.0.0 + System Design v1.0 | 生成日期: 2026-03-05
>
> 总工期: 22 周 (5 个阶段) | 基于 VS Code OSS v1.110.0 fork

---

## 阶段总览

| 阶段 | 周期 | 核心交付 | 依赖 |
|------|------|---------|------|
| Phase 0 | Week 1-2 | 品牌定制 + AI Provider + MCP 预配置 + 分层权限 | 无 |
| Phase 1 | Week 3-6 | 补全 + Chat + InlineChat + 三层上下文压缩 + 工具索引 + Hooks | Phase 0 |
| Phase 2 | Week 7-12 | 7x24 Agent (Planner+Worker+Judge+持久状态+自主恢复+仪表盘) | Phase 0, Phase 1 |
| Phase 3 | Week 13-16 | 代码知识引擎 (MCP → sidecar + 增量层) + Skills | Phase 0, Phase 1 |
| Phase 4 | Week 17-22 | 性能优化 + 成本优化 + 集成测试 + 打包发布 | Phase 0-3 |

---

## Phase 0: 基础设施 (Week 1-2)

### P0-1 品牌定制

- [ ] **P0-1.1** 修改 `product.json` 品牌信息
  - `nameShort` → "AI Studio"
  - `nameLong` → "AI Studio - 7x24 AI IDE"
  - `applicationName` → "ai-studio"
  - `dataFolderName` → ".ai-studio"
  - `urlProtocol` → "ai-studio"
  - `serverApplicationName` → "ai-studio-server"
  - `darwinBundleIdentifier` → "com.example.ai-studio"
  - 新增 `defaultChatAgent`、`recommendedMcpServers`、`aiStudioDefaults` 字段
- [ ] **P0-1.2** 替换 `resources/` 下的图标和品牌资源
  - 替换应用图标（各平台: Windows ICO、macOS ICNS、Linux PNG）
  - 替换欢迎页 Logo、关于页 Logo
  - 替换 Splash Screen（如启用）
- [ ] **P0-1.3** 验证品牌定制后各平台构建通过
  - 验证 `npm run compile` 无错误
  - 验证 `scripts/code.sh` 启动显示新品牌名和图标
  - 验证 Extension API 兼容性不受影响

### P0-2 AI Provider 抽象层

> 位置: `src/vs/platform/aiProvider/`

- [ ] **P0-2.1** 定义核心接口
  - 创建 `src/vs/platform/aiProvider/common/aiProvider.ts`
  - 定义 `IAIProviderService` 接口（`registerProvider` / `chatCompletion` / `codeCompletion` / `generateEmbedding` / `listModels` / `getModelMetadata`）
  - 定义 `IAIProvider` 接口（Provider 实现契约）
  - 定义 `IChatRequest` / `IChatChunk` / `ICodeCompletionRequest` / `ICodeCompletionResponse` / `IEmbeddingRequest` / `IAIModelMetadata` 数据类型
  - 注册 `createDecorator<IAIProviderService>('aiProviderService')`
- [ ] **P0-2.2** 实现 Provider 管理器
  - 创建 `src/vs/platform/aiProvider/common/aiProviderService.ts`
  - 实现 Provider 注册/注销/切换
  - 实现 fallback 机制（主 Provider 不可用时自动切换）
  - 实现 API Key 加密存储（复用 VS Code `SecretStorageService`）
- [ ] **P0-2.3** 实现 OpenAI Provider (P0)
  - 创建 `src/vs/platform/aiProvider/common/providers/openaiProvider.ts`
  - 实现 Chat Completion (流式, GPT-4o/o1/o3)
  - 实现 Code Completion
  - 实现 Embedding (text-embedding-3-small)
  - 实现 Model List
  - AbortSignal 取消支持
- [ ] **P0-2.4** 实现 Anthropic Provider (P0)
  - 创建 `src/vs/platform/aiProvider/common/providers/anthropicProvider.ts`
  - 实现 Chat Completion (流式, Claude Sonnet/Opus)
  - 实现 Prompt 缓存（`cache_control` 字段）
  - AbortSignal 取消支持
- [ ] **P0-2.5** 实现 DeepSeek Provider (P0)
  - 创建 `src/vs/platform/aiProvider/common/providers/deepseekProvider.ts`
  - 实现 Chat Completion + Code Completion
- [ ] **P0-2.6** 实现 Ollama Provider (P1)
  - 创建 `src/vs/platform/aiProvider/common/providers/ollamaProvider.ts`
  - 本地 HTTP API 对接
  - 本地模型列表发现
- [ ] **P0-2.7** 实现 Custom OpenAI Compatible Provider (P1)
  - 创建 `src/vs/platform/aiProvider/common/providers/customOpenAIProvider.ts`
  - 支持任意 OpenAI 兼容端点
- [ ] **P0-2.8** 实现连接池
  - 创建 `src/vs/platform/aiProvider/electron-main/aiProviderConnectionPool.ts`
  - 每个 Provider 维护 HTTP/2 连接
  - 自动重连和健康检查
- [ ] **P0-2.9** Provider 设置 UI
  - Provider 选择下拉框
  - API Key 输入与安全存储
  - 模型选择（Chat / Completion / Agent / SubAgent 各自独立配置）
  - 连接测试按钮
- [ ] **P0-2.10** 单元测试
  - Provider 注册/切换/fallback 测试
  - 各 Provider 请求/响应序列化测试
  - 流式响应正确性测试
  - 取消/超时测试

### P0-3 MCP 预配置

- [ ] **P0-3.1** 在 `product.json` 中配置推荐 MCP Server 列表
  - filesystem / git / fetch / memory
- [ ] **P0-3.2** 首次启动时自动提示安装推荐 MCP Servers
- [ ] **P0-3.3** MCP Server 预启动机制（常用 Server 随 IDE 启动）

### P0-4 分层权限系统

> 位置: `src/vs/platform/aiPermission/`

- [ ] **P0-4.1** 定义权限接口
  - 创建 `src/vs/platform/aiPermission/common/permissionService.ts`
  - 定义 `IPermissionService`（`requestPermission` / `addRule`）
  - 定义 `IPermissionRule`（pattern / decision / scope）
  - 定义四层权限：只读 / 编辑 / 执行 / 危险
- [ ] **P0-4.2** 实现权限评估引擎
  - 评估顺序: deny → ask → allow
  - 支持 specifier 粒度（如 `Bash(npm run *)` / `editFile(src/core/**)` ）
  - 会话内 / 按项目 / 全局 三级持久范围
- [ ] **P0-4.3** 权限确认 UI
  - 弹窗确认交互
  - "始终允许" / "本次允许" / "拒绝" 选项
  - 权限规则管理面板
- [ ] **P0-4.4** 7x24 模式权限适配
  - 全自主模式: 编辑/执行自动允许，仅危险层确认
  - 半自主模式: 阶段结束暂停
  - 监督式模式: 每步确认
- [ ] **P0-4.5** 单元测试
  - 权限评估逻辑测试
  - 规则持久化/恢复测试
  - 模式切换测试

---

## Phase 1: 编辑器 AI 功能 (Week 3-6)

### P1-1 智能代码补全

> 位置: `src/vs/workbench/contrib/aiCompletion/`

- [ ] **P1-1.1** 注册 `InlineCompletionsProvider`
  - 复用 VS Code InlineCompletions API
  - 连接到 `IAIProviderService.codeCompletion()`
- [ ] **P1-1.2** FIM 上下文组装
  - prefix / suffix 提取
  - 相关文件签名注入（import 关系、同模块文件）
  - Token 预算控制
- [ ] **P1-1.3** 性能优化
  - 防抖: 350ms（可配置）
  - LRU 缓存: 最近 N 个补全结果
  - 前缀复用: 已有结果前缀匹配时直接裁剪返回
  - 预取: 接受补全后立即预取下一位置
  - 即时取消: AbortController 在用户继续输入时取消
- [ ] **P1-1.4** 流式渲染 Ghost Text
  - 流式补全结果逐步渲染为 Ghost Text
  - Tab 接受 / Esc 拒绝
- [ ] **P1-1.5** 单元测试 + 集成测试
  - FIM 上下文组装正确性
  - 缓存命中/失效测试
  - 防抖/取消竞态条件测试

### P1-2 AI Chat

- [ ] **P1-2.1** 注册自有 Chat Participant
  - 复用 VS Code Chat 框架
  - 注册 `ai-studio-chat` participant
  - 连接到 `IAIProviderService.chatCompletion()`
- [ ] **P1-2.2** 多轮对话支持
  - 消息历史管理
  - `@` 上下文引用（文件/符号/终端/选区）
  - 模型切换（Chat UI 内切换当前模型）
- [ ] **P1-2.3** Diff 预览
  - Chat 中代码建议自动 Diff 预览
  - Accept / Reject 操作
- [ ] **P1-2.4** 流式渲染
  - Markdown 流式渲染（TTFT < 1.5s, ≥ 30fps）
  - 代码块语法高亮
  - 中间状态（思考中 / 调用工具 / 生成代码）展示

### P1-3 Inline Chat

- [ ] **P1-3.1** 注册 InlineChat Provider
  - 复用 VS Code InlineChat 框架
  - 连接到 AI Provider
- [ ] **P1-3.2** 编辑器内对话
  - 选中代码 → 解释 / 重构 / 修复
  - Diff 预览 + Accept/Reject
- [ ] **P1-3.3** Inline Chat 上下文
  - 自动注入当前文件、选区、相关符号
  - Token 预算控制

### P1-4 上下文管理系统

> 位置: `src/vs/workbench/services/aiContext/`

- [ ] **P1-4.1** 定义 `IContextManagerService` 接口
  - `createWindow()` — 创建上下文窗口
  - `assemblePrompt()` — 按预算分配组装 prompt
  - `microCompact()` / `autoCompact()` / `manualCompact()` — 三层压缩
  - `extractKnowledge()` — 知识块提取
- [ ] **P1-4.2** Token 计数与预算管理
  - 集成 Tiktoken WASM（本地计数，不调用 API）
  - Token 计数 LRU 缓存（内容哈希 → Token 数）
  - 按模型 `effectiveInputBudget` 百分比分配预算
    - 系统提示 3% / 核心工具 3% / 项目摘要 2% / Skills 2%
    - 用户消息 20% / 活跃上下文 30% / 历史 20%
    - 补充信息 5% / 弹性区 15%
  - 小上下文模型自适应（窗口 < 32K 时调整比例）
- [ ] **P1-4.3** Micro-compaction（层 1）
  - 每次工具调用后：大输出（> 阈值）卸载到磁盘，上下文替换为摘要引用
  - 只保留最近 2 次工具结果完整
  - 磁盘存储: `~/.ai-studio/context-cache/`
- [ ] **P1-4.4** Auto-compaction（层 2）
  - 剩余空间 < 安全阈值时自动触发
  - 知识块提取（Focus Agent 论文）: 从交互中提取结构化知识块——事实、决策、模式
  - 历史摘要生成
  - 自问式验证（ProMem 论文）: 摘要后自问"是否遗漏关键信息？""能否基于此继续工作？"
  - 窗口重建: 系统提示 + 核心工具 + 持久上下文 + 知识块 + 验证后摘要 + 当前任务 + 最近工具结果
- [ ] **P1-4.5** Manual /compact（层 3）
  - 用户或 7x24 Agent 主动触发
  - 深度摘要 + 完整状态重建
  - 从持久任务状态恢复（配合 Phase 2 的 TaskStore）
- [ ] **P1-4.6** 知识块持久化
  - 创建 `KnowledgeStore`
  - 知识块跨压缩永久保留
  - 写入 `~/.ai-studio/tasks/{goal-id}/context/learnings.md` 和 `decisions.md`
- [ ] **P1-4.7** 单元测试
  - Token 计数准确性测试
  - 各层压缩正确性测试（压缩前后信息保留度验证）
  - 预算分配边界条件测试
  - 知识块提取和恢复测试

### P1-5 工具索引系统

> 位置: `src/vs/workbench/contrib/aiAgent/common/tools/`

- [ ] **P1-5.1** 实现 ToolIndex
  - 核心工具常驻（~8 个）: editFile / readFile / search / listDirectory / terminal / runSubagent / codebaseSearch / toolSearch
  - 索引工具按需加载: 注册时建立关键词索引
  - `toolSearch` 元工具: TF-IDF 关键词匹配，返回 top-5 候选
- [ ] **P1-5.2** 自研工具实现
  - `smartApplyDiff` — 智能 Diff 应用（模糊匹配 + 冲突检测）
  - `codebaseSearch` — 语义+结构混合搜索（先关键词，后期接知识引擎）
  - `projectAnalyzer` — 项目结构分析（框架/依赖/入口点检测）
  - `toolSearch` — 工具索引搜索
- [ ] **P1-5.3** 工具输出 LLM 友好化（SWE-agent ACI 论文）
  - 所有工具输出格式标准化: 明确反馈 + 精简格式 + 结构化结果
  - 错误消息可操作化: 不只报错，还建议修复方向
- [ ] **P1-5.4** 工具定义动态加载
  - 上下文中仅加载核心工具定义
  - 索引工具定义在 `toolSearch` 匹配后按需注入
  - 节省上下文空间
- [ ] **P1-5.5** 单元测试
  - 工具注册/索引/搜索正确性
  - 动态加载/卸载测试
  - 各自研工具功能测试

### P1-6 Hooks 生命周期系统

> 位置: `src/vs/workbench/services/aiHooks/`

- [ ] **P1-6.1** 定义 `IHooksService` 接口
  - `register(event, hook)` — 注册 Hook
  - `emit(event, context)` — 触发事件
  - 事件类型: SessionStart / SessionEnd / PreToolUse / PostToolUse / PreCompact / SubagentStart / SubagentStop / TaskComplete / GoalComplete
- [ ] **P1-6.2** Hook 执行引擎
  - Shell 命令执行（带超时、环境变量注入）
  - HTTP 端点调用
  - 自定义脚本执行
  - 返回值控制流程: 0=继续 / 2=阻止 / 其他=错误
  - 变量替换: `${file}` / `${toolName}` / `${taskId}` 等
- [ ] **P1-6.3** 配置文件
  - `.ai-studio/hooks.json` 配置格式
  - 条件匹配: `"when": "toolName == 'editFile'"`
  - 配置热重载
- [ ] **P1-6.4** 单元测试
  - Hook 注册/触发/返回值测试
  - Shell/HTTP/Script 各类型执行测试
  - 条件匹配测试
  - 超时和错误处理测试

### P1-7 项目持久上下文 (AISTUDIO.md)

- [ ] **P1-7.1** 实现 AISTUDIO.md 加载机制
  - 项目根目录 `AISTUDIO.md` 自动发现
  - 兼容 `.github/copilot-instructions.md`
  - 每次会话自动加载到固定区（2% 预算）
- [ ] **P1-7.2** 与 Skills 的区分
  - AISTUDIO.md: 全局始终加载的项目规则
  - Skills: 按需匹配的领域知识

### P1-8 Token 安全保护

> 位置: `src/vs/workbench/contrib/aiAgent/common/safety/`

- [ ] **P1-8.1** 写前检查点
  - 每次 `editFile` 前自动创建 Git stash 检查点
- [ ] **P1-8.2** Token 余量预测
  - 每步开始前预估所需 Token
  - 不足时主动触发 Auto-compaction 或暂停
- [ ] **P1-8.3** 多文件原子操作
  - 多文件修改要么全部成功，要么全部回滚
  - 回滚基于 Git stash 检查点
- [ ] **P1-8.4** 优雅降级
  - Token 接近上限: 停止新任务 → 完成当前步骤 → 保存状态 → 暂停
- [ ] **P1-8.5** 单元测试
  - 检查点创建/回滚测试
  - Token 预估准确性测试
  - 原子操作回滚测试

---

## Phase 2: 7x24 自主 Agent (Week 7-12) ⭐ 核心

### P2-1 目标与任务 DAG

> 位置: `src/vs/workbench/contrib/aiAgent/common/`

- [ ] **P2-1.1** 定义目标模型
  - 创建 `goal.ts`: `IGoal` / `IGoalConstraint` 定义
  - 用户自然语言目标 + 可选约束（不改 X 文件、用 Y 框架等）
- [ ] **P2-1.2** 定义 Task DAG 模型
  - 创建 `taskDAG.ts`: `TaskDAG` / `TaskNode` / `TaskEdge`
  - 支持并行和依赖关系
  - 任务状态: pending / running / done / failed / blocked
  - `getNextRunnableTasks(maxConcurrent)` — 获取无依赖的可执行任务
  - `hasRunnableTasks()` — 检查是否还有可执行任务
- [ ] **P2-1.3** 定义运行模式
  - 创建 `agentMode.ts`: FullAuto / SemiAuto / Supervised
  - 各模式下的权限和暂停行为定义
- [ ] **P2-1.4** 单元测试
  - DAG 拓扑排序测试
  - 并行任务提取测试
  - 依赖关系更新测试
  - 状态机转换测试

### P2-2 Planner 模块

> 位置: `src/vs/workbench/contrib/aiAgent/common/planner/`

- [ ] **P2-2.1** 实现 `IPlanner` 接口
  - 创建 `planner.ts`
  - `decompose(goal)` → 生成 Task DAG
  - `needsReplan(dag, results)` → 检查是否需要重规划
  - `replan(dag, results)` → 动态调整 DAG
- [ ] **P2-2.2** 目标分解器
  - 创建 `goalDecomposer.ts`
  - 调用 Planner 强模型将目标分解为具体任务
  - 生成任务间依赖关系（DAG）
  - 为每个任务标注: 预期影响文件、难度评估、测试策略
- [ ] **P2-2.3** 自适应拓扑选择器（AdaptOrch 论文）
  - 创建 `topologySelector.ts`
  - 任务难度评估 (`difficultyEstimator.ts`)
    - 基于: 影响文件数量、模块复杂度、是否有测试覆盖、是否首次接触
  - 信心评估 (`confidenceEstimator.ts`)
  - 拓扑选择逻辑:
    - 简单 + 高信心 → `simple`（单 Worker）
    - 中等 → `standard`（Worker → Judge）
    - 复杂 + 有测试 → `complex`（多 Worker 并行 + 辩论式 Judge）
    - 低信心/探索性 → `exploratory`（MCTS 树搜索）
- [ ] **P2-2.4** 动态重规划器
  - 创建 `dynamicReplanner.ts`
  - 任务失败时: 调整后续依赖任务
  - 发现新信息时: 插入新任务或合并任务
  - 环境变化时: 重评估优先级
- [ ] **P2-2.5** 单元测试
  - 目标分解结果验证
  - 拓扑选择覆盖各分支
  - 重规划正确性测试

### P2-3 Worker 模块

> 位置: `src/vs/workbench/contrib/aiAgent/common/worker/`

- [ ] **P2-3.1** 实现 `IWorker` 接口
  - 创建 `worker.ts`
  - 独立上下文窗口（不继承主 Agent 历史）
  - Tool-Use 循环执行
  - AbortSignal 取消支持
- [ ] **P2-3.2** Worker Pool
  - 创建 `workerPool.ts`
  - 并行执行无依赖任务（最多 N 个 Worker，可配置）
  - Worker 生命周期管理（创建/执行/清理）
  - Worker 资源限制（单 Worker 最大 Token 消耗）
- [ ] **P2-3.3** Worker 上下文管理
  - 创建 `workerContext.ts`
  - 从主上下文继承: 项目摘要 + AISTUDIO.md + 核心工具
  - 注入: 当前任务描述 + 相关知识块 + 相关文件
  - 不继承: 主 Agent 对话历史
- [ ] **P2-3.4** 预测性纠错（ReCAPA 论文）
  - 创建 `predictiveCheck.ts`
  - Worker 执行前: 分析风险点（依赖文件、影响范围）
  - 预测最可能的失败模式
  - 设置针对性验证检查
  - 主动预防而非被动修复
- [ ] **P2-3.5** 单元测试
  - Worker 独立上下文隔离测试
  - Worker Pool 并行执行测试
  - 预测性纠错准确性测试

### P2-4 Judge 模块

> 位置: `src/vs/workbench/contrib/aiAgent/common/judge/`

- [ ] **P2-4.1** 实现 `IJudge` 接口
  - 创建 `judge.ts`
  - 综合评审: build + test + lint + 代码审查 + 安全扫描
- [ ] **P2-4.2** Build 验证器
  - 创建 `buildVerifier.ts`
  - 自动运行编译（检测项目类型: TypeScript/Rust/Go 等）
  - 自动运行测试（检测测试框架: Mocha/Jest/pytest 等）
  - 自动运行 lint
- [ ] **P2-4.3** 代码审查器
  - 创建 `codeReviewer.ts`
  - 调用 Judge 模型审查代码质量
  - 输出: 通过 / 需修改（附修改建议）
- [ ] **P2-4.4** 代码安全扫描（LlamaFirewall 论文）
  - 创建 `securityScanner.ts`
  - Agent 生成的代码在 apply 前自动静态分析
  - 检测危险模式（硬编码密钥、SQL 注入、路径穿越等）
- [ ] **P2-4.5** 辩论式评审（SWE-Debate 论文）
  - 创建 `debateJudge.ts`
  - 复杂任务: 多个 Judge 实例从不同视角评审
  - 综合多视角结论得出最终判定
- [ ] **P2-4.6** 单元测试
  - 各验证器独立测试
  - 辩论式评审多视角综合测试

### P2-5 MCTS 树搜索

> 位置: `src/vs/workbench/contrib/aiAgent/common/mcts/`

- [ ] **P2-5.1** MCTS Explorer（SWE-Search 论文）
  - 创建 `mctsExplorer.ts`
  - 对低信心任务并行探索多个方案分支
  - 每个分支: 修改 → 编译 → 测试 → 评分
  - 选择最高分方案
  - 失败分支自动回溯（Git 检查点）
- [ ] **P2-5.2** 方案评分器
  - 创建 `valueEstimator.ts`
  - 评分维度: build 通过 / 测试通过率 / lint 得分 / 代码质量 / 影响范围
  - 调用 Value Agent（轻量模型）进行快速评估
- [ ] **P2-5.3** 分支管理器
  - 创建 `branchManager.ts`
  - Git worktree 或 stash 管理探索分支
  - 最优分支合入主线
  - 清理非最优分支
- [ ] **P2-5.4** 单元测试
  - 多分支并行探索测试
  - 评分一致性测试
  - 回溯正确性测试

### P2-6 多层反思

> 位置: `src/vs/workbench/contrib/aiAgent/common/reflection/`

- [ ] **P2-6.1** 动作级反思（ReCAPA 论文）
  - 创建 `actionReflection.ts`
  - 每步工具调用后检查结果
  - 异常时: 生成 2-3 个替代动作 → 评估 → 选最佳
- [ ] **P2-6.2** 任务级反思（Reflective Planning 论文）
  - 创建 `taskReflection.ts`
  - 每个任务完成后: Judge 评审 → 与预期对比
  - 调整后续任务计划
  - 学到的知识写入 `learnings.md`
- [ ] **P2-6.3** 目标级反思（FCRF 论文）
  - 创建 `goalReflection.ts`
  - 定期/阶段完成时: 回顾整体进展
  - 评估: 当前方案是否仍是最优路径？
  - 是否需要重大重规划？
- [ ] **P2-6.4** 单元测试
  - 各层反思触发条件测试
  - 替代动作生成和评估测试
  - 知识块提取测试

### P2-7 持久任务状态

> 位置: `src/vs/workbench/services/aiTask/` + `src/vs/workbench/contrib/aiAgent/common/persistence/`

- [ ] **P2-7.1** 实现 `ITaskPersistenceService`
  - 创建 `src/vs/workbench/services/aiTask/common/taskStore.ts`
  - 目标管理: `saveGoal` / `getGoal` / `listGoals`
  - 计划管理: `savePlan` / `getPlan`
  - 进度更新: `updateProgress` / `getProgress`
  - 知识块: `saveKnowledge` / `getKnowledge`
  - 恢复: `recoverFromDisk`
- [ ] **P2-7.2** 持久化存储
  - 存储路径: `~/.ai-studio/tasks/{goal-id}/`
  - 目录结构:
    - `goal.json` — 用户原始目标 + 约束
    - `plan.json` — 当前任务 DAG
    - `progress.json` — 各任务状态
    - `checkpoints/` — Git 快照 (task-001.patch 等)
    - `context/` — project-summary.md / decisions.md / learnings.md
    - `logs/{timestamp}.jsonl` — 执行日志
    - `notifications/` — 待发送通知
  - 逐步追加写入（避免大文件覆盖）
- [ ] **P2-7.3** Git 检查点管理
  - 创建 `checkpointManager.ts`
  - 每个任务完成时创建检查点
  - 支持任意回滚
  - 增量快照（patch 格式，非全量）
- [ ] **P2-7.4** 断点恢复
  - 创建 `recoveryManager.ts`
  - IDE 重启后: 从磁盘恢复任务状态
  - 自动恢复到最近检查点
  - 重建上下文（从持久知识块 + 任务摘要）
- [ ] **P2-7.5** 单元测试
  - 状态持久化/恢复测试
  - 检查点创建/回滚测试
  - 断点恢复完整性测试

### P2-8 自主错误恢复

- [ ] **P2-8.1** 错误分类与策略路由
  - 编译错误 → 分析 → 修复 → 重编译（最多 3 次）
  - 测试失败 → 分析失败测试 → 修复 → 重跑（最多 3 次）
  - 合并冲突 → 分析 → 自动解决简单冲突
  - API 限流 → 指数退避 → 切换 fallback 模型
  - Token 耗尽 → 压缩上下文 → 降级模型
  - 需求歧义 → 按最合理假设继续 → 标记需审查
  - 探索性失败 → MCTS 回溯 → 尝试替代分支
  - 未知错误 → 回滚检查点 → 尝试替代方案
- [ ] **P2-8.2** 人类介入判定
  - 自主恢复 3 次失败: 暂停
  - 复杂语义冲突: 暂停
  - 所有 Provider 不可用: 暂停
  - 预算硬上限已达: 暂停
  - 多个同等合理的选择: 暂停
  - 所有 MCTS 分支都失败: 暂停
- [ ] **P2-8.3** 单元测试
  - 各错误类型恢复路径测试
  - 重试次数限制测试
  - 人类介入条件触发测试

### P2-9 通知系统

> 位置: `src/vs/workbench/contrib/aiAgent/common/notification/`

- [ ] **P2-9.1** IDE 内通知
  - 创建 `notificationService.ts`
  - 复用 VS Code `INotificationService`
  - 通知场景: 自主恢复失败 / 需要决策 / 阶段完成 / 预算警告 / 目标完成
- [ ] **P2-9.2** 系统通知
  - 桌面系统通知（用户不在 IDE 时）
- [ ] **P2-9.3** 可选外部通知
  - 创建 `notificationChannel.ts`
  - 邮件通知（SMTP 配置）
  - Slack Webhook 通知
  - 配置: `.ai-studio/notifications.json`
- [ ] **P2-9.4** 单元测试

### P2-10 Agent Controller 主循环

- [ ] **P2-10.1** 实现 `AgentController`
  - 创建 `src/vs/workbench/contrib/aiAgent/common/aiAgent.ts`
  - `executeGoal(goal)` — 完整主循环:
    1. 持久化目标
    2. Planner 分解
    3. 主循环: 选任务 → 选拓扑 → 并行执行 → 反思 → 持久化 → 检查重规划 → 检查暂停 → 压缩
    4. 目标完成通知
  - 空闲休眠: 无待执行任务时停止 LLM 调用
- [ ] **P2-10.2** IAgentService 注册
  - 注册为 VS Code Contribution
  - 依赖注入: 连接 Planner / WorkerPool / Judge / MCTS / Reflection / Persistence / Context / ModelRouter / Hooks / Notification
- [ ] **P2-10.3** 集成测试
  - 端到端: 简单目标 → 分解 → 执行 → 验证 → 完成
  - 错误恢复: 注入错误 → 自动恢复 → 回滚
  - 持久化: 中断 → 恢复 → 继续

### P2-11 7x24 Agent UI

> 位置: `src/vs/workbench/contrib/aiAgent/browser/`

- [ ] **P2-11.1** 目标输入 Widget
  - 创建 `goalInputWidget.ts`
  - 自然语言输入框
  - 约束添加 UI（不改 X / 用 Y 框架）
  - 模式选择（全自主 / 半自主 / 监督式）
  - 预算设置（Token 上限）
- [ ] **P2-11.2** 任务 DAG 可视化
  - 创建 `taskDAGView.ts`
  - DAG 图形渲染（节点 = 任务，边 = 依赖）
  - 实时状态着色（pending=灰 / running=蓝 / done=绿 / failed=红 / blocked=黄）
  - 点击节点查看详情（日志 / Diff / 耗时 / Token 用量）
- [ ] **P2-11.3** 操作时间线
  - 创建 `agentTimeline.ts`
  - 时间线视图: 每步操作 + 工具调用 + 结果
  - 可展开/折叠
  - 搜索/过滤
- [ ] **P2-11.4** Diff 审查面板
  - 创建 `diffReviewPanel.ts`
  - 多文件 Diff 汇总
  - 逐文件 Accept / Reject
  - 批量 Accept All
- [ ] **P2-11.5** 检查点管理面板
  - 创建 `checkpointPanel.ts`
  - 检查点列表（时间 / 任务 / 变更摘要）
  - 回滚到指定检查点
  - Diff 对比两个检查点
- [ ] **P2-11.6** 用量仪表盘
  - 创建 `costDashboard.ts`
  - 实时 Token 用量（按任务 / 模型 / 步骤细分）
  - 费用估算
  - 预算进度条（80% 警告线 / 100% 暂停线）
- [ ] **P2-11.7** 状态栏指示
  - 创建 `agentStatusBar.ts`
  - 状态栏显示: 运行中 / 暂停 / 完成 / 错误
  - 当前任务名
  - Token 用量简要
  - 点击打开仪表盘

### P2-12 成本控制

> 位置: `src/vs/workbench/contrib/aiAgent/common/cost/` + `src/vs/platform/modelRouter/`

- [ ] **P2-12.1** 逐步模型路由（RouteLLM/CASTER 论文）
  - 创建 `src/vs/platform/modelRouter/common/modelRouter.ts`
  - 实现 `IModelRouterService.selectModel(context)`
  - 路由策略:
    - Planner / Judge → 强模型
    - 简单任务 Worker → 便宜模型
    - 复杂任务 Worker → 强模型
    - 中等任务 → 平衡模型
    - 预算不足 → 强制便宜模型
- [ ] **P2-12.2** 预算追踪
  - 创建 `budgetTracker.ts`
  - 实时统计 Token 用量（按目标 / 任务 / 步骤 / 模型）
  - 80% 预算通知
  - 100% 预算暂停
- [ ] **P2-12.3** 成本预估
  - 创建 `costEstimator.ts`
  - 每步开始前预估所需 Token 和费用
  - 基于历史数据学习预估准确性
- [ ] **P2-12.4** 预算感知执行（Budget-Aware Routing 论文）
  - 接近预算时: 降级模型 → 减少探索 → 只做高信心任务
  - 实现渐进降级策略
- [ ] **P2-12.5** Prompt 缓存利用
  - 系统提示 / 工具定义 / 项目摘要 走 Provider 原生缓存
  - Anthropic: `cache_control` 字段
  - OpenAI: 自动前缀缓存
  - 预期节省 ~90% 固定区成本
- [ ] **P2-12.6** 结构化输出优化
  - 优先使用结构化输出（JSON Schema）而非自由文本
  - 输出 Token 比输入贵 3-8x
  - 预期节省 ~30% 输出成本
- [ ] **P2-12.7** 单元测试
  - 模型路由各分支测试
  - 预算追踪准确性测试
  - 降级策略正确性测试

---

## Phase 3: 代码知识引擎 + Skills (Week 13-16)

### P3-1 TypeScript 增量编排层

> 位置: `src/vs/workbench/services/aiKnowledge/`

- [ ] **P3-1.1** 定义 `ICodebaseKnowledgeService` 接口
  - `semanticSearch(query, topK)` → 语义搜索（路由到 DeepWiki RAG）
  - `structureQuery(query)` → 结构查询（路由到 CodeWiki 依赖图）
  - `getProjectSummary()` → 项目摘要
  - `getIndexStatus()` → 索引状态
- [ ] **P3-1.2** 增量编排器
  - 创建 `IncrementalOrchestrator`
  - 监听文件变更（复用 VS Code `IFileSystemWatcher`）
  - 500ms 防抖
  - 过滤: .gitignore + 内容指纹比对（跳过未实际变化的文件）
  - 分派变更到 Python Sidecar
- [ ] **P3-1.3** Sidecar 通信
  - JSON-RPC over stdio（同 LSP 模式）
  - 方法: initialize / incrementalIndex / semanticSearch / structureQuery / getProjectSummary / getIndexStatus / shutdown
  - 连接管理: 自动启动 / 健康检查 / 崩溃重启
- [ ] **P3-1.4** 优先级队列
  - 当前编辑文件优先索引
  - 打开的文件其次
  - 其余文件后台渐进式索引
- [ ] **P3-1.5** 单元测试
  - 增量变更检测测试
  - 防抖和过滤测试
  - Sidecar 通信协议测试

### P3-2 Python Sidecar（知识引擎）

- [ ] **P3-2.1** DeepWiki-Open 模块集成
  - RAG 管道配置
  - FAISS 向量索引
  - Embedding 生成（调用 AI Provider 或本地模型）
  - 增量更新: 只重新索引变更文件
- [ ] **P3-2.2** CodeWiki 模块集成
  - AST 解析（多语言: TypeScript / Python / Go / Rust / Java）
  - 依赖图构建
  - 层级分解（模块 → 类 → 方法）
  - 增量更新
- [ ] **P3-2.3** 项目摘要生成
  - 基于 AST + RAG 自动生成项目摘要
  - 缓存 + 增量更新
- [ ] **P3-2.4** 性能优化
  - 独立进程（不影响 IDE 性能）
  - 嵌入批处理
  - 增量 FAISS / AST
  - 渐进式索引（不阻塞首次启动）
- [ ] **P3-2.5** 集成测试
  - 端到端语义搜索正确性
  - 增量索引一致性
  - 性能基准测试

### P3-3 两阶段集成

- [ ] **P3-3.1** Phase 1: MCP 协议集成（首选）
  - 将知识引擎包装为 MCP Server
  - 通过 MCP 协议与 IDE 通信
  - 优点: 低侵入、松耦合
- [ ] **P3-3.2** Phase 2: Sidecar 直连（性能优化）
  - 高频操作（补全上下文、实时搜索）切换为 JSON-RPC 直连
  - 减少 MCP 协议开销
  - 保留 MCP 接口作为外部访问方式

### P3-4 Skills 系统增强

> 位置: `src/vs/workbench/contrib/aiAgent/common/skills/`

- [ ] **P3-4.1** Skill 匹配器
  - 创建 `SkillMatcher`
  - 为当前请求匹配最相关的 Skills
  - 关键词 + 标签匹配
  - 按预算裁剪（Skills 预算 2%）
- [ ] **P3-4.2** Skill 索引
  - 所有 `SKILL.md` 文件建立关键词索引
  - 支持快速检索
- [ ] **P3-4.3** 手动触发
  - 用户可通过 `@skill:name` 显式引用 Skill
- [ ] **P3-4.4** Skill + Tool 联动
  - Skill 可声明关联工具
  - 匹配 Skill 时自动加载关联工具
- [ ] **P3-4.5** 单元测试
  - 匹配准确性测试
  - 预算裁剪测试

### P3-5 子 Agent 增强

- [ ] **P3-5.1** 增强 `RunSubagentTool`
  - 独立上下文窗口
  - 结果摘要化（≤ 2000 Token）
  - 产出物（文件修改）直通主 Agent
  - 上下文完成后立即释放
- [ ] **P3-5.2** 专业化子 Agent 角色
  - CodeSearch: 代码搜索专家
  - CodeAnalyzer: 代码分析专家
  - CodeWriter: 代码编写专家
  - TestRunner: 测试执行专家
  - WebResearcher: Web 搜索专家
  - Planner: 规划子任务
- [ ] **P3-5.3** 并行执行
  - 无依赖子 Agent 并行执行
  - 快速模型优先（子 Agent 默认使用便宜模型）
- [ ] **P3-5.4** 单元测试
  - 独立上下文隔离测试
  - 摘要质量测试
  - 并行执行测试

---

## Phase 4: 优化与发布 (Week 17-22)

### P4-1 性能优化

- [ ] **P4-1.1** 代码补全性能
  - 冷启动 < 800ms / 缓存命中 < 50ms
  - 即时取消（按键后立即 abort）
  - Worker 线程组装 FIM 上下文（不阻塞主线程）
- [ ] **P4-1.2** Chat 性能
  - TTFT < 1.5s
  - Markdown 渲染 ≥ 30fps
  - 流式输出 + 增量渲染
- [ ] **P4-1.3** Agent 性能
  - 单步 < 3s / 子 Agent < 30s
  - 并行工具调用
  - 检查点增量快照
  - 超时熔断
- [ ] **P4-1.4** 知识引擎性能
  - @codebase 查询 < 500ms
  - 增量索引 < 2s
  - 独立进程不影响 IDE 性能
- [ ] **P4-1.5** IDE 启动性能
  - AI 功能不延迟 IDE 启动
  - 懒加载: 知识引擎 / MCP Servers / Agent 进程按需启动
  - 内存控制: 中型项目 ≤ 1.5GB
- [ ] **P4-1.6** 性能红线验证
  - 主线程不执行 AI 操作
  - 按键响应 < 16ms
  - 所有 AI 操作可取消
- [ ] **P4-1.7** 性能基准测试套件
  - 自动化性能基准测试
  - CI 集成: 每次构建运行性能回归测试

### P4-2 安全增强

- [ ] **P4-2.1** 推理链审计（LlamaFirewall 论文）
  - 检查 Agent 推理过程是否偏离任务目标
  - 防止 Prompt 注入导致的偏离
- [ ] **P4-2.2** API Key 安全审计
  - 代码不外传验证
  - Key 传输/存储加密验证
- [ ] **P4-2.3** 权限系统渗透测试
  - 验证 deny → ask → allow 评估顺序
  - 验证各模式权限边界
- [ ] **P4-2.4** 行为模式学习（AgentGuardian 论文, 远期）
  - 从正常使用模式中学习合理操作范围
  - 异常操作自动拦截

### P4-3 集成测试

- [ ] **P4-3.1** 端到端 Agent 测试
  - 简单目标: 分解 → 执行 → 验证 → 完成
  - 复杂目标: 多任务 DAG → 并行执行 → 重规划 → 完成
  - 探索性目标: MCTS 探索 → 回溯 → 最优方案
- [ ] **P4-3.2** 错误恢复测试
  - 编译错误自主修复
  - 测试失败自主修复
  - Token 耗尽优雅降级
  - IDE 重启后恢复
- [ ] **P4-3.3** 多 Provider 测试
  - OpenAI / Anthropic / DeepSeek / Ollama 各 Provider 集成
  - Fallback 切换
  - Prompt 缓存生效验证
- [ ] **P4-3.4** 压力测试
  - 长时间运行（模拟 24h+ Agent）
  - 大量文件修改
  - 大上下文窗口
  - 并发 Worker 数量极限
- [ ] **P4-3.5** 兼容性测试
  - VS Code 扩展 100% 兼容验证
  - 抽样测试 Top 50 热门扩展
  - Windows / macOS / Linux 三平台验证

### P4-4 文档与用户引导

- [ ] **P4-4.1** 用户文档
  - 快速开始指南
  - AI Provider 配置指南
  - 7x24 Agent 使用指南
  - AISTUDIO.md 编写指南
  - Hooks 配置指南
  - 知识引擎配置指南
- [ ] **P4-4.2** 开发者文档
  - 架构概述
  - API 参考
  - 扩展开发指南
  - 贡献指南
- [ ] **P4-4.3** 首次使用引导
  - 欢迎页: AI 功能介绍 + 快速配置
  - Provider 配置向导
  - 示例目标模板

### P4-5 打包与发布

- [ ] **P4-5.1** 构建流水线
  - Windows (x64/arm64): NSIS 安装包 + ZIP
  - macOS (x64/arm64): DMG + ZIP
  - Linux (x64/arm64): DEB + RPM + AppImage + Snap
  - Web: 静态资源包
- [ ] **P4-5.2** CI/CD
  - 自动构建 + 测试 + 发布
  - 版本号管理
  - 更新通道（Stable / Insiders）
- [ ] **P4-5.3** 自动更新
  - 复用 VS Code 自动更新框架
  - 更新服务器配置

---

## 需求追溯矩阵

| 需求编号 | 需求 | 对应任务 |
|---------|------|---------|
| FR-AUTO-01 | 目标定义 | P2-1.1, P2-11.1 |
| FR-AUTO-02 | 自动分解 | P2-2.2 |
| FR-AUTO-03 | 持续执行 | P2-10.1 |
| FR-AUTO-04 | 自验证 | P2-4.1, P2-4.2 |
| FR-AUTO-05 | 自主错误恢复 | P2-8.1, P2-6.1 |
| FR-AUTO-06 | 检查点 | P2-7.3 |
| FR-AUTO-07 | 持久状态 | P2-7.1, P2-7.2, P2-7.4 |
| FR-AUTO-08 | 异步通知 | P2-9.1, P2-9.2, P2-9.3 |
| FR-AUTO-09 | 人机暂停 | P2-8.2 |
| FR-AUTO-10 | 三种模式 | P2-1.3, P0-4.4 |
| FR-AUTO-11 | 预算控制 | P2-12.1, P2-12.2, P2-12.4 |
| FR-AUTO-12 | 进度仪表盘 | P2-11.2, P2-11.3, P2-11.6 |
| FR-AUTO-13 | 并行 Worker | P2-3.2 |
| FR-AUTO-14 | 动态重规划 | P2-2.4 |

---

## 论文-设计映射

| 论文 | 影响的任务 |
|------|-----------|
| AgentConductor / AdaptOrch | P2-2.3 自适应拓扑选择 |
| SWE-Search (MCTS) | P2-5 MCTS 树搜索 |
| SWE-Debate | P2-4.5 辩论式评审 |
| Reflective Planning | P2-6.2 任务级反思 |
| FCRF | P2-6.3 目标级反思 |
| ReCAPA | P2-3.4 预测性纠错, P2-6.1 动作级反思 |
| Focus Agent | P1-4.4 知识块提取, P1-4.6 知识块持久化 |
| ProMem | P1-4.4 自问式摘要验证 |
| CMV | P1-4.4 DAG 式上下文（内部实现参考） |
| Context Folding | P3-5.1 子 Agent 摘要设计验证 |
| RouteLLM / CASTER | P2-12.1 逐步模型路由 |
| Budget-Aware Routing | P2-12.4 预算感知执行 |
| LlamaFirewall | P2-4.4 代码安全扫描, P4-2.1 推理链审计 |
| AGENTSAFE | P0-4 分层权限 |
| AgentGuardian | P4-2.4 行为模式学习 |
| SWE-agent ACI | P1-5.3 工具输出 LLM 友好化 |
| KLong | P2-10 7x24 长时间运行参考 |

---

> **文档状态**: 初版生成，待团队评审确认后开始执行。
