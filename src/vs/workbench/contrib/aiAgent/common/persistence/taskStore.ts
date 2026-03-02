/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { KnowledgeBlock } from '../../../../services/aiContext/common/aiContext.js';
import { IGoal } from '../aiAgent.js';
import { TaskDAG, TaskResult } from '../taskDAG.js';

export const ITaskPersistenceService = createDecorator<ITaskPersistenceService>('taskPersistenceService');

// -- Recovery State ------------------------------------------------------

export interface IGoalRecoveryState {
	readonly goal: IGoal;
	readonly dagData: ReturnType<TaskDAG['toJSON']>;
	readonly completedTaskIds: string[];
	readonly lastCheckpoint: number;
}

// -- Service Interface ---------------------------------------------------

export interface ITaskPersistenceService {
	readonly _serviceBrand: undefined;

	saveGoal(goal: IGoal): Promise<void>;
	getGoal(goalId: string): Promise<IGoal | undefined>;
	listGoals(): Promise<IGoal[]>;
	savePlan(goalId: string, dag: TaskDAG): Promise<void>;
	getPlan(goalId: string): Promise<TaskDAG | undefined>;
	updateProgress(goalId: string, taskId: string, result: TaskResult): Promise<void>;
	saveKnowledge(goalId: string, block: KnowledgeBlock): Promise<void>;
	getKnowledge(goalId: string): Promise<KnowledgeBlock[]>;
	recoverGoal(goalId: string): Promise<IGoalRecoveryState | undefined>;
}

// -- File-based Implementation -------------------------------------------

class TaskPersistenceServiceImpl implements ITaskPersistenceService {

	declare readonly _serviceBrand: undefined;

	private readonly _baseUri: URI;

	constructor(
		@IFileService private readonly _fileService: IFileService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@ILogService private readonly _logService: ILogService,
	) {
		this._baseUri = URI.joinPath(environmentService.userRoamingDataHome, 'ai-studio', 'tasks');
	}

	async saveGoal(goal: IGoal): Promise<void> {
		const goalUri = this._goalFileUri(goal.id, 'goal.json');
		const data = JSON.stringify(goal, undefined, '\t');
		await this._writeFile(goalUri, data);
		this._logService.debug(`[TaskPersistence] Saved goal: ${goal.id}`);
	}

	async getGoal(goalId: string): Promise<IGoal | undefined> {
		const goalUri = this._goalFileUri(goalId, 'goal.json');
		return this._readJsonFile<IGoal>(goalUri);
	}

	async listGoals(): Promise<IGoal[]> {
		try {
			const resolved = await this._fileService.resolve(this._baseUri);
			if (!resolved.children) {
				return [];
			}

			const goals: IGoal[] = [];
			for (const child of resolved.children) {
				if (child.isDirectory) {
					const goalUri = URI.joinPath(child.resource, 'goal.json');
					const goal = await this._readJsonFile<IGoal>(goalUri);
					if (goal) {
						goals.push(goal);
					}
				}
			}
			return goals;
		} catch {
			return [];
		}
	}

	async savePlan(goalId: string, dag: TaskDAG): Promise<void> {
		const planUri = this._goalFileUri(goalId, 'plan.json');
		const data = JSON.stringify(dag.toJSON(), undefined, '\t');
		await this._writeFile(planUri, data);
		this._logService.debug(`[TaskPersistence] Saved plan for goal: ${goalId}`);
	}

	async getPlan(goalId: string): Promise<TaskDAG | undefined> {
		const planUri = this._goalFileUri(goalId, 'plan.json');
		const data = await this._readJsonFile<ReturnType<TaskDAG['toJSON']>>(planUri);
		if (!data) {
			return undefined;
		}
		return TaskDAG.fromJSON(data);
	}

	async updateProgress(goalId: string, taskId: string, result: TaskResult): Promise<void> {
		const progressUri = this._goalFileUri(goalId, 'progress.json');
		let progress = await this._readJsonFile<Record<string, TaskResult>>(progressUri) ?? {};
		progress = { ...progress, [taskId]: result };
		await this._writeFile(progressUri, JSON.stringify(progress, undefined, '\t'));

		const checkpointUri = this._goalFileUri(goalId, 'checkpoint.json');
		const checkpoint = { lastTaskId: taskId, timestamp: Date.now() };
		await this._writeFile(checkpointUri, JSON.stringify(checkpoint, undefined, '\t'));
	}

	async saveKnowledge(goalId: string, block: KnowledgeBlock): Promise<void> {
		const knowledgeUri = this._goalFileUri(goalId, 'knowledge.json');
		const existing = await this._readJsonFile<KnowledgeBlock[]>(knowledgeUri) ?? [];
		existing.push(block);
		await this._writeFile(knowledgeUri, JSON.stringify(existing, undefined, '\t'));
	}

	async getKnowledge(goalId: string): Promise<KnowledgeBlock[]> {
		const knowledgeUri = this._goalFileUri(goalId, 'knowledge.json');
		return await this._readJsonFile<KnowledgeBlock[]>(knowledgeUri) ?? [];
	}

	async recoverGoal(goalId: string): Promise<IGoalRecoveryState | undefined> {
		const goal = await this.getGoal(goalId);
		if (!goal) {
			return undefined;
		}

		const planUri = this._goalFileUri(goalId, 'plan.json');
		const dagData = await this._readJsonFile<ReturnType<TaskDAG['toJSON']>>(planUri);
		if (!dagData) {
			return undefined;
		}

		const progressUri = this._goalFileUri(goalId, 'progress.json');
		const progress = await this._readJsonFile<Record<string, TaskResult>>(progressUri) ?? {};

		const checkpointUri = this._goalFileUri(goalId, 'checkpoint.json');
		const checkpoint = await this._readJsonFile<{ lastTaskId: string; timestamp: number }>(checkpointUri);

		return {
			goal,
			dagData,
			completedTaskIds: Object.keys(progress),
			lastCheckpoint: checkpoint?.timestamp ?? 0,
		};
	}

	private _goalFileUri(goalId: string, filename: string): URI {
		return URI.joinPath(this._baseUri, goalId, filename);
	}

	private async _writeFile(uri: URI, content: string): Promise<void> {
		try {
			await this._fileService.writeFile(uri, VSBuffer.fromString(content));
		} catch (err) {
			this._logService.error(`[TaskPersistence] Failed to write ${uri.toString()}:`, err);
			throw err;
		}
	}

	private async _readJsonFile<T>(uri: URI): Promise<T | undefined> {
		try {
			const content = await this._fileService.readFile(uri);
			return JSON.parse(content.value.toString()) as T;
		} catch {
			return undefined;
		}
	}
}

registerSingleton(ITaskPersistenceService, TaskPersistenceServiceImpl, InstantiationType.Delayed);
