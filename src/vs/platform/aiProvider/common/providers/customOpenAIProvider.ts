/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { OpenAICompatibleProvider, OpenAICompatibleConfig, OpenAICompatibleModelDef } from './openaiCompatibleProvider.js';

export interface CustomOpenAIProviderOptions {
	readonly baseUrl: string;
	readonly apiKey: string;
	readonly displayName?: string;
	readonly models?: OpenAICompatibleModelDef[];
}

const DEFAULT_CUSTOM_MODEL: OpenAICompatibleModelDef = {
	id: 'default',
	name: 'Default Model',
	maxInputTokens: 128000,
	maxOutputTokens: 4096,
	costPerInputToken: 0,
	costPerOutputToken: 0,
	capabilities: { chat: true, completion: true, embedding: false, vision: false, toolUse: true, streaming: true },
};

export function createCustomOpenAIProvider(options: CustomOpenAIProviderOptions): OpenAICompatibleProvider {
	const config: OpenAICompatibleConfig = {
		id: 'custom-openai',
		displayName: options.displayName ?? 'Custom OpenAI',
		baseUrl: options.baseUrl.replace(/\/+$/, ''),
		apiKey: options.apiKey,
		models: options.models ?? [DEFAULT_CUSTOM_MODEL],
	};
	return new OpenAICompatibleProvider(config);
}
