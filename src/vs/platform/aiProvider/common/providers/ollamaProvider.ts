/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { OpenAICompatibleProvider, OpenAICompatibleConfig } from './openaiCompatibleProvider.js';
import { IAIModel } from '../aiProvider.js';

interface OllamaModelEntry {
	name?: string;
	model?: string;
}

/**
 * Ollama provider - uses the OpenAI-compatible API that Ollama exposes.
 * Model list is dynamically fetched from the local Ollama instance.
 */
export class OllamaProvider extends OpenAICompatibleProvider {

	constructor(config: OpenAICompatibleConfig) {
		super(config);
	}

	override async listModels(): Promise<IAIModel[]> {
		try {
			const baseHost = this.config.baseUrl.replace(/\/v1\/?$/, '');
			const response = await fetch(`${baseHost}/api/tags`);
			if (!response.ok) {
				return super.listModels();
			}
			const data = await response.json() as { models?: OllamaModelEntry[] };
			const models: IAIModel[] = (data.models ?? [])
				.filter((m): m is OllamaModelEntry & { name: string } => typeof m.name === 'string' || typeof m.model === 'string')
				.map((m) => ({
					id: (m.name ?? m.model) as string,
					name: (m.name ?? m.model) as string,
					providerId: this.id,
					capabilities: { chat: true, completion: true, embedding: false, vision: false, toolUse: false, streaming: true },
				}));
			return models;
		} catch {
			return super.listModels();
		}
	}

	protected override buildHeaders(): Record<string, string> {
		return { 'Content-Type': 'application/json' };
	}
}

export function createOllamaProvider(baseUrl: string = 'http://localhost:11434/v1'): OllamaProvider {
	const config: OpenAICompatibleConfig = {
		id: 'ollama',
		displayName: 'Ollama (Local)',
		baseUrl: baseUrl.replace(/\/+$/, ''),
		apiKey: 'ollama',
		models: [{
			id: 'default',
			name: 'Default Local Model',
			maxInputTokens: 128000,
			maxOutputTokens: 4096,
			costPerInputToken: 0,
			costPerOutputToken: 0,
			capabilities: { chat: true, completion: true, embedding: false, vision: false, toolUse: false, streaming: true },
		}],
	};
	return new OllamaProvider(config);
}
