/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { OpenAICompatibleProvider, OpenAICompatibleConfig } from './openaiCompatibleProvider.js';

const DEEPSEEK_MODELS = [
	{ id: 'deepseek-chat', name: 'DeepSeek Chat (V3)', maxInputTokens: 64000, maxOutputTokens: 8192, costPerInputToken: 0.27e-6, costPerOutputToken: 1.1e-6, capabilities: { chat: true, completion: true, embedding: false, vision: false, toolUse: true, streaming: true } },
	{ id: 'deepseek-reasoner', name: 'DeepSeek Reasoner (R1)', maxInputTokens: 64000, maxOutputTokens: 8192, costPerInputToken: 0.55e-6, costPerOutputToken: 2.19e-6, capabilities: { chat: true, completion: false, embedding: false, vision: false, toolUse: false, streaming: true } },
];

export function createDeepSeekProvider(apiKey: string): OpenAICompatibleProvider {
	const config: OpenAICompatibleConfig = {
		id: 'deepseek',
		displayName: 'DeepSeek',
		baseUrl: 'https://api.deepseek.com/v1',
		apiKey,
		models: DEEPSEEK_MODELS,
	};
	return new OpenAICompatibleProvider(config);
}
