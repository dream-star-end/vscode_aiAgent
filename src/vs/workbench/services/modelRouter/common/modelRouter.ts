/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IModelRouterService = createDecorator<IModelRouterService>('modelRouterService');

// -- Model Tier ---------------------------------------------------------

export const enum ModelTier {
	Small = 'small',
	Medium = 'medium',
	Large = 'large',
}

// -- Routing Context ----------------------------------------------------

export interface IRoutingContext {
	readonly taskType: string;
	readonly complexityScore: number;
	readonly budgetRemaining: number;
	readonly budgetTotal: number;
	readonly preferredTier?: ModelTier;
}

// -- Model Selection Result ---------------------------------------------

export interface IModelSelection {
	readonly modelId: string;
	readonly tier: ModelTier;
	readonly reason: string;
}

// -- Service Interface --------------------------------------------------

export interface IModelRouterService {
	readonly _serviceBrand: undefined;

	selectModel(context: IRoutingContext): Promise<IModelSelection>;
	registerModelForTier(tier: ModelTier, modelId: string): void;
	getAvailableTiers(): ModelTier[];
}
