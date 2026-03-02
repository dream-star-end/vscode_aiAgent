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

interface GeminiModelDef {
	readonly id: string;
	readonly name: string;
	readonly maxInputTokens: number;
	readonly maxOutputTokens: number;
	readonly costPerInputToken: number;
	readonly costPerOutputToken: number;
}

interface GeminiPart {
	text?: string;
	functionCall?: { name?: string; args?: Record<string, unknown> };
}

interface GeminiCandidate {
	content?: { parts?: GeminiPart[] };
	finishReason?: string;
}

interface GeminiResponse {
	candidates?: GeminiCandidate[];
	usageMetadata?: {
		promptTokenCount?: number;
		candidatesTokenCount?: number;
		totalTokenCount?: number;
	};
}

const GEMINI_MODELS: GeminiModelDef[] = [
	{ id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', maxInputTokens: 1048576, maxOutputTokens: 65536, costPerInputToken: 1.25e-6, costPerOutputToken: 10e-6 },
	{ id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', maxInputTokens: 1048576, maxOutputTokens: 65536, costPerInputToken: 0.15e-6, costPerOutputToken: 0.6e-6 },
	{ id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', maxInputTokens: 1048576, maxOutputTokens: 8192, costPerInputToken: 0.1e-6, costPerOutputToken: 0.4e-6 },
];

const CAPABILITIES: IAIModelCapabilities = { chat: true, completion: false, embedding: true, vision: true, toolUse: true, streaming: true };

export class GeminiProvider implements IAIProvider {

	readonly id = 'gemini';
	readonly displayName = 'Google Gemini';

	constructor(
		private readonly apiKey: string,
		private readonly baseUrl: string = 'https://generativelanguage.googleapis.com',
	) { }

	async *chatCompletion(request: IChatCompletionRequest, token?: CancellationToken): AsyncIterable<IChatCompletionChunk> {
		const contents = this.toGeminiContents(request.messages);
		const systemInstruction = this.extractSystemInstruction(request.messages);

		const body: Record<string, unknown> = { contents };
		if (systemInstruction) {
			body.system_instruction = { parts: [{ text: systemInstruction }] };
		}

		const generationConfig: Record<string, unknown> = {};
		if (request.maxTokens !== undefined) { generationConfig.maxOutputTokens = request.maxTokens; }
		if (request.temperature !== undefined) { generationConfig.temperature = request.temperature; }
		if (request.topP !== undefined) { generationConfig.topP = request.topP; }
		if (request.stop !== undefined) { generationConfig.stopSequences = request.stop; }
		if (request.responseFormat?.type === 'json_object') { generationConfig.responseMimeType = 'application/json'; }
		if (Object.keys(generationConfig).length > 0) { body.generationConfig = generationConfig; }

		if (request.tools?.length) {
			body.tools = [{ function_declarations: request.tools.map(t => this.toGeminiTool(t)) }];
		}

		const controller = new AbortController();
		token?.onCancellationRequested(() => controller.abort());

		const url = `${this.baseUrl}/v1beta/models/${request.model}:streamGenerateContent?alt=sse&key=${this.apiKey}`;
		const response = await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
			signal: controller.signal,
		});

		if (!response.ok) {
			const errorBody = await response.text().catch(() => '');
			throw new Error(`[gemini] API error ${response.status}: ${errorBody}`);
		}
		if (!response.body) {
			throw new Error('[gemini] No response body');
		}

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
					try {
						const data = JSON.parse(trimmed.slice(6));
						const chunk = this.toCompletionChunk(data);
						if (chunk) { yield chunk; }
					} catch {
						// skip
					}
				}
			}
		} finally {
			reader.releaseLock();
		}
	}

	async codeCompletion(_request: ICodeCompletionRequest, _token?: CancellationToken): Promise<ICodeCompletionResponse> {
		throw new Error('[gemini] FIM code completion is not supported by Gemini.');
	}

	async generateEmbedding(request: IEmbeddingRequest, token?: CancellationToken): Promise<number[]> {
		const controller = new AbortController();
		token?.onCancellationRequested(() => controller.abort());

		const url = `${this.baseUrl}/v1beta/models/${request.model}:embedContent?key=${this.apiKey}`;
		const response = await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ content: { parts: [{ text: request.input }] } }),
			signal: controller.signal,
		});

		if (!response.ok) {
			const errorBody = await response.text().catch(() => '');
			throw new Error(`[gemini] Embedding error ${response.status}: ${errorBody}`);
		}
		const data = await response.json();
		return data.embedding?.values ?? [];
	}

	async listModels(): Promise<IAIModel[]> {
		return GEMINI_MODELS.map(m => ({
			id: m.id,
			name: m.name,
			providerId: this.id,
			capabilities: CAPABILITIES,
		}));
	}

	getModelMetadata(modelId: string): IAIModelMetadata | undefined {
		const model = GEMINI_MODELS.find(m => m.id === modelId);
		if (!model) { return undefined; }
		return {
			modelId: model.id,
			providerId: this.id,
			maxInputTokens: model.maxInputTokens,
			maxOutputTokens: model.maxOutputTokens,
			capabilities: CAPABILITIES,
			costPerInputToken: model.costPerInputToken,
			costPerOutputToken: model.costPerOutputToken,
			supportsCaching: false,
		};
	}

	// -- Converters --

	private extractSystemInstruction(messages: readonly IChatMessage[]): string | undefined {
		const system = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
		return system || undefined;
	}

	private toGeminiContents(messages: readonly IChatMessage[]): unknown[] {
		return messages.filter(m => m.role !== 'system').map(m => {
			const role = m.role === 'assistant' ? 'model' : 'user';
			if (m.toolCalls?.length) {
				return {
					role,
					parts: m.toolCalls.map(tc => ({
						functionCall: { name: tc.function.name, args: JSON.parse(tc.function.arguments || '{}') },
					})),
				};
			}
			if (m.role === 'tool') {
				return {
					role: 'function',
					parts: [{ functionResponse: { name: m.name ?? '', response: { result: m.content } } }],
				};
			}
			return { role, parts: [{ text: m.content }] };
		});
	}

	private toGeminiTool(tool: IToolDefinition): unknown {
		return {
			name: tool.function.name,
			description: tool.function.description,
			parameters: tool.function.parameters,
		};
	}

	private toCompletionChunk(data: GeminiResponse): IChatCompletionChunk | undefined {
		const candidates = data.candidates;
		if (!candidates?.length) { return undefined; }

		const candidate = candidates[0];
		const text = candidate.content?.parts?.[0]?.text;
		const functionCall = candidate.content?.parts?.[0]?.functionCall;

		return {
			id: '',
			choices: [{
				index: 0,
				delta: {
					role: 'assistant',
					content: text ?? undefined,
					toolCalls: functionCall ? [{
						id: `call_${Date.now()}`,
						type: 'function' as const,
						function: {
							name: functionCall.name ?? '',
							arguments: JSON.stringify(functionCall.args ?? {}),
						},
					}] : undefined,
				},
				finishReason: candidate.finishReason === 'STOP' ? 'stop' : null,
			}],
			usage: data.usageMetadata ? {
				promptTokens: data.usageMetadata.promptTokenCount ?? 0,
				completionTokens: data.usageMetadata.candidatesTokenCount ?? 0,
				totalTokens: data.usageMetadata.totalTokenCount ?? 0,
			} : undefined,
		};
	}
}

export function createGeminiProvider(apiKey: string): GeminiProvider {
	return new GeminiProvider(apiKey);
}
