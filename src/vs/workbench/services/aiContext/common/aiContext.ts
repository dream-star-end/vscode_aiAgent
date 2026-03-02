/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IContextManagerService = createDecorator<IContextManagerService>('contextManagerService');

// -- Budget Zones ---
// The 8 zones must sum to 100% in any valid allocation.

export interface IBudgetAllocation {
	readonly systemPrompt: number;
	readonly userInstructions: number;
	readonly conversationHistory: number;
	readonly activeContext: number;
	readonly toolResults: number;
	readonly knowledge: number;
	readonly scratchpad: number;
	readonly responseReserve: number;
}

export interface ContextWindowConfig {
	readonly maxTokens: number;
	readonly budget: IBudgetAllocation;
}

export interface IContextWindow {
	readonly id: string;
	readonly config: ContextWindowConfig;
	readonly usedTokens: number;
	readonly remainingTokens: number;
	addEntry(zone: keyof IBudgetAllocation, content: string, priority: number): void;
	getEntries(zone: keyof IBudgetAllocation): IContextEntry[];
	clear(): void;
}

export interface IContextEntry {
	readonly zone: keyof IBudgetAllocation;
	readonly content: string;
	readonly priority: number;
	readonly tokenCount: number;
	readonly timestamp: number;
}

export interface IAssembleRequest {
	readonly systemPrompt: string;
	readonly userMessage: string;
	readonly activeFiles?: string[];
}

export interface IAssembledPrompt {
	readonly entries: IContextEntry[];
	readonly totalTokens: number;
	readonly truncated: boolean;
}

export interface IToolOutput {
	readonly toolName: string;
	readonly content: string;
	readonly timestamp: number;
}

export interface KnowledgeBlock {
	readonly id: string;
	readonly summary: string;
	readonly sourceZone: keyof IBudgetAllocation;
	readonly tokenCount: number;
	readonly createdAt: number;
}

export interface IContextManagerService {
	readonly _serviceBrand: undefined;

	createWindow(config: ContextWindowConfig): IContextWindow;
	assemblePrompt(window: IContextWindow, request: IAssembleRequest): Promise<IAssembledPrompt>;
	microCompact(window: IContextWindow, toolOutput: IToolOutput): Promise<void>;
	autoCompact(window: IContextWindow): Promise<void>;
	manualCompact(window: IContextWindow): Promise<void>;
	extractKnowledge(window: IContextWindow): Promise<KnowledgeBlock[]>;
}
