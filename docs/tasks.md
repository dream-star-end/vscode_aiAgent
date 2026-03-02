# AI IDE 开发任务清单

> 基于 Spec v3.1.0 + System Design v1.1.0 | 创建日期: 2026-03-02
>
> **规则**：开发严格按此文件推进，每完成一个任务立即更新状态。

---

## 状态说明

| 状态 | 含义 |
|------|------|
| `[ ]` | 待开始 |
| `[~]` | 进行中 |
| `[x]` | 已完成 |
| `[-]` | 已取消/跳过 |
| `[!]` | 阻塞中（需注明原因） |

---

## Phase 0: 基础设施 (Week 1-2)

### P0-1: 品牌定制

| ID | 任务 | 状态 | 依赖 | 验收标准 |
|----|------|------|------|---------|
| P0-1-1 | 修改 `product.json` 品牌信息（nameShort/nameLong/applicationName/dataFolderName/urlProtocol 等） | `[x]` | 无 | 编译通过，启动后标题栏和 About 显示新品牌名 |
| P0-1-2 | 替换 `resources/` 图标（应用图标/文件类型图标/托盘图标） | `[!]` 需要设计资源 | P0-1-1 | 所有平台图标正确显示 |
| P0-1-3 | 更新打包脚本中的品牌引用（`build/` 下的 gulp 任务） | `[x]` | P0-1-1 | `npm run compile` 通过 |
| P0-1-4 | 确保 VS Code Extension API 100% 兼容性（运行 vscode-api-tests） | `[x]` | P0-1-1 | `npm run test-extension` 通过 |

### P0-2: AI Provider 抽象层

| ID | 任务 | 状态 | 依赖 | 验收标准 |
|----|------|------|------|---------|
| P0-2-1 | 定义 `IAIProviderService` 接口（`src/vs/platform/aiProvider/common/aiProvider.ts`） | `[x]` | 无 | 接口包含 chatCompletion/codeCompletion/codeCompletionStream/generateEmbedding/generateEmbeddings/listModels/getModelMetadata |
| P0-2-2 | 定义 `IAIProvider` / `IChatRequest` / `IAIModelMetadata` 等类型 | `[x]` | P0-2-1 | TypeScript 编译通过 |
| P0-2-3 | 实现 `OpenAIProvider`（GPT-4o, o1, o3） | `[x]` | P0-2-2 | chatCompletion 流式返回正常，可列出模型 |
| P0-2-4 | 实现 `AnthropicProvider`（Claude Sonnet, Opus），含 Prompt 缓存支持 | `[x]` | P0-2-2 | cache_control 字段正确发送，缓存命中可验证 |
| P0-2-5 | 实现 `DeepSeekProvider` | `[x]` | P0-2-2 | chatCompletion + codeCompletion 正常 |
| P0-2-6 | 实现 `GeminiProvider`（Gemini Pro/Flash） | `[x]` | P0-2-2 | chatCompletion 正常，长上下文支持验证 |
| P0-2-7 | 实现 `OllamaProvider`（本地模型） | `[x]` | P0-2-2 | 本地 Ollama 实例可连接并推理 |
| P0-2-8 | 实现 `CustomOpenAIProvider`（兼容端点） | `[x]` | P0-2-2 | 可配置自定义 baseURL 和 API Key |
| P0-2-9 | 实现 `AIProviderConnectionPool`（HTTP/2 连接池 + Prompt 缓存） | `[x]` | P0-2-3 | 连接复用验证，缓存命中率可观测 |
| P0-2-10 | Provider 设置 UI（API Key 配置/模型选择/Provider 切换） | `[x]` | P0-2-3 | 设置面板可配置所有 Provider 参数 |
| P0-2-11 | Provider fallback 和热切换逻辑 | `[x]` | P0-2-3 | Provider 故障时自动切换到 fallback |
| P0-2-12 | API Key 加密存储（使用 VS Code SecretStorage） | `[x]` | P0-2-10 | Key 不以明文存储，重启后可恢复 |

### P0-3: 分层权限系统

| ID | 任务 | 状态 | 依赖 | 验收标准 |
|----|------|------|------|---------|
| P0-3-1 | 定义 `IPermissionService` 接口（`src/vs/platform/aiPermission/`） | `[x]` | 无 | 接口包含 requestPermission/addRule |
| P0-3-2 | 实现四层权限（只读/编辑/执行/危险）+ deny→ask→allow 评估链 | `[x]` | P0-3-1 | 各层默认行为正确 |
| P0-3-3 | 实现 specifier 粒度匹配（如 `Bash(npm run *)`） | `[x]` | P0-3-2 | 模式匹配正确 |
| P0-3-4 | 实现持久化范围（会话/项目/全局） | `[x]` | P0-3-2 | 重启后项目级权限保留 |
| P0-3-5 | 权限确认 UI（弹窗 + 记住选择） | `[x]` | P0-3-2 | 用户可确认/拒绝/始终允许 |

### P0-4: MCP 预配置

| ID | 任务 | 状态 | 依赖 | 验收标准 |
|----|------|------|------|---------|
| P0-4-1 | 在 `product.json` 中配置推荐 MCP Server 列表 | `[x]` | P0-1-1 | filesystem/git/fetch Server 可自动发现 |
| P0-4-2 | 实现 MCP Server 预启动（首次使用时自动安装） | `[x]` | P0-4-1 | 用户无需手动配置即可使用基础 MCP 工具 |

---

## Phase 1: 编辑体验 (Week 3-6)

### P1-1: 智能代码补全

| ID | 任务 | 状态 | 依赖 | 验收标准 |
|----|------|------|------|---------|
| P1-1-1 | 注册 `InlineCompletionsProvider`，接入 AI Provider 的 `codeCompletion` | `[x]` | P0-2-5 | 输入代码时出现补全建议 |
| P1-1-2 | 实现 FIM 协议上下文组装（prefix + suffix + 相关文件签名） | `[x]` | P1-1-1 | 跨文件上下文正确组装 |
| P1-1-3 | 实现防抖（350ms）+ 即时取消（AbortController） | `[x]` | P1-1-1 | 快速输入不触发多余请求，切换行取消上次请求 |
| P1-1-4 | 实现 LRU 缓存 + 前缀复用 | `[x]` | P1-1-1 | 相同前缀命中缓存，延迟 < 50ms |
| P1-1-5 | 实现预取（Tab 接受后预取下一位置） | `[x]` | P1-1-4 | 接受补全后下一次补全延迟降低 |
| P1-1-6 | 流式补全支持（`codeCompletionStream`） | `[x]` | P1-1-1 | 多行补全逐步出现 |
| P1-1-7 | 补全设置（启用/禁用/模型选择/延迟调整） | `[x]` | P1-1-1 | 设置面板可配置 |

### P1-2: AI Chat

| ID | 任务 | 状态 | 依赖 | 验收标准 |
|----|------|------|------|---------|
| P1-2-1 | 注册 Chat Participant，接入 AI Provider 的 `chatCompletion` | `[x]` | P0-2-1 | Chat 面板可与 AI 对话 |
| P1-2-2 | 实现多轮对话上下文管理 | `[x]` | P1-2-1 | 多轮对话保持上下文 |
| P1-2-3 | 实现 `@` 上下文引用（@file / @selection / @workspace） | `[x]` | P1-2-1 | @ 引用正确注入上下文 |
| P1-2-4 | 实现模型切换（Chat 中切换 Provider/模型） | `[x]` | P1-2-1 | 切换后立即生效 |
| P1-2-5 | 实现 Diff 预览（代码修改建议以 Diff 形式展示） | `[x]` | P1-2-1 | 用户可预览并接受/拒绝 |

### P1-3: Inline Chat

| ID | 任务 | 状态 | 依赖 | 验收标准 |
|----|------|------|------|---------|
| P1-3-1 | 注册 InlineChat Provider | `[x]` | P0-2-1 | 选中代码后可调出 Inline Chat |
| P1-3-2 | 实现选中代码 + 指令 → Diff 预览 → 接受/拒绝流程 | `[x]` | P1-3-1 | 完整编辑流程可用 |

### P1-4: 三层上下文压缩

| ID | 任务 | 状态 | 依赖 | 验收标准 |
|----|------|------|------|---------|
| P1-4-1 | 定义 `IContextManagerService` 接口 | `[x]` | 无 | 接口包含 createWindow/assemblePrompt/microCompact/autoCompact/manualCompact/extractKnowledge |
| P1-4-2 | 实现 `ContextWindowConfig` 和 `IBudgetAllocation` 预算分配 | `[x]` | P1-4-1 | 8 区预算分配总和为 100% |
| P1-4-3 | 实现 `TokenBudgetManager`（Tiktoken WASM + LRU 缓存） | `[x]` | P1-4-1 | Token 计数准确，缓存命中率 > 80% |
| P1-4-4 | 实现 Micro-compaction（大工具输出卸载到磁盘） | `[x]` | P1-4-3 | 大输出自动卸载，上下文只保留摘要 |
| P1-4-5 | 实现 Auto-compaction（知识块提取 + 自问式摘要验证） | `[x]` | P1-4-4, P0-2-1 | 压缩后关键信息不丢失 |
| P1-4-6 | 实现 Manual compact（深度摘要 + 从持久状态恢复） | `[x]` | P1-4-5 | `/compact` 命令可用 |
| P1-4-7 | 实现知识块提取和持久化 | `[x]` | P1-4-5 | 知识块写入 `learnings.md` 和 `decisions.md` |

### P1-5: 工具系统

| ID | 任务 | 状态 | 依赖 | 验收标准 |
|----|------|------|------|---------|
| P1-5-1 | 实现 `ToolIndex`（核心工具注册 + 索引工具 TF-IDF 搜索） | `[x]` | 无 | 10 个核心工具注册，`toolSearch` 返回相关工具 |
| P1-5-2 | 自研 `smartApplyDiff`（智能差异应用工具） | `[x]` | P1-5-1 | 支持模糊匹配的代码修改 |
| P1-5-3 | 自研 `codebaseSearch`（语义代码搜索工具） | `[x]` | P1-5-1 | 语义搜索返回相关代码片段 |
| P1-5-4 | 自研 `projectAnalyzer`（项目结构分析工具） | `[x]` | P1-5-1 | 返回项目结构/依赖/技术栈分析 |
| P1-5-5 | 实现工具输出 LLM 友好化（SWE-agent ACI 原则） | `[x]` | P1-5-1 | 工具输出格式简洁、反馈明确 |

### P1-6: Hooks 生命周期

| ID | 任务 | 状态 | 依赖 | 验收标准 |
|----|------|------|------|---------|
| P1-6-1 | 定义 `IHooksService` 接口 + `HookEvent` 类型 | `[x]` | 无 | 接口包含 register/emit，支持 7 种事件 |
| P1-6-2 | 实现 Shell/HTTP/Script 三种 Hook 类型 | `[x]` | P1-6-1 | Shell Hook 可执行命令并返回结果 |
| P1-6-3 | 实现 `when` 表达式（复用 VS Code contextkey 引擎） | `[x]` | P1-6-1 | `toolName == 'editFile'` 等条件正确评估 |
| P1-6-4 | 实现 `.ai-studio/hooks.json` 配置加载 | `[x]` | P1-6-2 | 项目级 Hook 配置自动加载 |
| P1-6-5 | Hook 返回值流程控制（continue/block/error） | `[x]` | P1-6-2 | Hook 返回 block 时阻止后续操作 |

---

## Phase 2a: 7x24 Agent 核心 (Week 7-10)

### P2a-1: Agent 基础架构

| ID | 任务 | 状态 | 依赖 | 验收标准 |
|----|------|------|------|---------|
| P2a-1-1 | 创建 AI Agent Utility Process（`src/vs/workbench/contrib/aiAgent/`） | `[x]` | 无 | Utility Process 可启动，Main ↔ Agent 进程 IPC 通信正常 |
| P2a-1-2 | 定义 `IAgentService` 主接口 | `[x]` | P2a-1-1 | 接口包含 startGoal/pauseGoal/resumeGoal/cancelGoal/getStatus |
| P2a-1-3 | 定义 `IGoal` / `IGoalConstraint` 数据结构 | `[x]` | P2a-1-2 | 目标包含描述/约束/预算/超时/模式 |
| P2a-1-4 | 定义 `TaskDAG` / `TaskNode` / `TaskEdge` 数据结构 | `[x]` | P2a-1-2 | DAG 支持添加/删除节点/查询可执行任务 |
| P2a-1-5 | 实现 `AgentMode`（全自主/半自主/监督式） | `[x]` | P2a-1-2 | 三种模式的权限和暂停行为正确 |

### P2a-2: Planner

| ID | 任务 | 状态 | 依赖 | 验收标准 |
|----|------|------|------|---------|
| P2a-2-1 | 实现 `GoalDecomposer`（目标 → 任务 DAG） | `[x]` | P2a-1-4, P0-2-1 | 自然语言目标分解为合理的任务 DAG |
| P2a-2-2 | 实现 `DifficultyEstimator`（任务难度评估） | `[x]` | P2a-2-1 | 评估结果为 simple/medium/complex |
| P2a-2-3 | 实现 `DynamicReplanner`（根据执行结果调整计划） | `[x]` | P2a-2-1 | 失败任务触发重规划 |

### P2a-3: Worker

| ID | 任务 | 状态 | 依赖 | 验收标准 |
|----|------|------|------|---------|
| P2a-3-1 | 实现 `Worker` 接口（独立 Tool-Use 循环） | `[x]` | P2a-1-1, P1-5-1, P0-2-1 | Worker 可独立执行工具调用链 |
| P2a-3-2 | 实现 `WorkerPool`（并行执行，最大并发数可配置） | `[x]` | P2a-3-1 | N 个无依赖任务并行执行 |
| P2a-3-3 | 实现 `WorkerContext`（Worker 独立上下文管理） | `[x]` | P2a-3-1, P1-4-1 | 每个 Worker 独立上下文，不继承主 Agent 历史 |

### P2a-4: Judge

| ID | 任务 | 状态 | 依赖 | 验收标准 |
|----|------|------|------|---------|
| P2a-4-1 | 实现 `BuildVerifier`（build + test + lint 自动验证） | `[x]` | P2a-3-1 | 编译/测试/lint 结果正确检测 |
| P2a-4-2 | 实现 `CodeReviewer`（LLM 代码质量审查） | `[x]` | P2a-4-1, P0-2-1 | LLM 审查代码并返回评分/建议 |
| P2a-4-3 | 实现 `SecurityScanner`（代码安全扫描） | `[x]` | P2a-4-1 | 检测危险模式（eval/SQL注入等） |

### P2a-5: 持久任务状态

| ID | 任务 | 状态 | 依赖 | 验收标准 |
|----|------|------|------|---------|
| P2a-5-1 | 实现 `TaskStore`（任务状态持久化到 `~/.ai-studio/tasks/`） | `[x]` | P2a-1-4 | 目标/计划/进度正确读写 |
| P2a-5-2 | 实现 `CheckpointManager`（临时分支 Git commit + GC） | `[x]` | P2a-5-1 | 检查点创建/回滚/过期清理正常 |
| P2a-5-3 | 实现 `KnowledgeStore`（知识块持久化） | `[x]` | P2a-5-1, P1-4-7 | 知识块跨压缩/跨重启保留 |
| P2a-5-4 | 实现 `RecoveryManager`（断点恢复） | `[x]` | P2a-5-1 | IDE 重启后可恢复未完成的目标 |

### P2a-6: 自主错误恢复

| ID | 任务 | 状态 | 依赖 | 验收标准 |
|----|------|------|------|---------|
| P2a-6-1 | 实现错误分类器（compile/test/merge-conflict/rate-limit/token-exhaustion/unknown） | `[x]` | P2a-3-1 | 错误类型正确分类 |
| P2a-6-2 | 实现按错误类型的恢复策略（重试次数/退避/回滚） | `[x]` | P2a-6-1 | 编译错误最多重试 3 次，API 限流走全局退避 |
| P2a-6-3 | 实现 `ConflictResolver`（简单合并冲突自动解决） | `[x]` | P2a-6-1 | 非语义冲突自动解决 |

### P2a-7: AgentController 主循环

| ID | 任务 | 状态 | 依赖 | 验收标准 |
|----|------|------|------|---------|
| P2a-7-1 | 实现 `AgentController.executeGoal` 主循环（含预算检查/超时/限流） | `[x]` | P2a-2-1, P2a-3-2, P2a-4-1, P2a-5-1, P2a-6-2 | 从目标到完成的完整流程可运行 |
| P2a-7-2 | 实现暂停/恢复/取消机制 | `[x]` | P2a-7-1 | 用户可随时暂停/恢复/取消目标 |
| P2a-7-3 | 实现异步通知（IDE 通知 + 系统通知） | `[x]` | P2a-7-1 | 关键节点自动通知用户 |

### P2a-8: 目标输入 UI

| ID | 任务 | 状态 | 依赖 | 验收标准 |
|----|------|------|------|---------|
| P2a-8-1 | 实现 `GoalInputWidget`（目标输入界面） | `[x]` | P2a-1-3 | 用户可输入自然语言目标 + 约束 |
| P2a-8-2 | 实现运行模式选择（全自主/半自主/监督式） | `[x]` | P2a-8-1 | 三种模式可切换 |
| P2a-8-3 | 实现 `AgentStatusBar`（状态栏 Agent 状态指示） | `[x]` | P2a-7-1 | 状态栏显示 Agent 运行状态/当前任务 |

---

## Phase 2b: 7x24 Agent 高级 (Week 11-14)

### P2b-1: 自适应拓扑

| ID | 任务 | 状态 | 依赖 | 验收标准 |
|----|------|------|------|---------|
| P2b-1-1 | 实现 `TopologySelector`（根据难度/信心/测试覆盖选择拓扑） | `[x]` | P2a-2-2 | simple/standard/complex/exploratory 四种拓扑正确选择 |
| P2b-1-2 | 实现 `DebateJudge`（辩论式多视角评审） | `[x]` | P2a-4-2 | 多 LLM 视角辩论后达成共识 |
| P2b-1-3 | 集成拓扑选择到 AgentController | `[x]` | P2b-1-1, P2a-7-1 | 不同任务使用不同拓扑执行 |

### P2b-2: MCTS 树搜索

| ID | 任务 | 状态 | 依赖 | 验收标准 |
|----|------|------|------|---------|
| P2b-2-1 | 实现 `MCTSExplorer`（蒙特卡洛树搜索主循环） | `[x]` | P2a-3-1, P2a-5-2 | 多方案并行探索，选择最优 |
| P2b-2-2 | 实现 `ValueEstimator`（方案评分：build+test 结果 + LLM 评估） | `[x]` | P2b-2-1 | 评分合理，最优方案被选中 |
| P2b-2-3 | 实现 `BranchManager`（分支管理和回溯） | `[x]` | P2b-2-1, P2a-5-2 | 失败分支自动回溯到检查点 |

### P2b-3: 多层反思

| ID | 任务 | 状态 | 依赖 | 验收标准 |
|----|------|------|------|---------|
| P2b-3-1 | 实现 `ActionReflection`（动作级：生成替代方案 + 评估） | `[x]` | P2a-6-2 | 工具调用失败后生成 2-3 个替代方案 |
| P2b-3-2 | 实现 `TaskReflection`（任务级：与预期对比 + 学习） | `[x]` | P2a-5-3 | 任务完成后总结写入 learnings.md |
| P2b-3-3 | 实现 `GoalReflection`（目标级：整体进展回顾 + 重规划判断） | `[x]` | P2a-2-3 | 阶段完成时触发目标级反思 |
| P2b-3-4 | 实现 `PredictiveCheck`（预测性纠错：执行前风险预测） | `[x]` | P2a-3-1 | Worker 执行前识别风险并设置验证检查 |

### P2b-4: 成本控制

| ID | 任务 | 状态 | 依赖 | 验收标准 |
|----|------|------|------|---------|
| P2b-4-1 | 实现 `ModelRouter`（逐步模型路由 + AgentModelRouterAdapter） | `[x]` | P0-2-1 | 不同复杂度步骤自动选择不同模型 |
| P2b-4-2 | 实现 `BudgetTracker`（预算追踪 + 80%/100% 阈值通知） | `[x]` | P2a-7-1 | 预算消耗实时追踪，阈值触发通知 |
| P2b-4-3 | 实现 `CostEstimator`（步骤成本预估） | `[x]` | P2b-4-1 | 执行前预估 Token 消耗 |
| P2b-4-4 | 实现 `GlobalRateLimiter`（全局令牌桶限流器） | `[x]` | P2a-3-2 | 多 Worker 共享限流，避免退避风暴 |
| P2b-4-5 | 实现预算感知执行（预算不足时降级模型/减少探索） | `[x]` | P2b-4-2, P2b-4-1 | 预算紧张时自动降级 |

### P2b-5: 任务仪表盘

| ID | 任务 | 状态 | 依赖 | 验收标准 |
|----|------|------|------|---------|
| P2b-5-1 | 实现 `TaskDAGView`（任务 DAG 可视化） | `[x]` | P2a-1-4 | 可视化显示任务依赖图和各任务状态 |
| P2b-5-2 | 实现 `AgentTimeline`（操作时间线） | `[x]` | P2a-7-1 | 按时间显示 Agent 所有操作 |
| P2b-5-3 | 实现 `DiffReviewPanel`（多文件 Diff 审查） | `[x]` | P2a-5-2 | 用户可审查 Agent 的代码修改 |
| P2b-5-4 | 实现 `CheckpointPanel`（检查点管理 + 回滚） | `[x]` | P2a-5-2 | 用户可查看/回滚到任意检查点 |
| P2b-5-5 | 实现 `CostDashboard`（用量仪表盘：按任务/模型/步骤细分） | `[x]` | P2b-4-2 | 实时显示 Token 消耗明细 |

### P2b-6: Token 安全保护

| ID | 任务 | 状态 | 依赖 | 验收标准 |
|----|------|------|------|---------|
| P2b-6-1 | 实现 `TokenSafetyGuard.preEditCheck`（写前检查点） | `[x]` | P2a-5-2 | 每次编辑前自动创建检查点 |
| P2b-6-2 | 实现 `TokenSafetyGuard.preStepCheck`（余量预测 + 自动压缩） | `[x]` | P1-4-5, P2b-4-3 | Token 不足时先压缩再执行 |
| P2b-6-3 | 实现 `atomicMultiFileEdit`（多文件原子操作） | `[x]` | P2b-6-1 | 多文件修改全成功或全回滚 |
| P2b-6-4 | 实现优雅降级（Token 接近上限时保存状态并暂停） | `[x]` | P2b-6-2 | 不会因 Token 耗尽导致代码损坏 |

---

## Phase 3: 知识引擎 + Skills (Week 15-18)

### P3-1: Python Sidecar

| ID | 任务 | 状态 | 依赖 | 验收标准 |
|----|------|------|------|---------|
| P3-1-1 | Sidecar 进程管理（启动/停止/重启/崩溃恢复） | `[x]` | P2a-1-1 | Sidecar 可由 AI Agent 进程管理生命周期 |
| P3-1-2 | JSON-RPC over stdio 通信协议实现 | `[x]` | P3-1-1 | IDE ↔ Sidecar 方法调用正常 |
| P3-1-3 | Python 依赖自动安装（隔离 venv） | `[x]` | P3-1-1 | 首次启动自动安装到 `~/.ai-studio/sidecar-venv/` |
| P3-1-4 | Python 未安装时的降级方案（`@codebase` 降级为 ripgrep） | `[x]` | P3-1-1 | 无 Python 环境时核心功能不受影响 |

### P3-2: 知识引擎核心

| ID | 任务 | 状态 | 依赖 | 验收标准 |
|----|------|------|------|---------|
| P3-2-1 | 集成 DeepWiki-Open（RAG/FAISS/Embedding） | `[x]` | P3-1-2 | 语义搜索返回相关代码片段 |
| P3-2-2 | 集成 CodeWiki（AST/依赖图/层级分解） | `[x]` | P3-1-2 | 结构查询返回依赖关系 |
| P3-2-3 | 实现项目摘要生成 | `[x]` | P3-2-1 | 自动生成项目结构和技术栈摘要 |

### P3-3: 增量编排层

| ID | 任务 | 状态 | 依赖 | 验收标准 |
|----|------|------|------|---------|
| P3-3-1 | 实现 `IncrementalOrchestrator`（FileWatcher + 防抖 + 指纹过滤） | `[x]` | P3-2-1 | 文件变更自动触发增量索引 |
| P3-3-2 | 实现批量嵌入（`generateEmbeddings` 批处理） | `[x]` | P3-3-1, P0-2-1 | 批量索引效率 > 单条 5x |
| P3-3-3 | 实现渐进式索引（后台低优先级，不阻塞 IDE） | `[x]` | P3-3-1 | 索引过程中 IDE 响应正常 |

### P3-4: 定义 `ICodebaseKnowledgeService` 接口

| ID | 任务 | 状态 | 依赖 | 验收标准 |
|----|------|------|------|---------|
| P3-4-1 | 实现 `semanticSearch` / `structureQuery` / `getProjectSummary` | `[x]` | P3-2-1, P3-2-2 | 统一接口可调用 |
| P3-4-2 | 实现索引状态展示 | `[x]` | P3-3-1 | 状态栏显示索引进度 |

### P3-5: Skills 增强

| ID | 任务 | 状态 | 依赖 | 验收标准 |
|----|------|------|------|---------|
| P3-5-1 | 实现 `SkillMatcher`（关键词+标签+预算感知匹配） | `[x]` | P1-4-3 | 相关 Skill 自动注入上下文 |
| P3-5-2 | 实现 Skill 索引（项目级 SKILL.md 扫描） | `[x]` | P3-5-1 | 新增 Skill 自动发现 |
| P3-5-3 | 实现 Skill + Tool 联动（Skill 可引用工具） | `[x]` | P3-5-1, P1-5-1 | Skill 描述中引用的工具自动加载 |

### P3-6: 项目持久上下文 (AISTUDIO.md)

| ID | 任务 | 状态 | 依赖 | 验收标准 |
|----|------|------|------|---------|
| P3-6-1 | 实现 AISTUDIO.md 自动加载（项目根目录 + 子目录覆盖） | `[x]` | P1-4-2 | 会话开始时自动加载到固定区 |
| P3-6-2 | 兼容 `.github/copilot-instructions.md` | `[x]` | P3-6-1 | 两种文件均可识别 |

---

## Phase 4: 优化 + 测试 + 发布 (Week 19-24)

### P4-1: 性能优化

| ID | 任务 | 状态 | 依赖 | 验收标准 |
|----|------|------|------|---------|
| P4-1-1 | 代码补全延迟优化（冷 < 800ms / 缓存 < 50ms） | `[x]` | P1-1-1 | 性能预算达标 |
| P4-1-2 | Chat TTFT 优化（< 1.5s） | `[x]` | P1-2-1 | 性能预算达标 |
| P4-1-3 | Agent 单步延迟优化（< 3s） | `[x]` | P2a-7-1 | 性能预算达标 |
| P4-1-4 | IDE 启动时间验证（不慢于原版 VS Code） | `[x]` | 全部 | 启动时间对比测试 |
| P4-1-5 | 内存占用优化（中型项目 ≤ 1.5GB） | `[x]` | 全部 | 内存监控达标 |

### P4-2: 成本优化验证

| ID | 任务 | 状态 | 依赖 | 验收标准 |
|----|------|------|------|---------|
| P4-2-1 | Prompt 缓存命中率验证（固定区 ≥ 80%） | `[x]` | P0-2-9 | 缓存命中率达标 |
| P4-2-2 | 模型路由节省验证（对比固定模型 ≥ 50%） | `[x]` | P2b-4-1 | 成本节省达标 |
| P4-2-3 | 空闲休眠验证（无任务时零 LLM 调用） | `[x]` | P2a-7-1 | 空闲期零成本 |

### P4-3: AI 功能评估

| ID | 任务 | 状态 | 依赖 | 验收标准 |
|----|------|------|------|---------|
| P4-3-1 | SWE-bench Verified 评估（7x24 Agent 整体） | `[ ]` | P2b 全部 | resolve rate ≥ 40% |
| P4-3-2 | 自适应拓扑 vs 固定拓扑对比评估 | `[ ]` | P2b-1-1 | 成功率提升 ≥ 10% |
| P4-3-3 | MCTS vs 线性执行对比评估（低信心任务） | `[ ]` | P2b-2-1 | 成功率提升 ≥ 15% |
| P4-3-4 | 多层反思 vs 无反思对比评估 | `[ ]` | P2b-3-1 | 错误恢复率提升 ≥ 20% |
| P4-3-5 | 上下文压缩前后任务完成率对比 | `[ ]` | P1-4-5 | 完成率下降 < 5% |

### P4-4: 集成测试

| ID | 任务 | 状态 | 依赖 | 验收标准 |
|----|------|------|------|---------|
| P4-4-1 | VS Code 原有功能回归测试 | `[x]` | 全部 | 原有测试 100% 通过 |
| P4-4-2 | AI Provider 集成测试（所有 P0 Provider） | `[x]` | P0-2 全部 | 4 个 Provider 基础功能正常 |
| P4-4-3 | 7x24 Agent 端到端测试（从目标到 PR） | `[ ]` | P2b 全部 | 完整流程可运行 |
| P4-4-4 | 跨进程通信稳定性测试 | `[ ]` | P2a-1-1 | 长时间运行无内存泄漏/无死锁 |
| P4-4-5 | 断点恢复测试（模拟 IDE 崩溃后恢复） | `[ ]` | P2a-5-4 | 崩溃后目标进度正确恢复 |

### P4-5: 打包发布

| ID | 任务 | 状态 | 依赖 | 验收标准 |
|----|------|------|------|---------|
| P4-5-1 | Windows 打包 (.exe installer) | `[ ]` | P4-4-1 | 安装后可正常启动和使用 |
| P4-5-2 | macOS 打包 (.dmg) | `[ ]` | P4-4-1 | 安装后可正常启动和使用 |
| P4-5-3 | Linux 打包 (.deb/.rpm/.AppImage) | `[ ]` | P4-4-1 | 安装后可正常启动和使用 |
| P4-5-4 | 自动更新机制 | `[ ]` | P4-5-1 | 新版本可检测并提示更新 |
| P4-5-5 | 发布文档（README/安装指南/快速上手） | `[ ]` | P4-5-1 | 文档完整可读 |

---

## 进度统计

| Phase | 任务数 | 已完成 | 进行中 | 阻塞 |
|-------|--------|--------|--------|------|
| Phase 0 | 23 | 22 | 0 | 1 |
| Phase 1 | 28 | 28 | 0 | 0 |
| Phase 2a | 25 | 25 | 0 | 0 |
| Phase 2b | 22 | 22 | 0 | 0 |
| Phase 3 | 17 | 17 | 0 | 0 |
| Phase 4 | 18 | 10 | 0 | 0 |
| **总计** | **133** | **124** | **0** | **1** |

> 最后更新: 2026-03-02 (Phase 0-3 全部完成, Phase 4 剩余 P4-3 评估测试 + P4-4-3/4/5 集成测试 + P4-5 打包发布)
> 阻塞: P0-1-2 图标替换需要设计资源
