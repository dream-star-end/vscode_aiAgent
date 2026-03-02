/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IAIProviderService, IChatMessage } from '../../../../../platform/aiProvider/common/aiProvider.js';
import { TaskNode, TaskResult } from '../taskDAG.js';
import { KnowledgeBlock } from '../../../../services/aiContext/common/aiContext.js';

// -- Task Expectation ---------------------------------------------------

export interface ITaskExpectation {
	readonly expectedOutcome: string;
	readonly qualityCriteria: string[];
}

// -- Task Reflection Result ---------------------------------------------

export interface ITaskReflectionResult {
	readonly taskId: string;
	readonly meetsExpectations: boolean;
	readonly deviations: string[];
	readonly learnings: KnowledgeBlock[];
	readonly qualityScore: number;
}

// -- Task Reflection -----------------------------------------------------

const TASK_REFLECTION_PROMPT = [
	'Compare a completed task with its expected outcome.',
	'Extract learnings from the execution.',
	'Return a JSON object:',
	'{',
	'  "meetsExpectations": true/false,',
	'  "deviations": ["..."],',
	'  "learnings": [{"summary": "...", "importance": "high/medium/low"}],',
	'  "qualityScore": 0-100',
	'}',
	'Return ONLY valid JSON, no markdown fences or extra text.',
].join('\n');

export class TaskReflection {

	constructor(
		private readonly _aiProviderService: IAIProviderService,
		private readonly _logService: ILogService,
	) { }

	async reflect(
		task: TaskNode,
		result: TaskResult,
		expectation: ITaskExpectation,
		token?: CancellationToken,
	): Promise<ITaskReflectionResult> {
		this._logService.info(`[TaskReflection] Reflecting on task: ${task.id}`);

		const messages: IChatMessage[] = [
			{ role: 'system', content: TASK_REFLECTION_PROMPT },
			{
				role: 'user',
				content: [
					`Task: ${task.description}`,
					`Expected outcome: ${expectation.expectedOutcome}`,
					`Quality criteria: ${expectation.qualityCriteria.join(', ')}`,
					`Actual result status: ${result.status}`,
					`Actual output (truncated): ${result.output.substring(0, 3000)}`,
					`Duration: ${result.duration}ms`,
					`Tokens used: ${result.tokensUsed}`,
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

			return this._parseReflectionResult(task.id, fullResponse);
		} catch (err) {
			this._logService.error('[TaskReflection] Reflection failed:', err);
			return this._createFallbackResult(task.id, result);
		}
	}

	private _parseReflectionResult(taskId: string, response: string): ITaskReflectionResult {
		try {
			const parsed: unknown = JSON.parse(response.trim());
			if (parsed && typeof parsed === 'object') {
				const obj = parsed as Record<string, unknown>;
				const now = Date.now();

				const rawLearnings = Array.isArray(obj.learnings)
					? obj.learnings.filter((l): l is Record<string, unknown> =>
						typeof l === 'object' && l !== null
					)
					: [];

				const learnings: KnowledgeBlock[] = rawLearnings.map((l, idx) => ({
					id: `learning_${taskId}_${idx}`,
					summary: typeof l.summary === 'string' ? l.summary : 'Unknown learning',
					sourceZone: 'knowledge' as const,
					tokenCount: typeof l.summary === 'string' ? Math.ceil(l.summary.length / 4) : 0,
					createdAt: now,
				}));

				return {
					taskId,
					meetsExpectations: typeof obj.meetsExpectations === 'boolean'
						? obj.meetsExpectations
						: false,
					deviations: Array.isArray(obj.deviations)
						? obj.deviations.filter((d): d is string => typeof d === 'string')
						: [],
					learnings,
					qualityScore: typeof obj.qualityScore === 'number'
						? Math.min(100, Math.max(0, obj.qualityScore))
						: 0,
				};
			}
		} catch (e) {
			this._logService.warn('[TaskReflection] Failed to parse reflection result:', e);
		}

		return this._createEmptyResult(taskId);
	}

	private _createFallbackResult(taskId: string, result: TaskResult): ITaskReflectionResult {
		const passed = result.status === 'success';
		return {
			taskId,
			meetsExpectations: passed,
			deviations: passed ? [] : ['Task execution failed'],
			learnings: [],
			qualityScore: passed ? 50 : 0,
		};
	}

	private _createEmptyResult(taskId: string): ITaskReflectionResult {
		return {
			taskId,
			meetsExpectations: false,
			deviations: ['Could not parse reflection result'],
			learnings: [],
			qualityScore: 0,
		};
	}
}
