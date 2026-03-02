/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IAIProviderService, IChatMessage } from '../../../../../platform/aiProvider/common/aiProvider.js';

// -- Alternative Action --------------------------------------------------

export interface IAlternativeAction {
	readonly description: string;
	readonly rationale: string;
	readonly confidence: number;
}

// -- Action Reflection Result --------------------------------------------

export interface IActionReflectionResult {
	readonly originalAction: string;
	readonly failureReason: string;
	readonly alternatives: IAlternativeAction[];
	readonly selectedAlternative: IAlternativeAction | undefined;
}

// -- Action Reflection ---------------------------------------------------

const ACTION_REFLECTION_PROMPT = [
	'A tool call has failed. Analyze the failure and generate 2-3 alternative actions.',
	'For each alternative, provide:',
	'  - description: what action to take instead',
	'  - rationale: why this alternative might work',
	'  - confidence: 0-1 score of how likely this will succeed',
	'Return a JSON object:',
	'{',
	'  "alternatives": [',
	'    { "description": "...", "rationale": "...", "confidence": 0.8 }',
	'  ]',
	'}',
	'Return ONLY valid JSON, no markdown fences or extra text.',
].join('\n');

export class ActionReflection {

	constructor(
		private readonly _aiProviderService: IAIProviderService,
		private readonly _logService: ILogService,
	) { }

	async reflect(
		action: string,
		failureReason: string,
		context: string,
		token?: CancellationToken,
	): Promise<IActionReflectionResult> {
		this._logService.info(`[ActionReflection] Reflecting on failed action: ${action.substring(0, 100)}`);

		const messages: IChatMessage[] = [
			{ role: 'system', content: ACTION_REFLECTION_PROMPT },
			{
				role: 'user',
				content: [
					`Failed action: ${action}`,
					`Failure reason: ${failureReason}`,
					`Context: ${context}`,
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
				temperature: 0.3,
				responseFormat: { type: 'json_object' },
			}, token ?? CancellationToken.None)) {
				for (const choice of chunk.choices) {
					if (choice.delta.content) {
						fullResponse += choice.delta.content;
					}
				}
			}

			const alternatives = this._parseAlternatives(fullResponse);
			const selectedAlternative = this._selectBestAlternative(alternatives);

			this._logService.debug(
				`[ActionReflection] Generated ${alternatives.length} alternatives, ` +
				`selected: ${selectedAlternative?.description ?? 'none'}`
			);

			return {
				originalAction: action,
				failureReason,
				alternatives,
				selectedAlternative,
			};
		} catch (err) {
			this._logService.error('[ActionReflection] Reflection failed:', err);
			return {
				originalAction: action,
				failureReason,
				alternatives: [],
				selectedAlternative: undefined,
			};
		}
	}

	private _parseAlternatives(response: string): IAlternativeAction[] {
		try {
			const parsed: unknown = JSON.parse(response.trim());
			if (parsed && typeof parsed === 'object') {
				const obj = parsed as Record<string, unknown>;
				if (Array.isArray(obj.alternatives)) {
					return obj.alternatives
						.filter((item): item is Record<string, unknown> =>
							typeof item === 'object' && item !== null
						)
						.map(item => ({
							description: typeof item.description === 'string' ? item.description : '',
							rationale: typeof item.rationale === 'string' ? item.rationale : '',
							confidence: typeof item.confidence === 'number'
								? Math.min(1, Math.max(0, item.confidence))
								: 0,
						}))
						.filter(alt => alt.description.length > 0);
				}
			}
		} catch (e) {
			this._logService.warn('[ActionReflection] Failed to parse alternatives:', e);
		}
		return [];
	}

	private _selectBestAlternative(alternatives: IAlternativeAction[]): IAlternativeAction | undefined {
		if (alternatives.length === 0) {
			return undefined;
		}
		let best = alternatives[0];
		for (let i = 1; i < alternatives.length; i++) {
			if (alternatives[i].confidence > best.confidence) {
				best = alternatives[i];
			}
		}
		return best;
	}
}
