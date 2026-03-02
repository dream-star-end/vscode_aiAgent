/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import {
	ContextWindowConfig,
	IAssembledPrompt,
	IAssembleRequest,
	IBudgetAllocation,
	IContextEntry,
	IContextManagerService,
	IContextWindow,
	IToolOutput,
	KnowledgeBlock,
} from './aiContext.js';

// -- Token estimation: 4 chars ~ 1 token ---

function estimateTokens(text: string): number {
	return Math.ceil(text.length / 4);
}

// -- LRU Cache ---

class LRUCache<K, V> {

	private readonly _map = new Map<K, V>();

	constructor(private readonly _maxSize: number) { }

	get(key: K): V | undefined {
		const value = this._map.get(key);
		if (value !== undefined) {
			this._map.delete(key);
			this._map.set(key, value);
		}
		return value;
	}

	set(key: K, value: V): void {
		if (this._map.has(key)) {
			this._map.delete(key);
		} else if (this._map.size >= this._maxSize) {
			const firstKey = this._map.keys().next().value;
			if (firstKey !== undefined) {
				this._map.delete(firstKey);
			}
		}
		this._map.set(key, value);
	}

	clear(): void {
		this._map.clear();
	}

	get size(): number {
		return this._map.size;
	}
}

// -- Token Budget Manager ---

class TokenBudgetManager {

	private readonly _zoneBudgets = new Map<keyof IBudgetAllocation, number>();

	constructor(
		private readonly _maxTokens: number,
		budget: IBudgetAllocation,
	) {
		const zones: Array<keyof IBudgetAllocation> = [
			'systemPrompt', 'userInstructions', 'conversationHistory',
			'activeContext', 'toolResults', 'knowledge', 'scratchpad', 'responseReserve',
		];
		for (const zone of zones) {
			this._zoneBudgets.set(zone, Math.floor(_maxTokens * budget[zone] / 100));
		}
	}

	getBudgetForZone(zone: keyof IBudgetAllocation): number {
		return this._zoneBudgets.get(zone) ?? 0;
	}

	get maxTokens(): number {
		return this._maxTokens;
	}
}

// -- Context Window Implementation ---

let nextWindowId = 0;

class ContextWindow implements IContextWindow {

	readonly id: string;
	readonly config: ContextWindowConfig;
	private readonly _entries = new Map<keyof IBudgetAllocation, IContextEntry[]>();
	private readonly _budgetManager: TokenBudgetManager;

	constructor(config: ContextWindowConfig) {
		this.id = `ctx-window-${nextWindowId++}`;
		this.config = config;
		this._budgetManager = new TokenBudgetManager(config.maxTokens, config.budget);
	}

	get usedTokens(): number {
		let total = 0;
		for (const [, entries] of this._entries) {
			for (const entry of entries) {
				total += entry.tokenCount;
			}
		}
		return total;
	}

	get remainingTokens(): number {
		return this.config.maxTokens - this.usedTokens;
	}

	addEntry(zone: keyof IBudgetAllocation, content: string, priority: number): void {
		const tokenCount = estimateTokens(content);
		const entry: IContextEntry = {
			zone,
			content,
			priority,
			tokenCount,
			timestamp: Date.now(),
		};

		const entries = this._entries.get(zone) ?? [];
		entries.push(entry);

		const budget = this._budgetManager.getBudgetForZone(zone);
		let totalZoneTokens = entries.reduce((sum, e) => sum + e.tokenCount, 0);
		while (totalZoneTokens > budget && entries.length > 1) {
			entries.sort((a, b) => a.priority - b.priority);
			const removed = entries.shift();
			if (removed) {
				totalZoneTokens -= removed.tokenCount;
			}
		}

		this._entries.set(zone, entries);
	}

	getEntries(zone: keyof IBudgetAllocation): IContextEntry[] {
		return this._entries.get(zone) ?? [];
	}

	clear(): void {
		this._entries.clear();
	}
}

// -- Context Manager Service ---

export class ContextManagerService extends Disposable implements IContextManagerService {

	declare readonly _serviceBrand: undefined;

	private readonly _knowledgeCache = new LRUCache<string, KnowledgeBlock[]>(64);

	constructor(
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	createWindow(config: ContextWindowConfig): IContextWindow {
		const sum =
			config.budget.systemPrompt +
			config.budget.userInstructions +
			config.budget.conversationHistory +
			config.budget.activeContext +
			config.budget.toolResults +
			config.budget.knowledge +
			config.budget.scratchpad +
			config.budget.responseReserve;

		if (Math.abs(sum - 100) > 0.01) {
			throw new Error(`[ContextManager] Budget zones must sum to 100%, got ${sum}%.`);
		}

		const window = new ContextWindow(config);
		this._logService.info(`[ContextManager] Created window '${window.id}' with ${config.maxTokens} max tokens.`);
		return window;
	}

	async assemblePrompt(window: IContextWindow, request: IAssembleRequest): Promise<IAssembledPrompt> {
		window.addEntry('systemPrompt', request.systemPrompt, 100);
		window.addEntry('userInstructions', request.userMessage, 100);

		if (request.activeFiles) {
			for (const file of request.activeFiles) {
				window.addEntry('activeContext', file, 50);
			}
		}

		const allEntries: IContextEntry[] = [];
		const zones: Array<keyof IBudgetAllocation> = [
			'systemPrompt', 'userInstructions', 'conversationHistory',
			'activeContext', 'toolResults', 'knowledge', 'scratchpad', 'responseReserve',
		];
		for (const zone of zones) {
			allEntries.push(...window.getEntries(zone));
		}

		const totalTokens = allEntries.reduce((sum, e) => sum + e.tokenCount, 0);
		const truncated = totalTokens > window.config.maxTokens;

		this._logService.trace(`[ContextManager] Assembled prompt: ${totalTokens} tokens, truncated=${truncated}`);

		return { entries: allEntries, totalTokens, truncated };
	}

	async microCompact(window: IContextWindow, toolOutput: IToolOutput): Promise<void> {
		const tokenCount = estimateTokens(toolOutput.content);
		const threshold = Math.floor(window.config.maxTokens * 0.1);
		if (tokenCount > threshold) {
			const compacted = toolOutput.content.substring(0, threshold * 4);
			window.addEntry('toolResults', compacted, 30);
			this._logService.info(`[ContextManager] Micro-compacted tool output from '${toolOutput.toolName}': ${tokenCount} -> ${estimateTokens(compacted)} tokens.`);
		} else {
			window.addEntry('toolResults', toolOutput.content, 30);
		}
	}

	async autoCompact(window: IContextWindow): Promise<void> {
		const usageRatio = window.usedTokens / window.config.maxTokens;
		if (usageRatio > 0.85) {
			this._logService.info(`[ContextManager] Auto-compact triggered at ${Math.round(usageRatio * 100)}% usage.`);
			await this.manualCompact(window);
		}
	}

	async manualCompact(window: IContextWindow): Promise<void> {
		const knowledge = await this.extractKnowledge(window);
		window.clear();
		for (const block of knowledge) {
			window.addEntry('knowledge', block.summary, 80);
		}
		this._logService.info(`[ContextManager] Manual compact: preserved ${knowledge.length} knowledge blocks.`);
	}

	async extractKnowledge(window: IContextWindow): Promise<KnowledgeBlock[]> {
		const cached = this._knowledgeCache.get(window.id);
		if (cached) {
			return cached;
		}

		const blocks: KnowledgeBlock[] = [];
		let blockId = 0;

		const zones: Array<keyof IBudgetAllocation> = [
			'conversationHistory', 'toolResults', 'activeContext',
		];
		for (const zone of zones) {
			const entries = window.getEntries(zone);
			for (const entry of entries) {
				if (entry.tokenCount > 10) {
					blocks.push({
						id: `kb-${window.id}-${blockId++}`,
						summary: entry.content.substring(0, 200),
						sourceZone: zone,
						tokenCount: Math.min(entry.tokenCount, 50),
						createdAt: entry.timestamp,
					});
				}
			}
		}

		this._knowledgeCache.set(window.id, blocks);
		return blocks;
	}
}

registerSingleton(IContextManagerService, ContextManagerService, InstantiationType.Delayed);
