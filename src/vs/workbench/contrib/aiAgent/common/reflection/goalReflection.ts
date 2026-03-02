/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IAIProviderService, IChatMessage } from '../../../../../platform/aiProvider/common/aiProvider.js';
import { IGoal, IGoalStatus } from '../aiAgent.js';
import { TaskDAG } from '../taskDAG.js';

// -- Replan Decision ----------------------------------------------------

export const enum ReplanDecision {
	Continue = 'continue',
	Replan = 'replan',
	Abort = 'abort',
}

// -- Goal Reflection Result ---------------------------------------------

export interface IGoalReflectionResult {
	readonly goalId: string;
	readonly decision: ReplanDecision;
	readonly progressAssessment: string;
	readonly concerns: string[];
	readonly suggestedAdjustments: string[];
	readonly estimatedCompletion: number;
}

// -- Goal Reflection -----------------------------------------------------

const GOAL_REFLECTION_PROMPT = [
	'Review the overall progress of a goal execution.',
	'Determine if replanning is needed.',
	'Return a JSON object:',
	'{',
	'  "decision": "continue" | "replan" | "abort",',
	'  "progressAssessment": "...",',
	'  "concerns": ["..."],',
	'  "suggestedAdjustments": ["..."],',
	'  "estimatedCompletion": 0-100',
	'}',
	'Return ONLY valid JSON, no markdown fences or extra text.',
].join('\n');

export class GoalReflection {

	constructor(
		private readonly _aiProviderService: IAIProviderService,
		private readonly _logService: ILogService,
	) { }

	async reflect(
		goal: IGoal,
		status: IGoalStatus,
		dag: TaskDAG,
		token?: CancellationToken,
	): Promise<IGoalReflectionResult> {
		this._logService.info(`[GoalReflection] Reflecting on goal: ${goal.id}`);

		const allTasks = dag.getAllTasks();
		const taskSummary = allTasks.map(t => ({
			id: t.id,
			description: t.description,
			status: String(t.status),
			hasResult: t.result !== undefined,
		}));

		const messages: IChatMessage[] = [
			{ role: 'system', content: GOAL_REFLECTION_PROMPT },
			{
				role: 'user',
				content: [
					`Goal: ${goal.description}`,
					`Phase: ${status.phase}`,
					`Progress: ${status.completedTasks}/${status.totalTasks} completed, ${status.failedTasks} failed`,
					`Tokens used: ${status.tokensUsed}`,
					`Budget: ${goal.constraints.maxTokenBudget}`,
					`Elapsed: ${status.elapsedMs}ms`,
					`Max time: ${goal.constraints.maxTimeSeconds}s`,
					`Tasks: ${JSON.stringify(taskSummary)}`,
				].join('\n'),
			},
		];

		try {
			const models = await this._aiProviderService.listModels();
			const modelId = models.length > 0 ? models[0].id : 'default';

			let fullResponse = '';
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

			return this._parseReflectionResult(goal.id, fullResponse);
		} catch (err) {
			this._logService.error('[GoalReflection] Reflection failed:', err);
			return this._createFallbackResult(goal.id, status);
		}
	}

	shouldReflect(status: IGoalStatus, lastReflectionTime: number, intervalMs: number = 60000): boolean {
		const elapsed = Date.now() - lastReflectionTime;
		if (elapsed < intervalMs) {
			return false;
		}

		if (status.failedTasks > 0 && status.totalTasks > 0) {
			const failureRate = status.failedTasks / status.totalTasks;
			if (failureRate > 0.3) {
				return true;
			}
		}

		if (status.completedTasks > 0 && status.completedTasks % 5 === 0) {
			return true;
		}

		return elapsed >= intervalMs;
	}

	private _parseReflectionResult(goalId: string, response: string): IGoalReflectionResult {
		try {
			const parsed: unknown = JSON.parse(response.trim());
			if (parsed && typeof parsed === 'object') {
				const obj = parsed as Record<string, unknown>;

				let decision: ReplanDecision;
				switch (obj.decision) {
					case 'replan':
						decision = ReplanDecision.Replan;
						break;
					case 'abort':
						decision = ReplanDecision.Abort;
						break;
					default:
						decision = ReplanDecision.Continue;
				}

				return {
					goalId,
					decision,
					progressAssessment: typeof obj.progressAssessment === 'string'
						? obj.progressAssessment
						: 'Unknown',
					concerns: Array.isArray(obj.concerns)
						? obj.concerns.filter((c): c is string => typeof c === 'string')
						: [],
					suggestedAdjustments: Array.isArray(obj.suggestedAdjustments)
						? obj.suggestedAdjustments.filter((s): s is string => typeof s === 'string')
						: [],
					estimatedCompletion: typeof obj.estimatedCompletion === 'number'
						? Math.min(100, Math.max(0, obj.estimatedCompletion))
						: 0,
				};
			}
		} catch (e) {
			this._logService.warn('[GoalReflection] Failed to parse reflection result:', e);
		}

		return {
			goalId,
			decision: ReplanDecision.Continue,
			progressAssessment: 'Could not parse reflection result',
			concerns: [],
			suggestedAdjustments: [],
			estimatedCompletion: 0,
		};
	}

	private _createFallbackResult(goalId: string, status: IGoalStatus): IGoalReflectionResult {
		const failureRate = status.totalTasks > 0 ? status.failedTasks / status.totalTasks : 0;

		let decision: ReplanDecision;
		if (failureRate > 0.7) {
			decision = ReplanDecision.Abort;
		} else if (failureRate > 0.3) {
			decision = ReplanDecision.Replan;
		} else {
			decision = ReplanDecision.Continue;
		}

		const completionRate = status.totalTasks > 0
			? Math.round((status.completedTasks / status.totalTasks) * 100)
			: 0;

		return {
			goalId,
			decision,
			progressAssessment: `${status.completedTasks}/${status.totalTasks} tasks completed`,
			concerns: failureRate > 0 ? [`Failure rate: ${Math.round(failureRate * 100)}%`] : [],
			suggestedAdjustments: [],
			estimatedCompletion: completionRate,
		};
	}
}
