/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IAgentService = createDecorator<IAgentService>('agentService');

// -- Agent Mode ----------------------------------------------------------

export const enum AgentMode {
	FullAuto = 0,
	SemiAuto = 1,
	Supervised = 2,
}

// -- Goal Types ----------------------------------------------------------

export interface IGoalConstraint {
	readonly maxTokenBudget: number;
	readonly maxTimeSeconds: number;
	readonly maxConcurrentWorkers: number;
	readonly allowedTools: string[];
	readonly forbiddenPaths: string[];
}

export interface IGoal {
	readonly id: string;
	readonly description: string;
	readonly mode: AgentMode;
	readonly constraints: IGoalConstraint;
	readonly createdAt: number;
	readonly metadata?: Record<string, string>;
}

// -- Goal Status ---------------------------------------------------------

export const enum GoalPhase {
	Pending = 'pending',
	Planning = 'planning',
	Executing = 'executing',
	Paused = 'paused',
	Completed = 'completed',
	Failed = 'failed',
	Cancelled = 'cancelled',
}

export interface IGoalStatus {
	readonly goalId: string;
	readonly phase: GoalPhase;
	readonly totalTasks: number;
	readonly completedTasks: number;
	readonly failedTasks: number;
	readonly tokensUsed: number;
	readonly elapsedMs: number;
	readonly currentTaskIds: string[];
}

export interface IGoalStatusChange {
	readonly goalId: string;
	readonly previousPhase: GoalPhase;
	readonly currentPhase: GoalPhase;
	readonly status: IGoalStatus;
}

// -- Service Interface ---------------------------------------------------

export interface IAgentService {
	readonly _serviceBrand: undefined;

	readonly onDidChangeGoalStatus: Event<IGoalStatusChange>;

	startGoal(goal: IGoal): Promise<string>;
	pauseGoal(goalId: string): Promise<void>;
	resumeGoal(goalId: string): Promise<void>;
	cancelGoal(goalId: string): Promise<void>;
	getGoalStatus(goalId: string): IGoalStatus | undefined;
	listGoals(): IGoalStatus[];
}
