# AI IDE 系统设计文档

> 基于 Spec v3.0.0 | 日期: 2026-03-02

---

## 1. 系统架构总览

### 1.1 进程架构

```
┌─────────────────────────────────────────────────────────────────────┐
│  Electron 主进程 (Main Process)                                      │
│  ├── 窗口管理 / 生命周期 / IPC 路由                                   │
│  ├── AI Provider 连接池 (HTTP/2)                                     │
│  └── 分层权限管理器                                                   │
├─────────────────────────────────────────────────────────────────────┤
│  渲染进程 (Renderer / Workbench)                                     │
│  ├── Chat UI / Inline Chat / Ghost Text                             │
│  ├── 7x24 Agent 仪表盘 (Task DAG / Timeline / Notifications)        │
│  ├── Diff 审查面板 / 检查点管理                                       │
│  └── 设置 UI                                                        │
├─────────────────────────────────────────────────────────────────────┤
│  Extension Host 进程                                                 │
│  ├── 内置 AI 扩展 (Provider 注册 / Participant / InlineCompletions)   │
│  └── 第三方 VS Code 扩展 (完全兼容)                                   │
├─────────────────────────────────────────────────────────────────────┤
│  AI Agent 进程 (Utility Process, 新增)                               │
│  ├── 7x24 Agent Controller                                          │
│  │   ├── Planner (目标分解 / 拓扑选择 / 动态重规划)                    │
│  │   ├── Worker Pool (并行执行 / 独立上下文)                           │
│  │   ├── Judge (验证 / 辩论式评审)                                    │
│  │   └── MCTS Explorer (树搜索 / 回溯)                               │
│  ├── Context Manager (预算分配 / 三层压缩 / 知识块)                    │
│  ├── Tool Orchestrator (工具索引 / 调用 / 结果处理)                    │
│  ├── Model Router (逐步模型选择 / 预算感知)                            │
│  ├── Hooks Engine (生命周期事件分发)                                   │
│  └── Task Persistence (磁盘状态 / 检查点 / 恢复)                      │
├─────────────────────────────────────────────────────────────────────┤
│  Python Sidecar 进程 (知识引擎, 新增)                                 │
│  ├── DeepWiki-Open 模块 (RAG / FAISS / Embedding)                   │
│  ├── CodeWiki 模块 (AST / 依赖图 / 层级分解)                         │
│  └── 增量编排层 (变更收集 / 指纹 / 增量分派)                           │
├─────────────────────────────────────────────────────────────────────┤
│  MCP Server 进程群 (按需启动)                                         │
│  ├── filesystem / git / fetch / memory (预配置)                      │
│  └── deepwiki / codewiki / 用户自定义 (按需)                          │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.2 进程间通信

| 通信路径 | 协议 | 说明 |
|---------|------|------|
| Main ↔ Renderer | Electron IPC (MessagePort) | VS Code 已有 |
| Renderer ↔ Extension Host | RPC (VS Code RPCProtocol) | VS Code 已有 |
| Main ↔ AI Agent 进程 | MessagePort (Utility Process) | VS Code UtilityProcess 机制 |
| AI Agent ↔ Python Sidecar | JSON-RPC over stdio | 同 LSP 模式 |
| AI Agent ↔ MCP Servers | MCP 协议 (JSON-RPC) | VS Code MCP 已有 |
| AI Agent ↔ LLM API | HTTPS (HTTP/2) | 通过 AI Provider 层 |

### 1.3 VS Code 分层映射

新增模块严格遵循 VS Code 的 `base → platform → editor → workbench` 分层：

| 层 | 新增模块 | 位置 |
|----|---------|------|
| `platform` | `IAIProviderService` | `src/vs/platform/aiProvider/` |
| `platform` | `IPermissionService` | `src/vs/platform/aiPermission/` |
| `platform` | `IModelRouterService` | `src/vs/platform/modelRouter/` |
| `workbench/services` | `IContextManagerService` | `src/vs/workbench/services/aiContext/` |
| `workbench/services` | `ITaskPersistenceService` | `src/vs/workbench/services/aiTask/` |
| `workbench/services` | `IHooksService` | `src/vs/workbench/services/aiHooks/` |
| `workbench/contrib` | `aiAgent/` | `src/vs/workbench/contrib/aiAgent/` |
| `workbench/contrib` | `aiCompletion/` | `src/vs/workbench/contrib/aiCompletion/` |
| `workbench/contrib` | `aiDashboard/` | `src/vs/workbench/contrib/aiDashboard/` |

---

## 2. AI Provider 抽象层

### 2.1 服务接口

```typescript
// src/vs/platform/aiProvider/common/aiProvider.ts

interface IAIProviderService {
  // 注册 Provider
  registerProvider(id: string, provider: IAIProvider): IDisposable;

  // 聊天补全（流式）
  chatCompletion(request: IChatRequest): AsyncIterable<IChatChunk>;

  // 代码补全（FIM）
  codeCompletion(request: ICodeCompletionRequest): Promise<ICodeCompletionResponse>;

  // 嵌入生成
  generateEmbedding(request: IEmbeddingRequest): Promise<number[]>;

  // 模型列表
  listModels(): Promise<IAIModel[]>;

  // 获取模型元数据（上下文窗口大小等）
  getModelMetadata(modelId: string): IAIModelMetadata;
}

interface IAIProvider {
  readonly id: string;                    // 'openai' | 'anthropic' | 'deepseek' | 'ollama' | 'custom'
  readonly displayName: string;
  chatCompletion(request: IChatRequest): AsyncIterable<IChatChunk>;
  codeCompletion?(request: ICodeCompletionRequest): Promise<ICodeCompletionResponse>;
  generateEmbedding?(request: IEmbeddingRequest): Promise<number[]>;
  listModels(): Promise<IAIModel[]>;
}

interface IChatRequest {
  model: string;
  messages: IChatMessage[];
  tools?: IToolDefinition[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;                   // 取消支持
  cachedPrefixTokens?: string[];          // Prompt 缓存提示
}

interface IAIModelMetadata {
  maxInputTokens: number;
  maxOutputTokens: number;
  supportsTools: boolean;
  supportsVision: boolean;
  supportsStreaming: boolean;
  costPerInputToken: number;              // 用于模型路由决策
  costPerOutputToken: number;
}
```

### 2.2 Provider 实现

每个 Provider 在 `src/vs/platform/aiProvider/common/providers/` 下独立实现：

| 文件 | 实现 |
|------|------|
| `openaiProvider.ts` | OpenAI API (GPT-4o, o1, o3) |
| `anthropicProvider.ts` | Anthropic API (Claude Sonnet, Opus) |
| `deepseekProvider.ts` | DeepSeek API |
| `ollamaProvider.ts` | 本地 Ollama HTTP API |
| `customOpenAIProvider.ts` | 任意 OpenAI 兼容端点 |

### 2.3 连接池与 Prompt 缓存

```typescript
// 主进程中维护连接池
class AIProviderConnectionPool {
  // 每个 Provider 一个 HTTP/2 连接，自动重连
  private connections: Map<string, Http2Session>;

  // Prompt 缓存：利用 Provider 原生缓存 API
  // Anthropic: cache_control 字段
  // OpenAI: 自动前缀缓存
  async sendWithCache(provider: string, request: IChatRequest): AsyncIterable<IChatChunk>;
}
```

---

## 3. 7x24 自主 Agent 系统（核心）

### 3.1 模块结构

```
src/vs/workbench/contrib/aiAgent/
├── common/
│   ├── aiAgent.ts                      # IAgentService 主接口
│   ├── goal.ts                         # IGoal, IGoalConstraint 定义
│   ├── taskDAG.ts                      # TaskDAG, TaskNode, TaskEdge
│   ├── agentMode.ts                    # FullAuto / SemiAuto / Supervised
│   │
│   ├── planner/
│   │   ├── planner.ts                  # IPlanner 接口
│   │   ├── goalDecomposer.ts           # 目标 → 任务 DAG
│   │   ├── topologySelector.ts         # 自适应拓扑选择 (论文: AdaptOrch)
│   │   ├── difficultyEstimator.ts      # 任务难度评估
│   │   └── dynamicReplanner.ts         # 动态重规划
│   │
│   ├── worker/
│   │   ├── worker.ts                   # IWorker 接口
│   │   ├── workerPool.ts              # Worker 池（并行执行）
│   │   ├── workerContext.ts           # Worker 独立上下文管理
│   │   └── predictiveCheck.ts         # 预测性纠错 (论文: ReCAPA)
│   │
│   ├── judge/
│   │   ├── judge.ts                    # IJudge 接口
│   │   ├── buildVerifier.ts           # build + test + lint 验证
│   │   ├── codeReviewer.ts            # 代码质量审查
│   │   ├── securityScanner.ts         # 代码安全扫描 (论文: LlamaFirewall)
│   │   └── debateJudge.ts            # 辩论式多视角评审 (论文: SWE-Debate)
│   │
│   ├── mcts/
│   │   ├── mctsExplorer.ts            # MCTS 树搜索 (论文: SWE-Search)
│   │   ├── valueEstimator.ts          # 方案评分
│   │   └── branchManager.ts           # 分支管理和回溯
│   │
│   ├── reflection/
│   │   ├── actionReflection.ts        # 动作级反思
│   │   ├── taskReflection.ts          # 任务级反思
│   │   └── goalReflection.ts          # 目标级反思
│   │
│   ├── persistence/
│   │   ├── taskStore.ts               # 任务状态持久化
│   │   ├── checkpointManager.ts       # Git 检查点
│   │   ├── knowledgeStore.ts          # 知识块持久化
│   │   └── recoveryManager.ts         # 断点恢复
│   │
│   ├── cost/
│   │   ├── modelRouter.ts             # 逐步模型路由 (论文: RouteLLM/CASTER)
│   │   ├── budgetTracker.ts           # 预算追踪
│   │   └── costEstimator.ts           # 步骤成本预估
│   │
│   └── notification/
│       ├── notificationService.ts     # 异步通知
│       └── notificationChannel.ts     # IDE / 系统 / 邮件 / Slack
│
├── browser/
│   ├── aiAgent.contribution.ts         # 注册 Contribution
│   ├── goalInputWidget.ts             # 目标输入 UI
│   ├── taskDAGView.ts                 # 任务 DAG 可视化
│   ├── agentTimeline.ts               # 操作时间线
│   ├── diffReviewPanel.ts            # 多文件 Diff 审查
│   ├── checkpointPanel.ts            # 检查点管理
│   ├── costDashboard.ts              # 用量仪表盘
│   └── agentStatusBar.ts             # 状态栏指示
│
└── electron-browser/
    └── aiAgent.contribution.ts         # Desktop 特有注册
```

### 3.2 核心流程

```typescript
// 简化的 7x24 Agent 主循环
class AgentController {

  async executeGoal(goal: IGoal): Promise<void> {
    // 1. 持久化目标
    await this.taskStore.saveGoal(goal);

    // 2. Planner 分解目标为任务 DAG
    const dag = await this.planner.decompose(goal);
    await this.taskStore.savePlan(dag);

    // 3. 主循环：持续执行直到完成或暂停
    while (dag.hasRunnableTasks()) {

      // 3a. 选择下一批可执行任务（无依赖的）
      const tasks = dag.getNextRunnableTasks(this.maxConcurrentWorkers);

      // 3b. 为每个任务选择拓扑
      for (const task of tasks) {
        const topology = this.topologySelector.select(task);
        task.topology = topology;
      }

      // 3c. 并行执行
      const results = await Promise.all(
        tasks.map(task => this.executeTask(task))
      );

      // 3d. 任务级反思
      for (const result of results) {
        await this.taskReflection.reflect(result);
        await this.taskStore.updateProgress(result);
      }

      // 3e. 检查是否需要重规划
      if (this.planner.needsReplan(dag, results)) {
        await this.planner.replan(dag, results);
      }

      // 3f. 目标级反思（每 N 个任务或阶段完成时）
      if (this.shouldReflectOnGoal(dag)) {
        await this.goalReflection.reflect(goal, dag);
      }

      // 3g. 检查暂停条件
      if (this.shouldPause(dag, results)) {
        await this.notify(dag.pauseReason);
        await this.waitForHumanInput();
      }

      // 3h. 上下文压缩（任务边界自动触发）
      await this.contextManager.compactIfNeeded();
    }

    // 4. 目标完成
    await this.hooks.emit('GoalComplete', goal);
    await this.notify('目标已完成，请审查结果');
  }

  private async executeTask(task: TaskNode): Promise<TaskResult> {
    // 创建检查点
    await this.checkpointManager.create(task.id);

    try {
      switch (task.topology) {
        case 'simple':
          return await this.executeSingle(task);
        case 'standard':
          return await this.executeWithJudge(task);
        case 'complex':
          return await this.executeParallelWithDebate(task);
        case 'exploratory':
          return await this.mctsExplorer.explore(task);
      }
    } catch (error) {
      return await this.handleError(task, error);
    }
  }

  private async handleError(task: TaskNode, error: Error): Promise<TaskResult> {
    // 动作级反思：尝试替代方案
    for (let retry = 0; retry < this.maxRetries; retry++) {
      const alternatives = await this.actionReflection.generateAlternatives(task, error);
      const best = await this.actionReflection.evaluate(alternatives);
      try {
        return await this.executeWithStrategy(task, best);
      } catch (retryError) {
        error = retryError;
      }
    }

    // 所有重试失败：回滚并标记为需要人类介入
    await this.checkpointManager.rollback(task.id);
    return { status: 'blocked', reason: error.message, needsHuman: true };
  }
}
```

### 3.3 自适应拓扑选择

```typescript
// src/vs/workbench/contrib/aiAgent/common/planner/topologySelector.ts

class TopologySelector {

  select(task: TaskNode): TopologyType {
    const difficulty = this.difficultyEstimator.estimate(task);
    const confidence = this.confidenceEstimator.estimate(task);
    const hasTests = this.testCoverageChecker.check(task.affectedFiles);

    if (difficulty === 'simple' && confidence > 0.8) {
      return 'simple';           // 单 Worker，省成本
    }
    if (difficulty === 'medium' || (difficulty === 'simple' && confidence <= 0.8)) {
      return 'standard';         // Worker → Judge
    }
    if (difficulty === 'complex' && hasTests) {
      return 'complex';          // 多 Worker 并行 + 辩论式 Judge
    }
    return 'exploratory';        // MCTS 树搜索
  }
}
```

### 3.4 持久任务状态

```typescript
// src/vs/workbench/services/aiTask/common/taskStore.ts

interface ITaskPersistenceService {
  // 目标管理
  saveGoal(goal: IGoal): Promise<void>;
  getGoal(goalId: string): Promise<IGoal>;
  listGoals(): Promise<IGoal[]>;

  // 计划管理
  savePlan(dag: TaskDAG): Promise<void>;
  getPlan(goalId: string): Promise<TaskDAG>;

  // 进度更新
  updateProgress(result: TaskResult): Promise<void>;
  getProgress(goalId: string): Promise<TaskProgress>;

  // 知识块
  saveKnowledge(goalId: string, block: KnowledgeBlock): Promise<void>;
  getKnowledge(goalId: string): Promise<KnowledgeBlock[]>;

  // 恢复
  recoverFromDisk(goalId: string): Promise<AgentState>;
}

// 存储路径: ~/.ai-studio/tasks/{goal-id}/
// 格式: JSON 文件，逐步追加写入
```

---

## 4. 上下文管理系统

### 4.1 服务接口

```typescript
// src/vs/workbench/services/aiContext/common/contextManager.ts

interface IContextManagerService {
  // 创建上下文窗口（主 Agent 或子 Agent 各自独立）
  createWindow(config: ContextWindowConfig): IContextWindow;

  // 组装 prompt（按预算分配）
  assemblePrompt(window: IContextWindow, request: IAssembleRequest): Promise<IAssembledPrompt>;

  // 三层压缩
  microCompact(window: IContextWindow, toolOutput: IToolOutput): void;
  autoCompact(window: IContextWindow): Promise<void>;
  manualCompact(window: IContextWindow): Promise<void>;

  // 知识块管理
  extractKnowledge(window: IContextWindow): Promise<KnowledgeBlock[]>;
}

interface ContextWindowConfig {
  modelMetadata: IAIModelMetadata;        // 模型上下文大小
  budgetAllocation: IBudgetAllocation;    // 各区百分比（可覆盖默认值）
  persistentContext?: string;             // AISTUDIO.md 内容
  skills?: ISkillContent[];               // 已匹配的 Skills
  coreTools: IToolDefinition[];           // 核心工具定义
}

interface IBudgetAllocation {
  systemPrompt: number;      // 默认 3%
  coreTools: number;         // 默认 3%
  projectSummary: number;    // 默认 2%
  skills: number;            // 默认 2%
  userMessage: number;       // 默认 20%
  activeContext: number;     // 默认 30%
  history: number;           // 默认 20%
  supplementary: number;     // 默认 5%
  elastic: number;           // 默认 15%
}
```

### 4.2 三层压缩实现

```typescript
class ContextCompactionManager {

  // 层 1: Micro-compaction - 每次工具调用后
  microCompact(window: IContextWindow, toolOutput: IToolOutput): void {
    if (toolOutput.tokenCount > this.MICRO_THRESHOLD) {
      // 卸载到磁盘
      const ref = this.diskStore.save(toolOutput);
      // 上下文中替换为摘要引用
      window.replaceToolOutput(toolOutput.id, {
        summary: this.quickSummarize(toolOutput),
        diskRef: ref,
        tokenCount: /* 摘要 token 数 */
      });
    }
    // 只保留最近 2 次工具结果完整
    window.trimOldToolOutputs(2);
  }

  // 层 2: Auto-compaction - 剩余空间 < 安全阈值
  async autoCompact(window: IContextWindow): Promise<void> {
    if (window.freeTokens() > this.SAFE_THRESHOLD) return;

    // 提取知识块（Focus Agent 论文）
    const knowledge = await this.extractKnowledge(window);
    await this.knowledgeStore.save(knowledge);

    // 摘要历史
    const summary = await this.summarizeHistory(window);

    // 自问式验证（ProMem 论文）
    const validated = await this.validateSummary(summary, window);

    // 重建窗口
    window.rebuild({
      systemPrompt: window.systemPrompt,
      coreTools: window.coreTools,
      persistentContext: window.persistentContext,
      knowledge: knowledge,              // 知识块保留
      historySummary: validated,          // 验证后的摘要
      currentTask: window.currentTask,   // 当前任务保留
      recentToolOutputs: window.getRecent(2),
    });
  }

  // 层 3: Manual /compact - 深度重建
  async manualCompact(window: IContextWindow): Promise<void> {
    // 从持久任务状态恢复（7x24 Agent 场景）
    const taskState = await this.taskStore.getState();
    const knowledge = await this.knowledgeStore.getAll();

    window.rebuild({
      systemPrompt: window.systemPrompt,
      coreTools: window.coreTools,
      persistentContext: window.persistentContext,
      knowledge: knowledge,
      taskSummary: taskState.toSummary(),      // 任务进度概述
      currentTask: taskState.currentTask,
      decisions: taskState.decisions,           // 关键决策
      learnings: taskState.learnings,           // 学到的知识
    });
  }
}
```

### 4.3 Token 计数与预算

```typescript
class TokenBudgetManager {
  // 本地 Tiktoken WASM 计数（不调用 API）
  private tokenizer: TiktokenWasm;

  // 缓存：内容哈希 → token 数
  private cache: LRUCache<string, number>;

  countTokens(content: string): number {
    const hash = quickHash(content);
    if (this.cache.has(hash)) return this.cache.get(hash)!;
    const count = this.tokenizer.encode(content).length;
    this.cache.set(hash, count);
    return count;
  }

  // 计算有效预算
  getEffectiveBudget(model: IAIModelMetadata): number {
    return model.maxInputTokens - model.maxOutputTokens;
  }

  // 按百分比分配
  allocate(model: IAIModelMetadata, allocation: IBudgetAllocation): ResolvedBudget {
    const total = this.getEffectiveBudget(model);
    return {
      systemPrompt: Math.floor(total * allocation.systemPrompt / 100),
      coreTools: Math.floor(total * allocation.coreTools / 100),
      // ... 各区分配
    };
  }
}
```

---

## 5. 工具系统

### 5.1 工具索引

```typescript
// src/vs/workbench/contrib/aiAgent/common/tools/toolIndex.ts

class ToolIndex {
  // 核心工具：始终在上下文
  private coreTools: Map<string, IToolData> = new Map();

  // 索引工具：按需加载
  private indexedTools: Map<string, IndexedToolEntry> = new Map();

  constructor() {
    // 注册核心工具
    this.coreTools.set('editFile', ...);
    this.coreTools.set('readFile', ...);
    this.coreTools.set('search', ...);
    this.coreTools.set('listDirectory', ...);
    this.coreTools.set('terminal', ...);
    this.coreTools.set('runSubagent', ...);
    this.coreTools.set('codebaseSearch', ...);
    this.coreTools.set('toolSearch', ...);       // 元工具：搜索其他工具
  }

  // 工具注册时建立索引
  indexTool(tool: IToolData): void {
    this.indexedTools.set(tool.id, {
      tool,
      keywords: this.extractKeywords(tool.modelDescription),
      category: this.categorize(tool),
    });
  }

  // toolSearch 的实现
  search(query: string, category?: string): IToolData[] {
    let candidates = [...this.indexedTools.values()];
    if (category) {
      candidates = candidates.filter(t => t.category === category);
    }
    // TF-IDF 关键词匹配
    return candidates
      .map(t => ({ tool: t.tool, score: this.score(query, t) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(t => t.tool);
  }
}
```

### 5.2 MCP 集成

复用 VS Code 已有的 MCP 框架。新增：预配置推荐 Server 列表 + MCP Server 预启动。

```typescript
// product.json 中新增
{
  "recommendedMcpServers": [
    { "id": "filesystem", "command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem"] },
    { "id": "git", "command": "npx", "args": ["-y", "@modelcontextprotocol/server-git"] },
    { "id": "fetch", "command": "npx", "args": ["-y", "@modelcontextprotocol/server-fetch"] }
  ]
}
```

---

## 6. 模型路由

### 6.1 逐步路由

```typescript
// src/vs/platform/modelRouter/common/modelRouter.ts

interface IModelRouterService {
  // 为当前步骤选择最优模型
  selectModel(context: IRoutingContext): Promise<string>;
}

interface IRoutingContext {
  role: 'planner' | 'worker' | 'judge' | 'subagent';
  taskDifficulty: 'simple' | 'medium' | 'complex';
  remainingBudget: number;                   // 剩余 Token 预算
  availableModels: IAIModelMetadata[];       // 可用模型列表
}

class ModelRouter implements IModelRouterService {

  async selectModel(ctx: IRoutingContext): Promise<string> {
    // 预算不足时强制降级
    if (ctx.remainingBudget < this.LOW_BUDGET_THRESHOLD) {
      return this.getCheapestModel(ctx.availableModels);
    }

    // 按角色+难度选择
    if (ctx.role === 'planner' || ctx.role === 'judge') {
      return this.getStrongestModel(ctx.availableModels);      // 规划和评审用强模型
    }

    if (ctx.taskDifficulty === 'simple') {
      return this.getCheapestModel(ctx.availableModels);       // 简单任务用便宜模型
    }

    if (ctx.taskDifficulty === 'complex') {
      return this.getStrongestModel(ctx.availableModels);
    }

    return this.getBalancedModel(ctx.availableModels);         // 中等任务用平衡模型
  }
}
```

---

## 7. Hooks 生命周期

### 7.1 服务接口

```typescript
// src/vs/workbench/services/aiHooks/common/hooksService.ts

interface IHooksService {
  // 注册 Hook
  register(event: HookEvent, hook: IHook): IDisposable;

  // 触发事件
  emit(event: HookEvent, context: IHookContext): Promise<HookResult>;
}

type HookEvent =
  | 'SessionStart' | 'SessionEnd'
  | 'PreToolUse' | 'PostToolUse'
  | 'PreCompact'
  | 'SubagentStart' | 'SubagentStop'
  | 'TaskComplete' | 'GoalComplete';

interface IHook {
  type: 'shell' | 'http' | 'script';
  command: string;                          // Shell 命令 或 HTTP URL
}

// HookResult: 0=继续, 2=阻止, 其他=错误
type HookResult = { action: 'continue' | 'block' | 'error'; message?: string };
```

### 7.2 配置

```json
// .ai-studio/hooks.json
{
  "PostToolUse": [
    { "type": "shell", "command": "npx prettier --write ${file}", "when": "toolName == 'editFile'" }
  ],
  "TaskComplete": [
    { "type": "shell", "command": "npm test" }
  ]
}
```

---

## 8. 分层权限系统

```typescript
// src/vs/platform/aiPermission/common/permissionService.ts

interface IPermissionService {
  // 请求权限
  requestPermission(action: IPermissionRequest): Promise<PermissionDecision>;

  // 管理规则
  addRule(rule: IPermissionRule): void;
}

interface IPermissionRule {
  pattern: string;          // 'Bash(npm run *)', 'Read(.env)', 'editFile(src/core/**)'
  decision: 'allow' | 'deny' | 'ask';
  scope: 'session' | 'project' | 'global';
}

// 评估顺序: deny → ask → allow
// 7x24 全自主模式: 编辑和执行层自动 allow，仅危险层 ask
```

---

## 9. 知识引擎集成

### 9.1 TypeScript 编排层

```typescript
// src/vs/workbench/services/aiKnowledge/common/knowledgeService.ts

interface ICodebaseKnowledgeService {
  // 语义搜索（路由到 DeepWiki RAG）
  semanticSearch(query: string, topK?: number): Promise<ICodeChunk[]>;

  // 结构查询（路由到 CodeWiki 依赖图）
  structureQuery(query: IStructureQuery): Promise<IStructureResult>;

  // 项目摘要
  getProjectSummary(): Promise<string>;

  // 索引状态
  getIndexStatus(): IIndexStatus;
}

// 增量编排
class IncrementalOrchestrator {
  constructor(
    private fileWatcher: IFileSystemWatcher,     // VS Code 已有
    private sidecar: ISidecarConnection,          // Python sidecar JSON-RPC
  ) {
    // 监听文件变更，500ms 防抖
    this.fileWatcher.onDidChange(
      debounce(500, (changes) => this.processChanges(changes))
    );
  }

  private async processChanges(changes: IFileChange[]): Promise<void> {
    // 过滤：.gitignore + 指纹比对
    const realChanges = await this.filterUnchanged(changes);
    if (realChanges.length === 0) return;

    // 分派到 Python sidecar
    await this.sidecar.call('incrementalIndex', {
      files: realChanges.map(c => ({ path: c.path, action: c.type }))
    });
  }
}
```

### 9.2 Python Sidecar 接口

```
JSON-RPC Methods (IDE → Sidecar):

  initialize(projectPath, config)     → { status }
  incrementalIndex(files)             → { indexed, skipped, errors }
  semanticSearch(query, topK)         → { chunks: [{path, content, score}] }
  structureQuery(query)               → { results }
  getProjectSummary()                 → { summary: string }
  getIndexStatus()                    → { totalFiles, indexedFiles, lastUpdate }
  shutdown()                          → { }
```

---

## 10. 子 Agent 增强

```typescript
// 增强 RunSubagentTool

class EnhancedSubagentTool {

  async invoke(params: ISubagentParams): Promise<ISubagentResult> {
    // 1. 创建独立上下文窗口（不继承主 Agent 历史）
    const window = this.contextManager.createWindow({
      modelMetadata: this.selectSubagentModel(params),
      budgetAllocation: SUBAGENT_BUDGET,     // 更紧凑的预算
      persistentContext: this.projectContext,
    });

    // 2. 注入任务描述 + 项目摘要（轻量上下文）
    window.addSystemMessage(params.systemPrompt);
    window.addUserMessage(params.prompt);

    // 3. 独立执行 Tool-Use 循环
    const fullOutput = await this.executeLoop(window, params.tools);

    // 4. 结果摘要化（不超过 maxSummaryTokens）
    const summary = await this.summarize(fullOutput, params.maxSummaryTokens || 2000);

    // 5. 产出物（文件修改）直通
    const artifacts = this.extractArtifacts(fullOutput);

    // 6. 释放上下文（子 Agent 完成后立即清理）
    window.dispose();

    return { summary, artifacts, metadata: { tokensUsed, duration, model } };
  }
}
```

---

## 11. Token 安全保护

```typescript
class TokenSafetyGuard {

  // 每次 editFile 前
  async preEditCheck(files: string[]): Promise<void> {
    // 创建 Git stash 检查点
    await this.git.stash(`pre-edit-${Date.now()}`);
  }

  // 每步开始前
  async preStepCheck(window: IContextWindow, estimatedTokens: number): Promise<void> {
    const remaining = window.freeTokens();
    if (remaining < estimatedTokens * 1.5) {
      // Token 可能不足：先压缩
      await this.contextManager.autoCompact(window);
      const newRemaining = window.freeTokens();
      if (newRemaining < estimatedTokens) {
        // 压缩后仍不足：暂停并保存状态
        await this.taskStore.saveState();
        throw new TokenExhaustionError('Token 不足，任务已暂停');
      }
    }
  }

  // 多文件原子操作
  async atomicMultiFileEdit(edits: IFileEdit[]): Promise<void> {
    const checkpoint = await this.git.stash(`atomic-${Date.now()}`);
    try {
      for (const edit of edits) {
        await this.applyEdit(edit);
      }
      // 全部成功：验证
      const buildOk = await this.buildVerifier.verify();
      if (!buildOk) throw new Error('Build failed after edits');
    } catch (error) {
      // 任何失败：全部回滚
      await this.git.stashPop(checkpoint);
      throw error;
    }
  }
}
```

---

## 12. Skills 集成

```typescript
// 增强已有 Skills 系统

class SkillMatcher {
  // 为当前请求匹配最相关的 Skills
  async match(
    userMessage: string,
    currentFile: string,
    maxSkills: number,
    budgetTokens: number,
  ): Promise<ISkillContent[]> {
    const allSkills = await this.promptsService.findAgentSkills();

    // 关键词+标签匹配
    const scored = allSkills
      .filter(s => !s.disableModelInvocation)
      .map(s => ({
        skill: s,
        score: this.relevanceScore(userMessage, currentFile, s),
      }))
      .sort((a, b) => b.score - a.score);

    // 按预算裁剪
    const selected: ISkillContent[] = [];
    let usedTokens = 0;
    for (const { skill } of scored) {
      const content = await this.loadSkillContent(skill);
      const tokens = this.tokenCounter.count(content);
      if (usedTokens + tokens > budgetTokens) break;
      if (selected.length >= maxSkills) break;
      selected.push(content);
      usedTokens += tokens;
    }

    return selected;
  }
}
```

---

## 13. 品牌定制

```typescript
// product.json 修改清单
{
  "nameShort": "AI Studio",
  "nameLong": "AI Studio - 7x24 AI IDE",
  "applicationName": "ai-studio",
  "dataFolderName": ".ai-studio",
  "urlProtocol": "ai-studio",
  "serverApplicationName": "ai-studio-server",
  "darwinBundleIdentifier": "com.example.ai-studio",

  "defaultChatAgent": {
    "chatProviderId": "ai-studio-chat",
    "extensionId": "ai-studio.copilot"
  },

  "recommendedMcpServers": [ /* ... */ ],

  "aiStudioDefaults": {
    "provider": "openai",
    "model.chat": "gpt-4o",
    "model.completion": "deepseek-coder-v2",
    "model.agent": "claude-sonnet",
    "model.subagent": "gpt-4o-mini"
  }
}
```

---

## 14. 关键数据流

### 14.1 代码补全

```
用户输入 → [Renderer] 防抖 350ms → 检查 LRU 缓存
  → [Worker] 组装 FIM 上下文 (prefix + suffix + 相关文件签名)
  → [Main] AI Provider 发送 codeCompletion()
  → [流式返回] → [Renderer] 渲染 Ghost Text
  → 用户 Tab 接受 → 预取下一位置
```

### 14.2 7x24 Agent

```
用户定义目标 → [Renderer] GoalInputWidget
  → [AI Agent 进程] Planner 分解为 Task DAG
  → 循环:
      → TopologySelector 选择拓扑
      → WorkerPool 并行执行 (每个 Worker 独立上下文)
      → Judge 验证 (build + test + lint + 安全扫描)
      → TaskReflection 反思
      → TaskStore 持久化进度
      → ContextManager 压缩（任务边界）
      → ModelRouter 选择下一步模型
      → Notification 通知用户（如需要）
  → GoalComplete → 通知 + PR
```

### 14.3 上下文压缩

```
工具调用完成 → Micro-compaction (大输出卸载磁盘)
  → 检查剩余空间 < 阈值?
    → Auto-compaction:
        提取知识块 → 摘要历史 → 自问验证 → 重建窗口
  → 任务边界?
    → Manual-compaction:
        保存完整状态到磁盘 → 深度摘要 → 从持久状态恢复
```

---

> **文档状态**: 待确认。确认后编写 tasks.md。
