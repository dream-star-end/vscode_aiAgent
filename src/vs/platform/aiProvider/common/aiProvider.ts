/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { Event } from '../../../base/common/event.js';
import { IDisposable } from '../../../base/common/lifecycle.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';

export const IAIProviderService = createDecorator<IAIProviderService>('aiProviderService');

// -- Core Service Interface ------------------------------------------

export interface IAIProviderService {
	readonly _serviceBrand: undefined;

	readonly onDidChangeProviders: Event<void>;
	readonly onDidChangeActiveProvider: Event<string>;

	registerProvider(id: string, provider: IAIProvider): IDisposable;

	chatCompletion(request: IChatCompletionRequest, token?: CancellationToken): AsyncIterable<IChatCompletionChunk>;
	codeCompletion(request: ICodeCompletionRequest, token?: CancellationToken): Promise<ICodeCompletionResponse>;
	codeCompletionStream(request: ICodeCompletionRequest, token?: CancellationToken): AsyncIterable<ICodeCompletionChunk>;
	generateEmbedding(request: IEmbeddingRequest, token?: CancellationToken): Promise<number[]>;
	generateEmbeddings(requests: IEmbeddingRequest[], token?: CancellationToken): Promise<number[][]>;

	listModels(): Promise<IAIModel[]>;
	getModelMetadata(modelId: string): IAIModelMetadata | undefined;

	getActiveProviderId(): string | undefined;
	setActiveProvider(id: string): void;
	getRegisteredProviderIds(): string[];

	setFallbackOrder(providerIds: string[]): void;
	getFallbackOrder(): string[];
}

// -- Provider Interface ----------------------------------------------

export interface IAIProvider {
	readonly id: string;
	readonly displayName: string;

	chatCompletion(request: IChatCompletionRequest, token?: CancellationToken): AsyncIterable<IChatCompletionChunk>;
	codeCompletion?(request: ICodeCompletionRequest, token?: CancellationToken): Promise<ICodeCompletionResponse>;
	codeCompletionStream?(request: ICodeCompletionRequest, token?: CancellationToken): AsyncIterable<ICodeCompletionChunk>;
	generateEmbedding?(request: IEmbeddingRequest, token?: CancellationToken): Promise<number[]>;
	generateEmbeddings?(requests: IEmbeddingRequest[], token?: CancellationToken): Promise<number[][]>;

	listModels(): Promise<IAIModel[]>;
	getModelMetadata?(modelId: string): IAIModelMetadata | undefined;

	dispose?(): void;
}

// -- Request / Response Types ----------------------------------------

export interface IChatMessage {
	readonly role: 'system' | 'user' | 'assistant' | 'tool';
	readonly content: string;
	readonly name?: string;
	readonly toolCallId?: string;
	readonly toolCalls?: IToolCall[];
}

export interface IToolCall {
	readonly id: string;
	readonly type: 'function';
	readonly function: {
		readonly name: string;
		readonly arguments: string;
	};
}

export interface IToolDefinition {
	readonly type: 'function';
	readonly function: {
		readonly name: string;
		readonly description: string;
		readonly parameters: Record<string, unknown>;
	};
}

export interface IChatCompletionRequest {
	readonly model: string;
	readonly messages: IChatMessage[];
	readonly tools?: IToolDefinition[];
	readonly temperature?: number;
	readonly maxTokens?: number;
	readonly topP?: number;
	readonly stop?: string[];
	readonly responseFormat?: { type: 'text' | 'json_object' };
	readonly cachedPrefixTokens?: string[];
}

export interface IChatCompletionChunk {
	readonly id: string;
	readonly choices: IChatCompletionChoice[];
	readonly usage?: ITokenUsage;
}

export interface IChatCompletionChoice {
	readonly index: number;
	readonly delta: Partial<IChatMessage>;
	readonly finishReason: string | null;
}

export interface ICodeCompletionRequest {
	readonly model: string;
	readonly prompt: string;
	readonly suffix?: string;
	readonly maxTokens?: number;
	readonly temperature?: number;
	readonly stop?: string[];
}

export interface ICodeCompletionResponse {
	readonly id: string;
	readonly choices: ICodeCompletionChoice[];
	readonly usage?: ITokenUsage;
}

export interface ICodeCompletionChoice {
	readonly index: number;
	readonly text: string;
	readonly finishReason: string | null;
}

export interface ICodeCompletionChunk {
	readonly id: string;
	readonly choices: ICodeCompletionChoice[];
}

export interface IEmbeddingRequest {
	readonly model: string;
	readonly input: string;
}

export interface ITokenUsage {
	readonly promptTokens: number;
	readonly completionTokens: number;
	readonly totalTokens: number;
	readonly cachedTokens?: number;
}

// -- Model Metadata --------------------------------------------------

export interface IAIModel {
	readonly id: string;
	readonly name: string;
	readonly providerId: string;
	readonly capabilities: IAIModelCapabilities;
}

export interface IAIModelCapabilities {
	readonly chat: boolean;
	readonly completion: boolean;
	readonly embedding: boolean;
	readonly vision: boolean;
	readonly toolUse: boolean;
	readonly streaming: boolean;
}

export interface IAIModelMetadata {
	readonly modelId: string;
	readonly providerId: string;
	readonly maxInputTokens: number;
	readonly maxOutputTokens: number;
	readonly capabilities: IAIModelCapabilities;
	readonly costPerInputToken: number;
	readonly costPerOutputToken: number;
	readonly supportsCaching: boolean;
}

// -- Provider Configuration ------------------------------------------

export interface IAIProviderConfig {
	readonly id: string;
	readonly apiKey?: string;
	readonly baseUrl?: string;
	readonly organizationId?: string;
	readonly defaultModel?: string;
	readonly enabled: boolean;
}
