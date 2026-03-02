/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IAIProviderService } from '../../../../platform/aiProvider/common/aiProvider.js';
import { IPermissionService } from '../../../../platform/aiPermission/common/aiPermission.js';
import { IContextManagerService } from '../../../services/aiContext/common/aiContext.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IAgentService, IGoal, IGoalStatus, IGoalStatusChange, GoalPhase } from './aiAgent.js';
import { TaskDAG, TaskResult, TaskStatus } from './taskDAG.js';
import { GoalDecomposer, IPlanner } from './planner/planner.js';
import { WorkerPool } from './worker/worker.js';
import { BuildVerifier, IJudge } from './judge/judge.js';
import { ITaskPersistenceService } from './persistence/taskStore.js';
import { ToolIndex } from './tools/toolIndex.js';

// -- Error Classification ------------------------------------------------

export const enum ErrorClass {
	Compile = 'compile',
	Test = 'test',
	MergeConflict = 'merge-conflict',
	RateLimit = 'rate-limit',
	Unknown = 'unknown',
}

function classifyError(error: string): ErrorClass {
	const lower = error.toLowerCase();
	if (lower.includes('compile') || lower.includes('syntax error') || lower.includes('ts(')) {
		return ErrorClass.Compile;
	}
	if (lower.includes('test fail') || lower.includes('assertion') || lower.includes('expect')) {
		return ErrorClass.Test;
	}
	if (lower.includes('merge conflict') || lower.includes('conflict marker') || lower.includes('<<<<<<')) {
		return ErrorClass.MergeConflict;
	}
	if (lower.includes('rate limit') || lower.includes('429') || lower.includes('too many requests')) {
		return ErrorClass.RateLimit;
	}
	return ErrorClass.Unknown;
}

// -- Goal Run State (internal) -------------------------------------------

interface IGoalRun {
	readonly goal: IGoal;
	phase: GoalPhase;
	dag?: TaskDAG;
	readonly abortController: AbortController;
	readonly startTime: number;
	tokensUsed: number;
	pauseResolve?: () => void;
}

// -- Default Constants ---------------------------------------------------

const DEFAULT_MAX_CONCURRENT_WORKERS = 3;
const DEFAULT_TASK_TIMEOUT_MS = 10 * 60 * 1000;
const BUDGET_WARNING_THRESHOLD = 0.8;

// -- Agent Controller Implementation ------------------------------------

class AgentController extends Disposable implements IAgentService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeGoalStatus = this._register(new Emitter<IGoalStatusChange>());
	readonly onDidChangeGoalStatus: Event<IGoalStatusChange> = this._onDidChangeGoalStatus.event;

	private readonly _goals = new Map<string, IGoalRun>();
	private readonly _planner: IPlanner;
	private readonly _judge: IJudge;
	private readonly _toolIndex: ToolIndex;

	constructor(
		@IAIProviderService private readonly _aiProviderService: IAIProviderService,
		@IPermissionService private readonly _permissionService: IPermissionService,
		@IContextManagerService private readonly _contextManagerService: IContextManagerService,
		@ITaskPersistenceService private readonly _persistenceService: ITaskPersistenceService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._planner = new GoalDecomposer(this._aiProviderService, this._logService);
		this._judge = new BuildVerifier(this._aiProviderService, this._logService);
		this._toolIndex = new ToolIndex();
	}

	async startGoal(goal: IGoal): Promise<string> {
		const goalId = goal.id || generateUuid();
		const goalWithId: IGoal = { ...goal, id: goalId };

		const run: IGoalRun = {
			goal: goalWithId,
			phase: GoalPhase.Pending,
			abortController: new AbortController(),
			startTime: Date.now(),
			tokensUsed: 0,
		};

		this._goals.set(goalId, run);

		await this._persistenceService.saveGoal(goalWithId);

		this._executeGoal(run).catch(err => {
			this._logService.error(`[AgentController] Goal ${goalId} failed:`, err);
		});

		return goalId;
	}

	async pauseGoal(goalId: string): Promise<void> {
		const run = this._goals.get(goalId);
		if (!run) {
			throw new Error(`Goal not found: ${goalId}`);
		}
		if (run.phase !== GoalPhase.Executing) {
			throw new Error(`Goal ${goalId} is not executing (current phase: ${run.phase})`);
		}

		this._setPhase(run, GoalPhase.Paused);
	}

	async resumeGoal(goalId: string): Promise<void> {
		const run = this._goals.get(goalId);
		if (!run) {
			throw new Error(`Goal not found: ${goalId}`);
		}
		if (run.phase !== GoalPhase.Paused) {
			throw new Error(`Goal ${goalId} is not paused (current phase: ${run.phase})`);
		}

		this._setPhase(run, GoalPhase.Executing);

		if (run.pauseResolve) {
			run.pauseResolve();
			run.pauseResolve = undefined;
		}
	}

	async cancelGoal(goalId: string): Promise<void> {
		const run = this._goals.get(goalId);
		if (!run) {
			throw new Error(`Goal not found: ${goalId}`);
		}

		run.abortController.abort();
		this._setPhase(run, GoalPhase.Cancelled);

		if (run.pauseResolve) {
			run.pauseResolve();
			run.pauseResolve = undefined;
		}
	}

	getGoalStatus(goalId: string): IGoalStatus | undefined {
		const run = this._goals.get(goalId);
		if (!run) {
			return undefined;
		}
		return this._buildStatus(run);
	}

	listGoals(): IGoalStatus[] {
		const result: IGoalStatus[] = [];
		for (const run of this._goals.values()) {
			result.push(this._buildStatus(run));
		}
		return result;
	}

	// -- Main Execution Loop ---------------------------------------------

	private async _executeGoal(run: IGoalRun): Promise<void> {
		try {
			this._setPhase(run, GoalPhase.Planning);

			const dag = await this._planner.decompose(run.goal);
			run.dag = dag;
			await this._persistenceService.savePlan(run.goal.id, dag);

			this._setPhase(run, GoalPhase.Executing);

			const maxConcurrent = run.goal.constraints.maxConcurrentWorkers || DEFAULT_MAX_CONCURRENT_WORKERS;
			const workerPool = new WorkerPool(
				maxConcurrent,
				this._aiProviderService,
				this._contextManagerService,
				this._permissionService,
				this._toolIndex,
				this._logService,
			);

			this._register(workerPool);

			const results: TaskResult[] = [];

			while (dag.hasRunnableTasks() && !dag.isComplete()) {
				if (run.phase === GoalPhase.Cancelled) {
					break;
				}

				if (run.phase === GoalPhase.Paused) {
					await this._waitForResume(run);
					if ((run.phase as GoalPhase) === GoalPhase.Cancelled) {
						break;
					}
				}

				if (this._isBudgetExceeded(run)) {
					this._logService.warn(`[AgentController] Budget exceeded for goal: ${run.goal.id}`);
					this._setPhase(run, GoalPhase.Failed);
					return;
				}

				const runnableTasks = dag.getNextRunnableTasks(maxConcurrent);
				if (runnableTasks.length === 0) {
					break;
				}

				for (const task of runnableTasks) {
					dag.markRunning(task.id);
				}

				this._fireStatusChange(run);

				const taskResults = await this._executeTasksWithTimeout(
					workerPool,
					runnableTasks,
					run,
				);

				for (const [taskId, result] of taskResults) {
					results.push(result);
					run.tokensUsed += result.tokensUsed;

					if (result.status === 'success') {
						const verdict = await this._judge.verify(dag.getTask(taskId)!, result);
						if (verdict.passed) {
							dag.markComplete(taskId, result);
							this._logService.info(`[AgentController] Task ${taskId} passed verification (score: ${verdict.score})`);
						} else {
							const errorClass = classifyError(verdict.issues.join(' '));
							this._logService.warn(`[AgentController] Task ${taskId} failed verification: ${errorClass}`, verdict.issues);
							dag.markFailed(taskId, verdict.issues.join('; '));
						}
					} else {
						const errorClass = classifyError(result.output);
						this._logService.warn(`[AgentController] Task ${taskId} failed: ${errorClass}`);
						dag.markFailed(taskId, result.output);
					}

					await this._persistenceService.updateProgress(run.goal.id, taskId, result);
					await this._persistenceService.savePlan(run.goal.id, dag);
				}

				this._checkBudgetWarning(run);

				if (this._planner.needsReplan(dag, results)) {
					this._logService.info(`[AgentController] Replanning for goal: ${run.goal.id}`);
					await this._planner.replan(dag, results);
					await this._persistenceService.savePlan(run.goal.id, dag);
				}
			}

			if (run.phase === GoalPhase.Cancelled) {
				return;
			}

			const allTasks = dag.getAllTasks();
			const allCompleted = allTasks.every(t => t.status === TaskStatus.Completed);

			if (allCompleted) {
				this._setPhase(run, GoalPhase.Completed);
			} else {
				this._setPhase(run, GoalPhase.Failed);
			}
		} catch (err) {
			this._logService.error(`[AgentController] Goal execution error:`, err);
			this._setPhase(run, GoalPhase.Failed);
		}
	}

	private async _executeTasksWithTimeout(
		workerPool: WorkerPool,
		tasks: import('./taskDAG.js').TaskNode[],
		run: IGoalRun,
	): Promise<Map<string, TaskResult>> {
		const timeout = run.goal.constraints.maxTimeSeconds
			? run.goal.constraints.maxTimeSeconds * 1000
			: DEFAULT_TASK_TIMEOUT_MS;

		return new Promise<Map<string, TaskResult>>((resolve) => {
			const timer = setTimeout(() => {
				run.abortController.abort();
				const timedOut = new Map<string, TaskResult>();
				for (const task of tasks) {
					timedOut.set(task.id, {
						status: 'failure',
						output: `Task timed out after ${timeout}ms`,
						tokensUsed: 0,
						duration: timeout,
					});
				}
				resolve(timedOut);
			}, timeout);

			workerPool.executeTasks(tasks, run.abortController.signal).then(results => {
				clearTimeout(timer);
				resolve(results);
			}).catch(() => {
				clearTimeout(timer);
				const errorResults = new Map<string, TaskResult>();
				for (const task of tasks) {
					errorResults.set(task.id, {
						status: 'failure',
						output: 'Worker execution failed',
						tokensUsed: 0,
						duration: Date.now() - run.startTime,
					});
				}
				resolve(errorResults);
			});
		});
	}

	private _isBudgetExceeded(run: IGoalRun): boolean {
		const maxTokens = run.goal.constraints.maxTokenBudget;
		if (maxTokens > 0 && run.tokensUsed >= maxTokens) {
			return true;
		}

		const maxTime = run.goal.constraints.maxTimeSeconds;
		if (maxTime > 0) {
			const elapsed = (Date.now() - run.startTime) / 1000;
			if (elapsed >= maxTime) {
				return true;
			}
		}

		return false;
	}

	private _checkBudgetWarning(run: IGoalRun): void {
		const maxTokens = run.goal.constraints.maxTokenBudget;
		if (maxTokens > 0) {
			const usage = run.tokensUsed / maxTokens;
			if (usage >= BUDGET_WARNING_THRESHOLD) {
				this._logService.warn(
					`[AgentController] Goal ${run.goal.id} is at ${Math.round(usage * 100)}% of token budget`
				);
			}
		}
	}

	private async _waitForResume(run: IGoalRun): Promise<void> {
		return new Promise<void>(resolve => {
			run.pauseResolve = resolve;
		});
	}

	private _setPhase(run: IGoalRun, phase: GoalPhase): void {
		const previous = run.phase;
		run.phase = phase;
		this._fireStatusChange(run, previous);
	}

	private _fireStatusChange(run: IGoalRun, previousPhase?: GoalPhase): void {
		const status = this._buildStatus(run);
		this._onDidChangeGoalStatus.fire({
			goalId: run.goal.id,
			previousPhase: previousPhase ?? run.phase,
			currentPhase: run.phase,
			status,
		});
	}

	private _buildStatus(run: IGoalRun): IGoalStatus {
		const dag = run.dag;
		const allTasks = dag ? dag.getAllTasks() : [];
		const currentTaskIds = allTasks
			.filter(t => t.status === TaskStatus.Running)
			.map(t => t.id);

		return {
			goalId: run.goal.id,
			phase: run.phase,
			totalTasks: allTasks.length,
			completedTasks: dag ? dag.getCompletedCount() : 0,
			failedTasks: dag ? dag.getFailedCount() : 0,
			tokensUsed: run.tokensUsed,
			elapsedMs: Date.now() - run.startTime,
			currentTaskIds,
		};
	}
}

registerSingleton(IAgentService, AgentController, InstantiationType.Delayed);
