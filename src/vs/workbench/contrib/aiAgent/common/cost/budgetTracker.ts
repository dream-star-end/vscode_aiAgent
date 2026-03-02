/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { ITokenUsage, IAIProviderService } from '../../../../../platform/aiProvider/common/aiProvider.js';

// -- Budget Status ------------------------------------------------------

export interface IBudgetStatus {
	readonly goalId: string;
	readonly percentage: number;
	readonly remaining: number;
	readonly total: number;
	readonly isWarning: boolean;
	readonly isExceeded: boolean;
}

// -- Budget Event -------------------------------------------------------

export interface IBudgetEvent {
	readonly goalId: string;
	readonly status: IBudgetStatus;
}

// -- Budget Entry (internal) -------------------------------------------

interface IBudgetEntry {
	readonly goalId: string;
	readonly totalBudget: number;
	used: number;
}

// -- Budget Thresholds --------------------------------------------------

const WARNING_THRESHOLD = 0.8;
const STOP_THRESHOLD = 1.0;

// -- Cost Estimate ------------------------------------------------------

export interface ICostEstimate {
	readonly estimatedInputTokens: number;
	readonly estimatedOutputTokens: number;
	readonly estimatedCostPerInputToken: number;
	readonly estimatedCostPerOutputToken: number;
	readonly totalEstimatedTokens: number;
	readonly totalEstimatedCost: number;
}

// -- Cost Estimator ------------------------------------------------------

export class CostEstimator {

	constructor(
		private readonly _aiProviderService: IAIProviderService,
	) { }

	estimate(modelId: string, estimatedInputTokens: number, estimatedOutputTokens: number): ICostEstimate {
		const metadata = this._aiProviderService.getModelMetadata(modelId);
		const costPerInputToken = metadata?.costPerInputToken ?? 0.000001;
		const costPerOutputToken = metadata?.costPerOutputToken ?? 0.000002;

		const totalEstimatedTokens = estimatedInputTokens + estimatedOutputTokens;
		const totalEstimatedCost =
			(estimatedInputTokens * costPerInputToken) +
			(estimatedOutputTokens * costPerOutputToken);

		return {
			estimatedInputTokens,
			estimatedOutputTokens,
			estimatedCostPerInputToken: costPerInputToken,
			estimatedCostPerOutputToken: costPerOutputToken,
			totalEstimatedTokens,
			totalEstimatedCost,
		};
	}
}

// -- Budget Tracker ------------------------------------------------------

export class BudgetTracker extends Disposable {

	private readonly _budgets = new Map<string, IBudgetEntry>();

	private readonly _onDidReachWarning = this._register(new Emitter<IBudgetEvent>());
	readonly onDidReachWarning: Event<IBudgetEvent> = this._onDidReachWarning.event;

	private readonly _onDidExceedBudget = this._register(new Emitter<IBudgetEvent>());
	readonly onDidExceedBudget: Event<IBudgetEvent> = this._onDidExceedBudget.event;

	constructor(
		private readonly _logService: ILogService,
	) {
		super();
	}

	initialize(goalId: string, totalBudget: number): void {
		this._budgets.set(goalId, {
			goalId,
			totalBudget,
			used: 0,
		});
		this._logService.debug(`[BudgetTracker] Initialized budget for goal ${goalId}: ${totalBudget} tokens`);
	}

	track(goalId: string, usage: ITokenUsage): void {
		const entry = this._budgets.get(goalId);
		if (!entry) {
			this._logService.warn(`[BudgetTracker] No budget entry for goal: ${goalId}`);
			return;
		}

		entry.used += usage.totalTokens;

		const status = this._buildStatus(entry);

		if (status.isExceeded) {
			this._logService.warn(
				`[BudgetTracker] Budget exceeded for goal ${goalId}: ${status.percentage.toFixed(0)}%`
			);
			this._onDidExceedBudget.fire({ goalId, status });
		} else if (status.isWarning) {
			this._logService.info(
				`[BudgetTracker] Budget warning for goal ${goalId}: ${status.percentage.toFixed(0)}%`
			);
			this._onDidReachWarning.fire({ goalId, status });
		}
	}

	check(goalId: string): IBudgetStatus {
		const entry = this._budgets.get(goalId);
		if (!entry) {
			return {
				goalId,
				percentage: 0,
				remaining: 0,
				total: 0,
				isWarning: false,
				isExceeded: false,
			};
		}
		return this._buildStatus(entry);
	}

	isExceeded(goalId: string): boolean {
		return this.check(goalId).isExceeded;
	}

	remove(goalId: string): void {
		this._budgets.delete(goalId);
	}

	private _buildStatus(entry: IBudgetEntry): IBudgetStatus {
		const percentage = entry.totalBudget > 0
			? (entry.used / entry.totalBudget) * 100
			: 0;
		const remaining = Math.max(0, entry.totalBudget - entry.used);

		return {
			goalId: entry.goalId,
			percentage,
			remaining,
			total: entry.totalBudget,
			isWarning: percentage >= WARNING_THRESHOLD * 100,
			isExceeded: percentage >= STOP_THRESHOLD * 100,
		};
	}
}
