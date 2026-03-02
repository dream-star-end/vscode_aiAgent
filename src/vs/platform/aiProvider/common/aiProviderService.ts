/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, IDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { InstantiationType, registerSingleton } from '../../instantiation/common/extensions.js';
import { ILogService } from '../../log/common/log.js';
import {
	IAIModel,
	IAIModelMetadata,
	IAIProvider,
	IAIProviderService,
	IChatCompletionChunk,
	IChatCompletionRequest,
	ICodeCompletionChunk,
	ICodeCompletionRequest,
	ICodeCompletionResponse,
	IEmbeddingRequest,
} from './aiProvider.js';

export class AIProviderService extends Disposable implements IAIProviderService {

	declare readonly _serviceBrand: undefined;

	private readonly _providers = new Map<string, IAIProvider>();
	private _activeProviderId: string | undefined;
	private readonly _modelMetadataCache = new Map<string, IAIModelMetadata>();

	private readonly _onDidChangeProviders = this._register(new Emitter<void>());
	readonly onDidChangeProviders: Event<void> = this._onDidChangeProviders.event;

	private readonly _onDidChangeActiveProvider = this._register(new Emitter<string>());
	readonly onDidChangeActiveProvider: Event<string> = this._onDidChangeActiveProvider.event;

	constructor(
		@ILogService private readonly logService: ILogService,
	) {
		super();
	}

	registerProvider(id: string, provider: IAIProvider): IDisposable {
		if (this._providers.has(id)) {
			this.logService.warn(`[AIProvider] Provider '${id}' is already registered, replacing.`);
			const existing = this._providers.get(id);
			existing?.dispose?.();
		}

		this._providers.set(id, provider);
		this.logService.info(`[AIProvider] Registered provider: ${id} (${provider.displayName})`);

		if (!this._activeProviderId) {
			this._activeProviderId = id;
			this._onDidChangeActiveProvider.fire(id);
		}

		this._onDidChangeProviders.fire();

		return toDisposable(() => {
			this._providers.delete(id);
			if (this._activeProviderId === id) {
				this._activeProviderId = this._providers.keys().next().value;
			}
			this._onDidChangeProviders.fire();
			this.logService.info(`[AIProvider] Unregistered provider: ${id}`);
		});
	}

	// -- Provider selection ------------------------------------------

	getActiveProviderId(): string | undefined {
		return this._activeProviderId;
	}

	setActiveProvider(id: string): void {
		if (!this._providers.has(id)) {
			throw new Error(`[AIProvider] Provider '${id}' is not registered.`);
		}
		this._activeProviderId = id;
		this._onDidChangeActiveProvider.fire(id);
	}

	getRegisteredProviderIds(): string[] {
		return [...this._providers.keys()];
	}

	private getActiveProvider(): IAIProvider {
		if (!this._activeProviderId) {
			throw new Error('[AIProvider] No active provider set.');
		}
		const provider = this._providers.get(this._activeProviderId);
		if (!provider) {
			throw new Error(`[AIProvider] Active provider '${this._activeProviderId}' not found.`);
		}
		return provider;
	}

	// -- Chat Completion ---

	async *chatCompletion(request: IChatCompletionRequest, token?: CancellationToken): AsyncIterable<IChatCompletionChunk> {
		const provider = this.getActiveProvider();
		yield* provider.chatCompletion(request, token);
	}

	// -- Code Completion ---

	async codeCompletion(request: ICodeCompletionRequest, token?: CancellationToken): Promise<ICodeCompletionResponse> {
		const provider = this.getActiveProvider();
		if (!provider.codeCompletion) {
			throw new Error(`[AIProvider] Provider '${provider.id}' does not support code completion.`);
		}
		return provider.codeCompletion(request, token);
	}

	async *codeCompletionStream(request: ICodeCompletionRequest, token?: CancellationToken): AsyncIterable<ICodeCompletionChunk> {
		const provider = this.getActiveProvider();
		if (!provider.codeCompletionStream) {
			throw new Error(`[AIProvider] Provider '${provider.id}' does not support streaming code completion.`);
		}
		yield* provider.codeCompletionStream(request, token);
	}

	// -- Embedding ---

	async generateEmbedding(request: IEmbeddingRequest, token?: CancellationToken): Promise<number[]> {
		const provider = this.getActiveProvider();
		if (!provider.generateEmbedding) {
			throw new Error(`[AIProvider] Provider '${provider.id}' does not support embedding generation.`);
		}
		return provider.generateEmbedding(request, token);
	}

	async generateEmbeddings(requests: IEmbeddingRequest[], token?: CancellationToken): Promise<number[][]> {
		const provider = this.getActiveProvider();
		if (provider.generateEmbeddings) {
			return provider.generateEmbeddings(requests, token);
		}
		if (!provider.generateEmbedding) {
			throw new Error(`[AIProvider] Provider '${provider.id}' does not support embedding generation.`);
		}
		return Promise.all(requests.map(r => provider.generateEmbedding!(r, token)));
	}

	// -- Model Management --------------------------------------------

	async listModels(): Promise<IAIModel[]> {
		const allModels: IAIModel[] = [];
		for (const [, provider] of this._providers) {
			try {
				const models = await provider.listModels();
				allModels.push(...models);
			} catch (err) {
				this.logService.warn(`[AIProvider] Failed to list models for provider '${provider.id}':`, err);
			}
		}
		return allModels;
	}

	getModelMetadata(modelId: string): IAIModelMetadata | undefined {
		const cached = this._modelMetadataCache.get(modelId);
		if (cached) {
			return cached;
		}

		for (const [, provider] of this._providers) {
			if (provider.getModelMetadata) {
				const metadata = provider.getModelMetadata(modelId);
				if (metadata) {
					this._modelMetadataCache.set(modelId, metadata);
					return metadata;
				}
			}
		}

		return undefined;
	}
}

registerSingleton(IAIProviderService, AIProviderService, InstantiationType.Delayed);
