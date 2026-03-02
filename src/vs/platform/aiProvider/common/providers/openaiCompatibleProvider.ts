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
	IChatCompletionChoice,
	IChatCompletionChunk,
	IChatCompletionRequest,
	IChatMessage,
	ICodeCompletionChunk,
	ICodeCompletionRequest,
	ICodeCompletionResponse,
	IEmbeddingRequest,
	IToolDefinition,
} from '../aiProvider.js';

// -- OpenAI API request/response shapes (internal) --

interface OpenAIMessage {
	role: string;
	content: string | null;
	name?: string;
	tool_call_id?: string;
	tool_calls?: OpenAIToolCall[];
}

interface OpenAIToolCall {
	id: string;
	type: 'function';
	function: { name: string; arguments: string };
}

interface OpenAITool {
	type: 'function';
	function: { name: string; description: string; parameters: Record<string, unknown> };
}

interface OpenAIChatRequest {
	model: string;
	messages: OpenAIMessage[];
	tools?: OpenAITool[];
	temperature?: number;
	max_tokens?: number;
	top_p?: number;
	stop?: string[];
	stream: boolean;
	response_format?: { type: string };
}

// -- OpenAI API response shapes for type-safe parsing --

interface OpenAICompletionChoice {
	text?: string;
	finish_reason?: string | null;
}

interface OpenAIUsage {
	prompt_tokens?: number;
	completion_tokens?: number;
	total_tokens?: number;
	prompt_tokens_details?: { cached_tokens?: number };
}

interface OpenAICompletionResponse {
	id?: string;
	choices?: OpenAICompletionChoice[];
	usage?: OpenAIUsage;
}

interface OpenAIEmbeddingData {
	index: number;
	embedding: number[];
}

interface OpenAIEmbeddingResponse {
	data?: OpenAIEmbeddingData[];
}

interface OpenAIStreamToolCall {
	id?: string;
	type?: 'function';
	function?: { name?: string; arguments?: string };
}

interface OpenAIStreamDelta {
	role?: string;
	content?: string;
	tool_calls?: OpenAIStreamToolCall[];
}

interface OpenAIStreamChoice {
	index?: number;
	delta?: OpenAIStreamDelta;
	finish_reason?: string | null;
}

interface OpenAIStreamChunk {
	id?: string;
	choices?: OpenAIStreamChoice[];
	usage?: OpenAIUsage;
}

export interface OpenAICompatibleConfig {
	readonly id: string;
	readonly displayName: string;
	readonly baseUrl: string;
	readonly apiKey: string;
	readonly organizationId?: string;
	readonly defaultHeaders?: Record<string, string>;
	readonly models: OpenAICompatibleModelDef[];
}

export interface OpenAICompatibleModelDef {
	readonly id: string;
	readonly name: string;
	readonly maxInputTokens: number;
	readonly maxOutputTokens: number;
	readonly costPerInputToken: number;
	readonly costPerOutputToken: number;
	readonly capabilities: IAIModelCapabilities;
	readonly supportsCaching?: boolean;
}

/**
 * Base provider for any OpenAI-compatible API (OpenAI, DeepSeek, custom endpoints, etc.)
 */
export class OpenAICompatibleProvider implements IAIProvider {

	readonly id: string;
	readonly displayName: string;

	constructor(protected readonly config: OpenAICompatibleConfig) {
		this.id = config.id;
		this.displayName = config.displayName;
	}

	// -- Chat Completion (streaming) --

	async *chatCompletion(request: IChatCompletionRequest, token?: CancellationToken): AsyncIterable<IChatCompletionChunk> {
		const body: OpenAIChatRequest = {
			model: request.model,
			messages: request.messages.map(m => this.toOpenAIMessage(m)),
			stream: true,
		};
		if (request.tools?.length) {
			body.tools = request.tools.map(t => this.toOpenAITool(t));
		}
		if (request.temperature !== undefined) { body.temperature = request.temperature; }
		if (request.maxTokens !== undefined) { body.max_tokens = request.maxTokens; }
		if (request.topP !== undefined) { body.top_p = request.topP; }
		if (request.stop !== undefined) { body.stop = request.stop; }
		if (request.responseFormat) { body.response_format = request.responseFormat; }

		const response = await this.fetchSSE(`${this.config.baseUrl}/chat/completions`, body, token);

		for await (const line of this.parseSSELines(response)) {
			if (line === '[DONE]') { break; }
			try {
				const data = JSON.parse(line);
				yield this.toChunk(data);
			} catch {
				// skip malformed lines
			}
		}
	}

	// -- Code Completion --

	async codeCompletion(request: ICodeCompletionRequest, token?: CancellationToken): Promise<ICodeCompletionResponse> {
		const body = {
			model: request.model,
			prompt: request.prompt,
			suffix: request.suffix,
			max_tokens: request.maxTokens ?? 256,
			temperature: request.temperature ?? 0,
			stop: request.stop,
			stream: false,
		};

		const response = await this.fetchJSON(`${this.config.baseUrl}/completions`, body, token) as OpenAICompletionResponse;

		return {
			id: response.id ?? '',
			choices: (response.choices ?? []).map((c, i) => ({
				index: i,
				text: c.text ?? '',
				finishReason: c.finish_reason ?? null,
			})),
			usage: response.usage ? {
				promptTokens: response.usage.prompt_tokens ?? 0,
				completionTokens: response.usage.completion_tokens ?? 0,
				totalTokens: response.usage.total_tokens ?? 0,
			} : undefined,
		};
	}

	// -- Streaming Code Completion --

	async *codeCompletionStream(request: ICodeCompletionRequest, token?: CancellationToken): AsyncIterable<ICodeCompletionChunk> {
		const body = {
			model: request.model,
			prompt: request.prompt,
			suffix: request.suffix,
			max_tokens: request.maxTokens ?? 256,
			temperature: request.temperature ?? 0,
			stop: request.stop,
			stream: true,
		};

		const response = await this.fetchSSE(`${this.config.baseUrl}/completions`, body, token);

		for await (const line of this.parseSSELines(response)) {
			if (line === '[DONE]') { break; }
			try {
				const data = JSON.parse(line) as OpenAICompletionResponse;
				yield {
					id: data.id ?? '',
					choices: (data.choices ?? []).map((c, i) => ({
						index: i,
						text: c.text ?? '',
						finishReason: c.finish_reason ?? null,
					})),
				};
			} catch {
				// skip
			}
		}
	}

	// -- Embedding --

	async generateEmbedding(request: IEmbeddingRequest, token?: CancellationToken): Promise<number[]> {
		const response = await this.fetchJSON(`${this.config.baseUrl}/embeddings`, {
			model: request.model,
			input: request.input,
		}, token) as OpenAIEmbeddingResponse;
		return response.data?.[0]?.embedding ?? [];
	}

	async generateEmbeddings(requests: IEmbeddingRequest[], token?: CancellationToken): Promise<number[][]> {
		if (requests.length === 0) { return []; }
		const model = requests[0].model;
		const response = await this.fetchJSON(`${this.config.baseUrl}/embeddings`, {
			model,
			input: requests.map(r => r.input),
		}, token) as OpenAIEmbeddingResponse;
		return (response.data ?? [])
			.sort((a, b) => a.index - b.index)
			.map((d) => d.embedding ?? []);
	}

	// -- Models --

	async listModels(): Promise<IAIModel[]> {
		return this.config.models.map(m => ({
			id: m.id,
			name: m.name,
			providerId: this.id,
			capabilities: m.capabilities,
		}));
	}

	getModelMetadata(modelId: string): IAIModelMetadata | undefined {
		const model = this.config.models.find(m => m.id === modelId);
		if (!model) { return undefined; }
		return {
			modelId: model.id,
			providerId: this.id,
			maxInputTokens: model.maxInputTokens,
			maxOutputTokens: model.maxOutputTokens,
			capabilities: model.capabilities,
			costPerInputToken: model.costPerInputToken,
			costPerOutputToken: model.costPerOutputToken,
			supportsCaching: model.supportsCaching ?? false,
		};
	}

	// -- HTTP helpers --

	protected buildHeaders(): Record<string, string> {
		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${this.config.apiKey}`,
		};
		if (this.config.organizationId) {
			headers['OpenAI-Organization'] = this.config.organizationId;
		}
		if (this.config.defaultHeaders) {
			Object.assign(headers, this.config.defaultHeaders);
		}
		return headers;
	}

	protected async fetchJSON(url: string, body: unknown, token?: CancellationToken): Promise<unknown> {
		const controller = new AbortController();
		token?.onCancellationRequested(() => controller.abort());

		const response = await fetch(url, {
			method: 'POST',
			headers: this.buildHeaders(),
			body: JSON.stringify(body),
			signal: controller.signal,
		});

		if (!response.ok) {
			const errorBody = await response.text().catch(() => '');
			throw new Error(`[${this.id}] API error ${response.status}: ${errorBody}`);
		}

		return response.json();
	}

	protected async fetchSSE(url: string, body: unknown, token?: CancellationToken): Promise<ReadableStream<Uint8Array>> {
		const controller = new AbortController();
		token?.onCancellationRequested(() => controller.abort());

		const response = await fetch(url, {
			method: 'POST',
			headers: this.buildHeaders(),
			body: JSON.stringify(body),
			signal: controller.signal,
		});

		if (!response.ok) {
			const errorBody = await response.text().catch(() => '');
			throw new Error(`[${this.id}] API error ${response.status}: ${errorBody}`);
		}

		if (!response.body) {
			throw new Error(`[${this.id}] No response body for streaming request`);
		}

		return response.body;
	}

	protected async *parseSSELines(stream: ReadableStream<Uint8Array>): AsyncIterable<string> {
		const reader = stream.getReader();
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
					if (trimmed.startsWith('data: ')) {
						yield trimmed.slice(6);
					}
				}
			}

			if (buffer.trim().startsWith('data: ')) {
				yield buffer.trim().slice(6);
			}
		} finally {
			reader.releaseLock();
		}
	}

	// -- Converters --

	private toOpenAIMessage(msg: IChatMessage): OpenAIMessage {
		const result: OpenAIMessage = {
			role: msg.role,
			content: msg.content,
		};
		if (msg.name) { result.name = msg.name; }
		if (msg.toolCallId) { result.tool_call_id = msg.toolCallId; }
		if (msg.toolCalls) {
			result.tool_calls = msg.toolCalls.map(tc => ({
				id: tc.id,
				type: tc.type,
				function: { name: tc.function.name, arguments: tc.function.arguments },
			}));
		}
		return result;
	}

	private toOpenAITool(tool: IToolDefinition): OpenAITool {
		return {
			type: tool.type,
			function: {
				name: tool.function.name,
				description: tool.function.description,
				parameters: tool.function.parameters,
			},
		};
	}

	private toChunk(data: OpenAIStreamChunk): IChatCompletionChunk {
		return {
			id: data.id ?? '',
			choices: (data.choices ?? []).map((c): IChatCompletionChoice => ({
				index: c.index ?? 0,
				delta: {
					role: c.delta?.role as IChatMessage['role'] | undefined,
					content: c.delta?.content ?? undefined,
					toolCalls: c.delta?.tool_calls?.map((tc) => ({
						id: tc.id ?? '',
						type: 'function' as const,
						function: { name: tc.function?.name ?? '', arguments: tc.function?.arguments ?? '' },
					})),
				},
				finishReason: c.finish_reason ?? null,
			})),
			usage: data.usage ? {
				promptTokens: data.usage.prompt_tokens ?? 0,
				completionTokens: data.usage.completion_tokens ?? 0,
				totalTokens: data.usage.total_tokens ?? 0,
				cachedTokens: data.usage.prompt_tokens_details?.cached_tokens,
			} : undefined,
		};
	}
}
