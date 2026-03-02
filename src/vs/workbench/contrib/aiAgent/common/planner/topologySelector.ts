/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TaskTopology } from '../taskDAG.js';

// -- Difficulty Levels ---------------------------------------------------

export const enum Difficulty {
	Simple = 'simple',
	Medium = 'medium',
	Complex = 'complex',
}

// -- Difficulty Estimate -------------------------------------------------

export interface IDifficultyEstimate {
	readonly difficulty: Difficulty;
	readonly confidence: number;
	readonly hasTestCoverage: boolean;
}

// -- Difficulty Estimator ------------------------------------------------

const COMPLEX_INDICATORS = ['refactor', 'redesign', 'migration', 'architect', 'parallel', 'distributed', 'concurrent', 'async'];
const SIMPLE_INDICATORS = ['rename', 'typo', 'comment', 'log', 'format', 'style', 'lint'];

export class DifficultyEstimator {

	estimate(description: string, codebaseContext?: string): IDifficultyEstimate {
		const tokens = description.toLowerCase().split(/\s+/);
		const length = tokens.length;

		let complexityScore = 0;

		for (const token of tokens) {
			if (COMPLEX_INDICATORS.includes(token)) {
				complexityScore += 2;
			}
			if (SIMPLE_INDICATORS.includes(token)) {
				complexityScore -= 1;
			}
		}

		if (length > 50) {
			complexityScore += 2;
		} else if (length > 20) {
			complexityScore += 1;
		}

		let difficulty: Difficulty;
		if (complexityScore >= 3) {
			difficulty = Difficulty.Complex;
		} else if (complexityScore >= 1) {
			difficulty = Difficulty.Medium;
		} else {
			difficulty = Difficulty.Simple;
		}

		const confidence = Math.max(0, Math.min(1, 0.5 + (Math.abs(complexityScore) * 0.1)));
		const hasTestCoverage = codebaseContext !== undefined && codebaseContext.includes('test');

		return { difficulty, confidence, hasTestCoverage };
	}
}

// -- Topology Selection Input -------------------------------------------

export interface ITopologySelectionInput {
	readonly difficulty: Difficulty;
	readonly confidence: number;
	readonly hasTestCoverage: boolean;
}

// -- Topology Selector ---------------------------------------------------

export class TopologySelector {

	selectTopology(input: ITopologySelectionInput): TaskTopology {
		const { difficulty, confidence, hasTestCoverage } = input;

		if (confidence < 0.5) {
			return TaskTopology.Exploratory;
		}

		switch (difficulty) {
			case Difficulty.Simple:
				if (confidence >= 0.8) {
					return TaskTopology.Simple;
				}
				return TaskTopology.Standard;

			case Difficulty.Medium:
				return TaskTopology.Standard;

			case Difficulty.Complex:
				if (hasTestCoverage) {
					return TaskTopology.Complex;
				}
				return TaskTopology.Standard;

			default:
				return TaskTopology.Standard;
		}
	}
}
