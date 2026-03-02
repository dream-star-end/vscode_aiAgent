/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IAIProviderService, IChatMessage } from '../../../../../platform/aiProvider/common/aiProvider.js';
import { TaskNode, TaskResult } from '../taskDAG.js';

// -- Judge Verdict -------------------------------------------------------

export interface JudgeVerdict {
	readonly passed: boolean;
	readonly score: number;
	readonly issues: string[];
	readonly suggestions: string[];
}

// -- Judge Interface -----------------------------------------------------

export interface IJudge {
	verify(task: TaskNode, result: TaskResult, token?: CancellationToken): Promise<JudgeVerdict>;
}

// -- Parsed Verdict ------------------------------------------------------

interface IParsedVerdict {
	readonly passed: boolean;
	readonly score: number;
	readonly issues: string[];
	readonly suggestions: string[];
}

// -- Build Verifier Implementation ---------------------------------------

const VERIFICATION_PROMPT = [
	'You are a code review judge. Evaluate whether a task was completed successfully.',
	'Analyze the task description and the output produced.',
	'Return a JSON object with:',
	'  - passed: boolean (true if task was completed successfully)',
	'  - score: number 0-100 (quality score)',
	'  - issues: string[] (list of problems found)',
	'  - suggestions: string[] (list of improvement suggestions)',
	'Return ONLY valid JSON, no markdown fences or extra text.',
].join('\n');

export class BuildVerifier implements IJudge {

	constructor(
		private readonly _aiProviderService: IAIProviderService,
		private readonly _logService: ILogService,
	) { }

	async verify(task: TaskNode, result: TaskResult, token?: CancellationToken): Promise<JudgeVerdict> {
		if (result.status === 'failure') {
			return {
				passed: false,
				score: 0,
				issues: [`Task failed with error: ${result.output}`],
				suggestions: ['Review the error and retry the task with a different approach'],
			};
		}

		const messages: IChatMessage[] = [
			{ role: 'system', content: VERIFICATION_PROMPT },
			{
				role: 'user',
				content: [
					`Task: ${task.description}`,
					`Task topology: ${task.topology}`,
					`Output: ${result.output.substring(0, 4000)}`,
					`Duration: ${result.duration}ms`,
					`Tokens used: ${result.tokensUsed}`,
				].join('\n'),
			},
		];

		let fullResponse = '';
		const models = await this._aiProviderService.listModels();
		const modelId = models.length > 0 ? models[0].id : 'default';

		try {
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

			return this._parseVerdict(fullResponse);
		} catch (err) {
			this._logService.error('[BuildVerifier] Failed to verify task:', err);
			return this._createFallbackVerdict(result);
		}
	}

	private _parseVerdict(response: string): JudgeVerdict {
		try {
			const parsed: unknown = JSON.parse(response.trim());
			if (parsed && typeof parsed === 'object') {
				const obj = parsed as Record<string, unknown>;
				const verdict: IParsedVerdict = {
					passed: typeof obj.passed === 'boolean' ? obj.passed : false,
					score: typeof obj.score === 'number' ? Math.min(100, Math.max(0, obj.score)) : 0,
					issues: Array.isArray(obj.issues) ? obj.issues.filter((i): i is string => typeof i === 'string') : [],
					suggestions: Array.isArray(obj.suggestions) ? obj.suggestions.filter((s): s is string => typeof s === 'string') : [],
				};
				return verdict;
			}
		} catch (e) {
			this._logService.warn('[BuildVerifier] Failed to parse verdict JSON:', e);
		}

		return {
			passed: false,
			score: 0,
			issues: ['Could not parse verification result'],
			suggestions: ['Manual review recommended'],
		};
	}

	private _createFallbackVerdict(result: TaskResult): JudgeVerdict {
		const passed = result.status === 'success' && result.output.length > 0;
		return {
			passed,
			score: passed ? 50 : 0,
			issues: passed ? [] : ['Verification could not be completed'],
			suggestions: ['Manual verification recommended'],
		};
	}
}
