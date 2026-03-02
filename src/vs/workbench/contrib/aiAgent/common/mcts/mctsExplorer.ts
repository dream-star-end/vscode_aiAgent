/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IAIProviderService, IChatMessage } from '../../../../../platform/aiProvider/common/aiProvider.js';
import { TaskNode, TaskResult } from '../taskDAG.js';
import { IWorker } from '../worker/worker.js';

// -- Branch State --------------------------------------------------------

export const enum BranchState {
	Pending = 'pending',
	Running = 'running',
	Completed = 'completed',
	Failed = 'failed',
	RolledBack = 'rolled-back',
}

// -- Branch Entry --------------------------------------------------------

export interface IBranchEntry {
	readonly id: string;
	readonly strategy: string;
	state: BranchState;
	result?: TaskResult;
	score: number;
}

// -- Value Score ---------------------------------------------------------

export interface IValueScore {
	readonly buildScore: number;
	readonly testScore: number;
	readonly qualityScore: number;
	readonly totalScore: number;
}

// -- Branch Manager ------------------------------------------------------

export class BranchManager {

	private readonly _branches = new Map<string, IBranchEntry>();

	createBranch(id: string, strategy: string): IBranchEntry {
		const branch: IBranchEntry = {
			id,
			strategy,
			state: BranchState.Pending,
			score: 0,
		};
		this._branches.set(id, branch);
		return branch;
	}

	getBranch(id: string): IBranchEntry | undefined {
		return this._branches.get(id);
	}

	getAllBranches(): IBranchEntry[] {
		return [...this._branches.values()];
	}

	markRunning(id: string): void {
		const branch = this._branches.get(id);
		if (branch) {
			branch.state = BranchState.Running;
		}
	}

	markCompleted(id: string, result: TaskResult, score: number): void {
		const branch = this._branches.get(id);
		if (branch) {
			branch.state = BranchState.Completed;
			branch.result = result;
			branch.score = score;
		}
	}

	markFailed(id: string, result: TaskResult): void {
		const branch = this._branches.get(id);
		if (branch) {
			branch.state = BranchState.Failed;
			branch.result = result;
			branch.score = 0;
		}
	}

	markRolledBack(id: string): void {
		const branch = this._branches.get(id);
		if (branch) {
			branch.state = BranchState.RolledBack;
		}
	}

	getBestBranch(): IBranchEntry | undefined {
		let best: IBranchEntry | undefined;
		for (const branch of this._branches.values()) {
			if (branch.state === BranchState.Completed) {
				if (!best || branch.score > best.score) {
					best = branch;
				}
			}
		}
		return best;
	}

	clear(): void {
		this._branches.clear();
	}
}

// -- Value Estimator -----------------------------------------------------

export class ValueEstimator {

	constructor(
		private readonly _aiProviderService: IAIProviderService,
		private readonly _logService: ILogService,
	) { }

	async estimate(task: TaskNode, result: TaskResult, token?: CancellationToken): Promise<IValueScore> {
		const buildScore = result.status === 'success' ? 1.0 : 0.0;
		const testScore = this._estimateTestScore(result);
		const qualityScore = await this._estimateQualityScore(task, result, token);
		const totalScore = (buildScore * 0.4) + (testScore * 0.3) + (qualityScore * 0.3);

		return { buildScore, testScore, qualityScore, totalScore };
	}

	private _estimateTestScore(result: TaskResult): number {
		if (result.status === 'failure') {
			return 0;
		}

		const output = result.output.toLowerCase();
		if (output.includes('all tests passed') || output.includes('tests: 0 failed')) {
			return 1.0;
		}
		if (output.includes('test') && output.includes('passed')) {
			return 0.8;
		}
		if (output.includes('test') && output.includes('failed')) {
			return 0.3;
		}
		return 0.5;
	}

	private async _estimateQualityScore(task: TaskNode, result: TaskResult, token?: CancellationToken): Promise<number> {
		if (result.status === 'failure') {
			return 0;
		}

		try {
			const messages: IChatMessage[] = [
				{
					role: 'system',
					content: [
						'Rate the quality of this task output on a scale of 0 to 100.',
						'Return ONLY a JSON object: {"score": <number>}',
					].join('\n'),
				},
				{
					role: 'user',
					content: [
						`Task: ${task.description}`,
						`Output (truncated): ${result.output.substring(0, 2000)}`,
					].join('\n'),
				},
			];

			const models = await this._aiProviderService.listModels();
			const modelId = models.length > 0 ? models[0].id : 'default';

			let fullResponse = '';
			for await (const chunk of this._aiProviderService.chatCompletion({
				model: modelId,
				messages,
				temperature: 0.1,
				responseFormat: { type: 'json_object' },
			}, token ?? CancellationToken.None)) {
				for (const choice of chunk.choices) {
					if (choice.delta.content) {
						fullResponse += choice.delta.content;
					}
				}
			}

			const parsed: unknown = JSON.parse(fullResponse.trim());
			if (parsed && typeof parsed === 'object') {
				const obj = parsed as Record<string, unknown>;
				if (typeof obj.score === 'number') {
					return Math.min(1, Math.max(0, obj.score / 100));
				}
			}
		} catch (err) {
			this._logService.warn('[ValueEstimator] Quality estimation failed:', err);
		}

		return 0.5;
	}
}

// -- Exploration Strategies ----------------------------------------------

const EXPLORATION_STRATEGIES = [
	'conservative: Follow the most direct and conventional approach to solve this task.',
	'creative: Try an alternative or unconventional approach to solve this task.',
	'thorough: Break the task into smaller steps and solve each one carefully with extra validation.',
];

// -- MCTS Explorer -------------------------------------------------------

export class MCTSExplorer {

	private readonly _branchManager: BranchManager;
	private readonly _valueEstimator: ValueEstimator;

	constructor(
		private readonly _worker: IWorker,
		private readonly _aiProviderService: IAIProviderService,
		private readonly _logService: ILogService,
	) {
		this._branchManager = new BranchManager();
		this._valueEstimator = new ValueEstimator(this._aiProviderService, this._logService);
	}

	async explore(task: TaskNode, maxBranches: number = 3): Promise<TaskResult> {
		this._logService.info(`[MCTSExplorer] Starting exploration for task: ${task.id} with ${maxBranches} branches`);
		this._branchManager.clear();

		const branchCount = Math.min(maxBranches, EXPLORATION_STRATEGIES.length);
		const branchPromises: Promise<void>[] = [];

		for (let i = 0; i < branchCount; i++) {
			const branchId = `${task.id}_branch_${i}`;
			const strategy = EXPLORATION_STRATEGIES[i];
			this._branchManager.createBranch(branchId, strategy);
			branchPromises.push(this._executeBranch(branchId, task, strategy));
		}

		await Promise.allSettled(branchPromises);

		const bestBranch = this._branchManager.getBestBranch();
		this._rollbackFailedBranches(bestBranch?.id);

		if (bestBranch?.result) {
			this._logService.info(`[MCTSExplorer] Best branch: ${bestBranch.id} (score: ${bestBranch.score.toFixed(2)})`);
			return bestBranch.result;
		}

		this._logService.warn(`[MCTSExplorer] No successful branches for task: ${task.id}`);
		return {
			status: 'failure',
			output: 'All exploration branches failed',
			tokensUsed: this._getTotalTokensUsed(),
			duration: 0,
		};
	}

	private async _executeBranch(branchId: string, task: TaskNode, strategy: string): Promise<void> {
		this._branchManager.markRunning(branchId);
		this._logService.debug(`[MCTSExplorer] Executing branch: ${branchId}`);

		const cts = new CancellationTokenSource();
		try {
			const modifiedTask: TaskNode = {
				...task,
				description: `${task.description}\n\nStrategy: ${strategy}`,
			};

			const result = await this._worker.execute(modifiedTask);

			if (result.status === 'success') {
				const valueScore = await this._valueEstimator.estimate(task, result, cts.token);
				this._branchManager.markCompleted(branchId, result, valueScore.totalScore);
				this._logService.debug(`[MCTSExplorer] Branch ${branchId} completed with score: ${valueScore.totalScore.toFixed(2)}`);
			} else {
				this._branchManager.markFailed(branchId, result);
				this._logService.debug(`[MCTSExplorer] Branch ${branchId} failed: ${result.output.substring(0, 200)}`);
			}
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : String(err);
			this._branchManager.markFailed(branchId, {
				status: 'failure',
				output: errorMessage,
				tokensUsed: 0,
				duration: 0,
			});
		} finally {
			cts.dispose();
		}
	}

	private _rollbackFailedBranches(bestBranchId: string | undefined): void {
		for (const branch of this._branchManager.getAllBranches()) {
			if (branch.id !== bestBranchId && branch.state !== BranchState.RolledBack) {
				if (branch.state === BranchState.Failed || branch.state === BranchState.Completed) {
					this._branchManager.markRolledBack(branch.id);
					this._logService.debug(`[MCTSExplorer] Rolled back branch: ${branch.id}`);
				}
			}
		}
	}

	private _getTotalTokensUsed(): number {
		let total = 0;
		for (const branch of this._branchManager.getAllBranches()) {
			if (branch.result) {
				total += branch.result.tokensUsed;
			}
		}
		return total;
	}
}
