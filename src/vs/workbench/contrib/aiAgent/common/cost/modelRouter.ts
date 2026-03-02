/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILogService } from '../../../../../platform/log/common/log.js';
import { IAIProviderService } from '../../../../../platform/aiProvider/common/aiProvider.js';
import {
	IModelRouterService,
	IRoutingContext,
	IModelSelection,
	ModelTier,
} from '../../../../services/modelRouter/common/modelRouter.js';

// -- Budget Thresholds --------------------------------------------------

const LOW_BUDGET_THRESHOLD = 0.2;
const MEDIUM_BUDGET_THRESHOLD = 0.5;

// -- Complexity Thresholds ----------------------------------------------

const HIGH_COMPLEXITY_THRESHOLD = 0.7;
const LOW_COMPLEXITY_THRESHOLD = 0.3;

// -- Agent Model Router Adapter -----------------------------------------

export class AgentModelRouterAdapter {

	toRoutingContext(
		role: string,
		difficulty: string,
		budgetRemaining: number,
		budgetTotal: number,
	): IRoutingContext {
		const complexityScore = this._computeComplexity(role, difficulty);
		return {
			taskType: role,
			complexityScore,
			budgetRemaining,
			budgetTotal,
		};
	}

	private _computeComplexity(role: string, difficulty: string): number {
		let base: number;
		switch (difficulty) {
			case 'simple':
				base = 0.2;
				break;
			case 'medium':
				base = 0.5;
				break;
			case 'complex':
				base = 0.8;
				break;
			default:
				base = 0.5;
		}

		switch (role) {
			case 'planner':
				return Math.min(1, base + 0.1);
			case 'judge':
				return Math.min(1, base + 0.05);
			case 'worker':
				return base;
			case 'reflection':
				return Math.min(1, base + 0.15);
			default:
				return base;
		}
	}
}

// -- Model Router --------------------------------------------------------

export class ModelRouter implements IModelRouterService {

	declare readonly _serviceBrand: undefined;

	private readonly _tierModels = new Map<ModelTier, string>();

	constructor(
		private readonly _aiProviderService: IAIProviderService,
		private readonly _logService: ILogService,
	) { }

	async selectModel(context: IRoutingContext): Promise<IModelSelection> {
		const budgetRatio = context.budgetTotal > 0
			? context.budgetRemaining / context.budgetTotal
			: 1;

		let targetTier = this._selectTierByComplexity(context.complexityScore);

		if (context.preferredTier !== undefined) {
			targetTier = context.preferredTier;
		}

		targetTier = this._applyBudgetConstraint(targetTier, budgetRatio);

		const modelId = await this._resolveModelForTier(targetTier);
		const reason = this._buildReason(context.complexityScore, budgetRatio, targetTier);

		this._logService.debug(
			`[ModelRouter] Selected model: ${modelId} (tier: ${targetTier}, ` +
			`complexity: ${context.complexityScore.toFixed(2)}, ` +
			`budget: ${(budgetRatio * 100).toFixed(0)}%)`
		);

		return { modelId, tier: targetTier, reason };
	}

	registerModelForTier(tier: ModelTier, modelId: string): void {
		this._tierModels.set(tier, modelId);
		this._logService.debug(`[ModelRouter] Registered model ${modelId} for tier ${tier}`);
	}

	getAvailableTiers(): ModelTier[] {
		return [...this._tierModels.keys()];
	}

	private _selectTierByComplexity(complexityScore: number): ModelTier {
		if (complexityScore >= HIGH_COMPLEXITY_THRESHOLD) {
			return ModelTier.Large;
		}
		if (complexityScore <= LOW_COMPLEXITY_THRESHOLD) {
			return ModelTier.Small;
		}
		return ModelTier.Medium;
	}

	private _applyBudgetConstraint(tier: ModelTier, budgetRatio: number): ModelTier {
		if (budgetRatio <= LOW_BUDGET_THRESHOLD) {
			return ModelTier.Small;
		}
		if (budgetRatio <= MEDIUM_BUDGET_THRESHOLD && tier === ModelTier.Large) {
			return ModelTier.Medium;
		}
		return tier;
	}

	private async _resolveModelForTier(tier: ModelTier): Promise<string> {
		const registeredModel = this._tierModels.get(tier);
		if (registeredModel) {
			return registeredModel;
		}

		const models = await this._aiProviderService.listModels();
		if (models.length > 0) {
			return models[0].id;
		}

		return 'default';
	}

	private _buildReason(complexityScore: number, budgetRatio: number, tier: ModelTier): string {
		const parts: string[] = [];
		parts.push(`complexity=${complexityScore.toFixed(2)}`);
		parts.push(`budget=${(budgetRatio * 100).toFixed(0)}%`);
		parts.push(`tier=${tier}`);

		if (budgetRatio <= LOW_BUDGET_THRESHOLD) {
			parts.push('downgraded-due-to-low-budget');
		}

		return parts.join(', ');
	}
}
