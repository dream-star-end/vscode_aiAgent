/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { OpenAICompatibleProvider, OpenAICompatibleConfig } from './openaiCompatibleProvider.js';

const OPENAI_MODELS = [
	{ id: 'gpt-4o', name: 'GPT-4o', maxInputTokens: 128000, maxOutputTokens: 16384, costPerInputToken: 2.5e-6, costPerOutputToken: 10e-6, capabilities: { chat: true, completion: false, embedding: false, vision: true, toolUse: true, streaming: true } },
	{ id: 'gpt-4o-mini', name: 'GPT-4o Mini', maxInputTokens: 128000, maxOutputTokens: 16384, costPerInputToken: 0.15e-6, costPerOutputToken: 0.6e-6, capabilities: { chat: true, completion: false, embedding: false, vision: true, toolUse: true, streaming: true } },
	{ id: 'o1', name: 'o1', maxInputTokens: 200000, maxOutputTokens: 100000, costPerInputToken: 15e-6, costPerOutputToken: 60e-6, capabilities: { chat: true, completion: false, embedding: false, vision: true, toolUse: true, streaming: true } },
	{ id: 'o3-mini', name: 'o3-mini', maxInputTokens: 200000, maxOutputTokens: 100000, costPerInputToken: 1.1e-6, costPerOutputToken: 4.4e-6, capabilities: { chat: true, completion: false, embedding: false, vision: false, toolUse: true, streaming: true } },
	{ id: 'text-embedding-3-small', name: 'Embedding 3 Small', maxInputTokens: 8191, maxOutputTokens: 0, costPerInputToken: 0.02e-6, costPerOutputToken: 0, capabilities: { chat: false, completion: false, embedding: true, vision: false, toolUse: false, streaming: false } },
	{ id: 'text-embedding-3-large', name: 'Embedding 3 Large', maxInputTokens: 8191, maxOutputTokens: 0, costPerInputToken: 0.13e-6, costPerOutputToken: 0, capabilities: { chat: false, completion: false, embedding: true, vision: false, toolUse: false, streaming: false } },
];

export function createOpenAIProvider(apiKey: string, organizationId?: string): OpenAICompatibleProvider {
	const config: OpenAICompatibleConfig = {
		id: 'openai',
		displayName: 'OpenAI',
		baseUrl: 'https://api.openai.com/v1',
		apiKey,
		organizationId,
		models: OPENAI_MODELS,
	};
	return new OpenAICompatibleProvider(config);
}
