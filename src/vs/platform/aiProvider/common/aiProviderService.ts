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
	private _fallbackOrder: string[] = [];

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

	/**
	 * Returns providers to try in order: active provider first, then fallback providers.
	 */
	private getProvidersWithFallback(): IAIProvider[] {
		const result: IAIProvider[] = [];
		const active = this._activeProviderId;
		if (active) {
			const provider = this._providers.get(active);
			if (provider) {
				result.push(provider);
			}
		}
		for (const id of this._fallbackOrder) {
			if (id !== active && this._providers.has(id)) {
				result.push(this._providers.get(id)!);
			}
		}
		return result;
	}

	setFallbackOrder(providerIds: string[]): void {
		this._fallbackOrder = [...providerIds];
		this.logService.info(`[AIProvider] Fallback order set: ${providerIds.join(', ')}`);
	}

	getFallbackOrder(): string[] {
		return [...this._fallbackOrder];
	}

	// -- Chat Completion ---

	async *chatCompletion(request: IChatCompletionRequest, token?: CancellationToken): AsyncIterable<IChatCompletionChunk> {
		const providers = this.getProvidersWithFallback();
		if (providers.length === 0) {
			throw new Error('[AIProvider] No active provider set.');
		}
		let lastError: Error | undefined;
		for (const provider of providers) {
			try {
				yield* provider.chatCompletion(request, token);
				return;
			} catch (err) {
				lastError = err instanceof Error ? err : new Error(String(err));
				this.logService.warn(`[AIProvider] Provider '${provider.id}' failed for chatCompletion, trying fallback.`, lastError);
			}
		}
		throw lastError ?? new Error('[AIProvider] All providers failed for chatCompletion.');
	}

	// -- Code Completion ---

	async codeCompletion(request: ICodeCompletionRequest, token?: CancellationToken): Promise<ICodeCompletionResponse> {
		const providers = this.getProvidersWithFallback();
		if (providers.length === 0) {
			throw new Error('[AIProvider] No active provider set.');
		}
		let lastError: Error | undefined;
		for (const provider of providers) {
			if (!provider.codeCompletion) {
				continue;
			}
			try {
				return await provider.codeCompletion(request, token);
			} catch (err) {
				lastError = err instanceof Error ? err : new Error(String(err));
				this.logService.warn(`[AIProvider] Provider '${provider.id}' failed for codeCompletion, trying fallback.`, lastError);
			}
		}
		throw lastError ?? new Error('[AIProvider] No provider supports code completion.');
	}

	async *codeCompletionStream(request: ICodeCompletionRequest, token?: CancellationToken): AsyncIterable<ICodeCompletionChunk> {
		const providers = this.getProvidersWithFallback();
		if (providers.length === 0) {
			throw new Error('[AIProvider] No active provider set.');
		}
		let lastError: Error | undefined;
		for (const provider of providers) {
			if (!provider.codeCompletionStream) {
				continue;
			}
			try {
				yield* provider.codeCompletionStream(request, token);
				return;
			} catch (err) {
				lastError = err instanceof Error ? err : new Error(String(err));
				this.logService.warn(`[AIProvider] Provider '${provider.id}' failed for codeCompletionStream, trying fallback.`, lastError);
			}
		}
		throw lastError ?? new Error('[AIProvider] No provider supports streaming code completion.');
	}

	// -- Embedding ---

	async generateEmbedding(request: IEmbeddingRequest, token?: CancellationToken): Promise<number[]> {
		const providers = this.getProvidersWithFallback();
		if (providers.length === 0) {
			throw new Error('[AIProvider] No active provider set.');
		}
		let lastError: Error | undefined;
		for (const provider of providers) {
			if (!provider.generateEmbedding) {
				continue;
			}
			try {
				return await provider.generateEmbedding(request, token);
			} catch (err) {
				lastError = err instanceof Error ? err : new Error(String(err));
				this.logService.warn(`[AIProvider] Provider '${provider.id}' failed for generateEmbedding, trying fallback.`, lastError);
			}
		}
		throw lastError ?? new Error('[AIProvider] No provider supports embedding generation.');
	}

	async generateEmbeddings(requests: IEmbeddingRequest[], token?: CancellationToken): Promise<number[][]> {
		const providers = this.getProvidersWithFallback();
		if (providers.length === 0) {
			throw new Error('[AIProvider] No active provider set.');
		}
		let lastError: Error | undefined;
		for (const provider of providers) {
			try {
				if (provider.generateEmbeddings) {
					return await provider.generateEmbeddings(requests, token);
				}
				if (provider.generateEmbedding) {
					return await Promise.all(requests.map(r => provider.generateEmbedding!(r, token)));
				}
			} catch (err) {
				lastError = err instanceof Error ? err : new Error(String(err));
				this.logService.warn(`[AIProvider] Provider '${provider.id}' failed for generateEmbeddings, trying fallback.`, lastError);
			}
		}
		throw lastError ?? new Error('[AIProvider] No provider supports embedding generation.');
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
