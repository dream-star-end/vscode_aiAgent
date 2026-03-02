/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import {
	IAIModel,
	IAIModelCapabilities,
	IAIModelMetadata,
	IAIProvider,
	IChatCompletionChunk,
	IChatCompletionRequest,
	IChatMessage,
	ICodeCompletionRequest,
	ICodeCompletionResponse,
	IEmbeddingRequest,
	IToolDefinition,
} from '../aiProvider.js';

interface AnthropicModelDef {
	readonly id: string;
	readonly name: string;
	readonly maxInputTokens: number;
	readonly maxOutputTokens: number;
	readonly costPerInputToken: number;
	readonly costPerOutputToken: number;
	readonly supportsCaching: boolean;
}

interface AnthropicEvent {
	type: string;
	message?: {
		id?: string;
		usage?: {
			input_tokens?: number;
			cache_read_input_tokens?: number;
		};
	};
	delta?: {
		type?: string;
		text?: string;
		partial_json?: string;
		stop_reason?: string;
	};
	usage?: {
		output_tokens?: number;
	};
}

const ANTHROPIC_MODELS: AnthropicModelDef[] = [
	{ id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', maxInputTokens: 200000, maxOutputTokens: 16384, costPerInputToken: 3e-6, costPerOutputToken: 15e-6, supportsCaching: true },
	{ id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', maxInputTokens: 200000, maxOutputTokens: 8192, costPerInputToken: 3e-6, costPerOutputToken: 15e-6, supportsCaching: true },
	{ id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', maxInputTokens: 200000, maxOutputTokens: 8192, costPerInputToken: 0.8e-6, costPerOutputToken: 4e-6, supportsCaching: true },
	{ id: 'claude-opus-4-20250514', name: 'Claude Opus 4', maxInputTokens: 200000, maxOutputTokens: 32000, costPerInputToken: 15e-6, costPerOutputToken: 75e-6, supportsCaching: true },
];

const CAPABILITIES: IAIModelCapabilities = { chat: true, completion: false, embedding: false, vision: true, toolUse: true, streaming: true };

export class AnthropicProvider implements IAIProvider {

	readonly id = 'anthropic';
	readonly displayName = 'Anthropic';

	constructor(
		private readonly apiKey: string,
		private readonly baseUrl: string = 'https://api.anthropic.com',
	) { }

	// -- Chat Completion (streaming, with prompt caching) --

	async *chatCompletion(request: IChatCompletionRequest, token?: CancellationToken): AsyncIterable<IChatCompletionChunk> {
		const systemMessages = request.messages.filter(m => m.role === 'system');
		const nonSystemMessages = request.messages.filter(m => m.role !== 'system');

		const body: Record<string, unknown> = {
			model: request.model,
			messages: nonSystemMessages.map(m => this.toAnthropicMessage(m)),
			max_tokens: request.maxTokens ?? 4096,
			stream: true,
		};

		// System prompt with caching support
		if (systemMessages.length > 0) {
			const systemContent = systemMessages.map(m => m.content).join('\n\n');
			if (request.cachedPrefixTokens?.length) {
				body.system = [{
					type: 'text',
					text: systemContent,
					cache_control: { type: 'ephemeral' },
				}];
			} else {
				body.system = systemContent;
			}
		}

		if (request.tools?.length) {
			body.tools = request.tools.map(t => this.toAnthropicTool(t));
		}
		if (request.temperature !== undefined) { body.temperature = request.temperature; }
		if (request.topP !== undefined) { body.top_p = request.topP; }
		if (request.stop !== undefined) { body.stop_sequences = request.stop; }

		const controller = new AbortController();
		token?.onCancellationRequested(() => controller.abort());

		const response = await fetch(`${this.baseUrl}/v1/messages`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-api-key': this.apiKey,
				'anthropic-version': '2023-06-01',
				'anthropic-beta': 'prompt-caching-2024-07-31',
			},
			body: JSON.stringify(body),
			signal: controller.signal,
		});

		if (!response.ok) {
			const errorBody = await response.text().catch(() => '');
			throw new Error(`[anthropic] API error ${response.status}: ${errorBody}`);
		}
		if (!response.body) {
			throw new Error('[anthropic] No response body');
		}

		let currentId = '';
		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let buffer = '';

		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) { break; }

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n');
				buffer = lines.pop() ?? '';

				for (const line of lines) {
					const trimmed = line.trim();
					if (!trimmed.startsWith('data: ')) { continue; }

					const jsonStr = trimmed.slice(6);
					if (jsonStr === '[DONE]') { break; }

					try {
						const event = JSON.parse(jsonStr);
						const chunk = this.processEvent(event, currentId);
						if (chunk) {
							if (event.type === 'message_start') {
								currentId = event.message?.id ?? '';
							}
							yield chunk;
						}
					} catch {
						// skip malformed
					}
				}
			}
		} finally {
			reader.releaseLock();
		}
	}

	async codeCompletion(_request: ICodeCompletionRequest, _token?: CancellationToken): Promise<ICodeCompletionResponse> {
		throw new Error('[anthropic] Code completion (FIM) is not supported by Anthropic.');
	}

	async generateEmbedding(_request: IEmbeddingRequest, _token?: CancellationToken): Promise<number[]> {
		throw new Error('[anthropic] Embedding generation is not supported by Anthropic.');
	}

	async listModels(): Promise<IAIModel[]> {
		return ANTHROPIC_MODELS.map(m => ({
			id: m.id,
			name: m.name,
			providerId: this.id,
			capabilities: CAPABILITIES,
		}));
	}

	getModelMetadata(modelId: string): IAIModelMetadata | undefined {
		const model = ANTHROPIC_MODELS.find(m => m.id === modelId);
		if (!model) { return undefined; }
		return {
			modelId: model.id,
			providerId: this.id,
			maxInputTokens: model.maxInputTokens,
			maxOutputTokens: model.maxOutputTokens,
			capabilities: CAPABILITIES,
			costPerInputToken: model.costPerInputToken,
			costPerOutputToken: model.costPerOutputToken,
			supportsCaching: model.supportsCaching,
		};
	}

	// -- Converters --

	private toAnthropicMessage(msg: IChatMessage): Record<string, unknown> {
		if (msg.role === 'tool') {
			return {
				role: 'user',
				content: [{ type: 'tool_result', tool_use_id: msg.toolCallId, content: msg.content }],
			};
		}
		if (msg.toolCalls?.length) {
			return {
				role: 'assistant',
				content: msg.toolCalls.map(tc => ({
					type: 'tool_use',
					id: tc.id,
					name: tc.function.name,
					input: JSON.parse(tc.function.arguments || '{}'),
				})),
			};
		}
		return { role: msg.role === 'assistant' ? 'assistant' : 'user', content: msg.content };
	}

	private toAnthropicTool(tool: IToolDefinition): Record<string, unknown> {
		return {
			name: tool.function.name,
			description: tool.function.description,
			input_schema: tool.function.parameters,
		};
	}

	private processEvent(event: AnthropicEvent, currentId: string): IChatCompletionChunk | undefined {
		switch (event.type) {
			case 'message_start':
				return {
					id: event.message?.id ?? '',
					choices: [],
					usage: event.message?.usage ? {
						promptTokens: event.message.usage.input_tokens ?? 0,
						completionTokens: 0,
						totalTokens: event.message.usage.input_tokens ?? 0,
						cachedTokens: event.message.usage.cache_read_input_tokens,
					} : undefined,
				};

			case 'content_block_delta':
				if (event.delta?.type === 'text_delta') {
					return {
						id: currentId,
						choices: [{
							index: 0,
							delta: { role: 'assistant', content: event.delta.text },
							finishReason: null,
						}],
					};
				}
				if (event.delta?.type === 'input_json_delta') {
					return {
						id: currentId,
						choices: [{
							index: 0,
							delta: {
								role: 'assistant',
								toolCalls: [{
									id: '',
									type: 'function' as const,
									function: { name: '', arguments: event.delta.partial_json ?? '' },
								}],
							},
							finishReason: null,
						}],
					};
				}
				return undefined;

			case 'message_delta':
				return {
					id: currentId,
					choices: [{
						index: 0,
						delta: { role: 'assistant' },
						finishReason: event.delta?.stop_reason ?? 'stop',
					}],
					usage: event.usage ? {
						promptTokens: 0,
						completionTokens: event.usage.output_tokens ?? 0,
						totalTokens: event.usage.output_tokens ?? 0,
					} : undefined,
				};

			default:
				return undefined;
		}
	}
}

export function createAnthropicProvider(apiKey: string): AnthropicProvider {
	return new AnthropicProvider(apiKey);
}
