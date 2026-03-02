/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IAIProviderService, IChatMessage } from '../../../../../platform/aiProvider/common/aiProvider.js';
import { IGoal } from '../aiAgent.js';
import { TaskDAG, TaskNode, TaskResult, TaskStatus, TaskTopology } from '../taskDAG.js';

// -- Planner Interface ---------------------------------------------------

export interface IPlanner {
	decompose(goal: IGoal, token?: CancellationToken): Promise<TaskDAG>;
	needsReplan(dag: TaskDAG, results: TaskResult[]): boolean;
	replan(dag: TaskDAG, results: TaskResult[], token?: CancellationToken): Promise<void>;
}

// -- Parsed Task ---------------------------------------------------------

interface IParsedTask {
	readonly id: string;
	readonly description: string;
	readonly topology: string;
	readonly dependencies: string[];
}

// -- Goal Decomposer Implementation -------------------------------------

const DECOMPOSITION_PROMPT = [
	'You are a task planning agent. Given a goal, decompose it into a list of tasks.',
	'Each task should be a concrete, actionable unit of work.',
	'Return a JSON array of objects with these fields:',
	'  - id: unique string identifier (e.g., "task_1")',
	'  - description: what this task does',
	'  - topology: one of "simple", "standard", "complex", "exploratory"',
	'  - dependencies: array of task ids this depends on (empty if none)',
	'Return ONLY valid JSON, no markdown fences or extra text.',
].join('\n');

export class GoalDecomposer implements IPlanner {

	constructor(
		private readonly _aiProviderService: IAIProviderService,
		private readonly _logService: ILogService,
	) { }

	async decompose(goal: IGoal, token?: CancellationToken): Promise<TaskDAG> {
		const messages: IChatMessage[] = [
			{ role: 'system', content: DECOMPOSITION_PROMPT },
			{ role: 'user', content: `Goal: ${goal.description}` },
		];

		let fullResponse = '';
		const models = await this._aiProviderService.listModels();
		const modelId = models.length > 0 ? models[0].id : 'default';

		for await (const chunk of this._aiProviderService.chatCompletion({
			model: modelId,
			messages,
			temperature: 0.2,
			responseFormat: { type: 'json_object' },
		}, token ?? CancellationToken.None)) {
			for (const choice of chunk.choices) {
				if (choice.delta.content) {
					fullResponse += choice.delta.content;
				}
			}
		}

		this._logService.debug('[GoalDecomposer] LLM response:', fullResponse);

		const tasks = this._parseTaskList(fullResponse);
		return this._buildDAG(tasks);
	}

	needsReplan(dag: TaskDAG, results: TaskResult[]): boolean {
		const failureCount = results.filter(r => r.status === 'failure').length;
		const totalCount = results.length;

		if (totalCount === 0) {
			return false;
		}

		const failureRate = failureCount / totalCount;
		if (failureRate > 0.5) {
			return true;
		}

		const allTasks = dag.getAllTasks();
		const blockedCount = allTasks.filter(t => t.status === TaskStatus.Blocked).length;
		if (blockedCount > allTasks.length * 0.5) {
			return true;
		}

		return false;
	}

	async replan(dag: TaskDAG, results: TaskResult[], token?: CancellationToken): Promise<void> {
		const currentState = dag.toJSON();
		const failedTasks = dag.getAllTasks().filter(t => t.status === TaskStatus.Failed);

		const messages: IChatMessage[] = [
			{ role: 'system', content: DECOMPOSITION_PROMPT },
			{
				role: 'user',
				content: [
					'Some tasks have failed. Please provide replacement tasks.',
					`Current plan: ${JSON.stringify(currentState.nodes.map(n => ({ id: n.id, description: n.description, status: n.status })))}`,
					`Failed tasks: ${JSON.stringify(failedTasks.map(t => ({ id: t.id, description: t.description, error: t.result?.output })))}`,
					'Provide replacement tasks for the failed ones. Keep the same id prefix but append "_retry".',
				].join('\n'),
			},
		];

		let fullResponse = '';
		const models = await this._aiProviderService.listModels();
		const modelId = models.length > 0 ? models[0].id : 'default';

		for await (const chunk of this._aiProviderService.chatCompletion({
			model: modelId,
			messages,
			temperature: 0.2,
			responseFormat: { type: 'json_object' },
		}, token ?? CancellationToken.None)) {
			for (const choice of chunk.choices) {
				if (choice.delta.content) {
					fullResponse += choice.delta.content;
				}
			}
		}

		const replacementTasks = this._parseTaskList(fullResponse);
		for (const parsed of replacementTasks) {
			const taskNode: TaskNode = {
				id: parsed.id,
				description: parsed.description,
				status: TaskStatus.Pending,
				topology: this._mapTopology(parsed.topology),
				dependencies: parsed.dependencies,
			};
			dag.addTask(taskNode);
		}
	}

	private _parseTaskList(response: string): IParsedTask[] {
		try {
			const trimmed = response.trim();
			const parsed: unknown = JSON.parse(trimmed);

			let tasks: unknown[];
			if (Array.isArray(parsed)) {
				tasks = parsed;
			} else if (parsed && typeof parsed === 'object' && Array.isArray((parsed as Record<string, unknown>).tasks)) {
				tasks = (parsed as Record<string, unknown>).tasks as unknown[];
			} else {
				this._logService.warn('[GoalDecomposer] Unexpected JSON structure, creating single task');
				return [{
					id: 'task_1',
					description: 'Execute the goal directly',
					topology: 'simple',
					dependencies: [],
				}];
			}

			return tasks.map((item, index) => {
				const t = item as Record<string, unknown>;
				return {
					id: (typeof t.id === 'string' ? t.id : `task_${index + 1}`),
					description: (typeof t.description === 'string' ? t.description : 'Unknown task'),
					topology: (typeof t.topology === 'string' ? t.topology : 'standard'),
					dependencies: (Array.isArray(t.dependencies) ? t.dependencies.filter((d): d is string => typeof d === 'string') : []),
				};
			});
		} catch (e) {
			this._logService.error('[GoalDecomposer] Failed to parse LLM response:', e);
			return [{
				id: 'task_1',
				description: 'Execute the goal directly',
				topology: 'simple',
				dependencies: [],
			}];
		}
	}

	private _buildDAG(tasks: IParsedTask[]): TaskDAG {
		const dag = new TaskDAG();
		for (const parsed of tasks) {
			const taskNode: TaskNode = {
				id: parsed.id,
				description: parsed.description,
				status: TaskStatus.Pending,
				topology: this._mapTopology(parsed.topology),
				dependencies: parsed.dependencies,
			};
			dag.addTask(taskNode);
		}
		return dag;
	}

	private _mapTopology(value: string): TaskTopology {
		switch (value) {
			case 'simple': return TaskTopology.Simple;
			case 'complex': return TaskTopology.Complex;
			case 'exploratory': return TaskTopology.Exploratory;
			default: return TaskTopology.Standard;
		}
	}
}
