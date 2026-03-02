/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IAIProviderService, IChatMessage } from '../../../../../platform/aiProvider/common/aiProvider.js';
import { IContextManagerService, IContextWindow, ContextWindowConfig } from '../../../../services/aiContext/common/aiContext.js';
import { IPermissionService, PermissionLevel } from '../../../../../platform/aiPermission/common/aiPermission.js';
import { TaskNode, TaskResult } from '../taskDAG.js';
import { ToolIndex, IToolData } from '../tools/toolIndex.js';

// -- Worker Interface ----------------------------------------------------

export interface IWorker {
	execute(task: TaskNode, signal?: AbortSignal): Promise<TaskResult>;
}

// -- Semaphore -----------------------------------------------------------

class Semaphore {

	private _available: number;
	private readonly _waiters: Array<() => void> = [];

	constructor(count: number) {
		this._available = count;
	}

	async acquire(): Promise<void> {
		if (this._available > 0) {
			this._available--;
			return;
		}
		return new Promise<void>(resolve => {
			this._waiters.push(resolve);
		});
	}

	release(): void {
		if (this._waiters.length > 0) {
			const next = this._waiters.shift()!;
			next();
		} else {
			this._available++;
		}
	}
}

// -- Default Context Config ----------------------------------------------

const DEFAULT_WORKER_CONTEXT_CONFIG: ContextWindowConfig = {
	maxTokens: 128000,
	budget: {
		systemPrompt: 10,
		userInstructions: 10,
		conversationHistory: 20,
		activeContext: 20,
		toolResults: 15,
		knowledge: 10,
		scratchpad: 5,
		responseReserve: 10,
	},
};

// -- Task Worker ---------------------------------------------------------

class TaskWorker implements IWorker {

	private readonly _contextWindow: IContextWindow;

	constructor(
		private readonly _id: string,
		private readonly _aiProviderService: IAIProviderService,
		private readonly _contextManagerService: IContextManagerService,
		private readonly _permissionService: IPermissionService,
		private readonly _toolIndex: ToolIndex,
		private readonly _logService: ILogService,
	) {
		this._contextWindow = this._contextManagerService.createWindow(DEFAULT_WORKER_CONTEXT_CONFIG);
	}

	async execute(task: TaskNode, signal?: AbortSignal): Promise<TaskResult> {
		const startTime = Date.now();
		let tokensUsed = 0;

		this._logService.info(`[Worker ${this._id}] Starting task: ${task.id} - ${task.description}`);

		try {
			this._checkAborted(signal);

			const permissionResult = await this._permissionService.requestPermission({
				action: `agent.task.execute`,
				level: PermissionLevel.Execute,
				detail: task.description,
			});

			if (permissionResult.decision === 'deny') {
				return {
					status: 'failure',
					output: 'Permission denied for task execution',
					tokensUsed: 0,
					duration: Date.now() - startTime,
				};
			}

			const availableTools = this._toolIndex.getAll();

			const assembled = await this._contextManagerService.assemblePrompt(this._contextWindow, {
				systemPrompt: this._buildSystemPrompt(availableTools),
				userMessage: `Execute this task: ${task.description}`,
			});

			const messages: IChatMessage[] = assembled.entries.map(entry => ({
				role: 'user' as const,
				content: entry.content,
			}));

			if (messages.length === 0) {
				messages.push(
					{ role: 'system', content: this._buildSystemPrompt(availableTools) },
					{ role: 'user', content: `Execute this task: ${task.description}` },
				);
			}

			const cts = new CancellationTokenSource();
			if (signal) {
				signal.addEventListener('abort', () => cts.cancel());
			}

			let fullResponse = '';
			const models = await this._aiProviderService.listModels();
			const modelId = models.length > 0 ? models[0].id : 'default';

			for await (const chunk of this._aiProviderService.chatCompletion({
				model: modelId,
				messages,
				temperature: 0.3,
			}, cts.token)) {
				this._checkAborted(signal);

				for (const choice of chunk.choices) {
					if (choice.delta.content) {
						fullResponse += choice.delta.content;
					}
				}
				if (chunk.usage) {
					tokensUsed += chunk.usage.totalTokens;
				}
			}

			cts.dispose();

			await this._contextManagerService.autoCompact(this._contextWindow);

			const duration = Date.now() - startTime;
			this._logService.info(`[Worker ${this._id}] Completed task: ${task.id} in ${duration}ms`);

			return {
				status: 'success',
				output: fullResponse,
				tokensUsed,
				duration,
			};
		} catch (err) {
			const duration = Date.now() - startTime;
			const errorMessage = err instanceof Error ? err.message : String(err);
			this._logService.error(`[Worker ${this._id}] Task ${task.id} failed:`, errorMessage);

			return {
				status: 'failure',
				output: errorMessage,
				tokensUsed,
				duration,
			};
		}
	}

	private _buildSystemPrompt(tools: IToolData[]): string {
		const toolDescriptions = tools.map(t =>
			`- ${t.name}: ${t.description}`
		).join('\n');

		return [
			'You are an AI coding agent executing a specific task.',
			'Available tools:',
			toolDescriptions,
			'',
			'Execute the task thoroughly and report results.',
		].join('\n');
	}

	private _checkAborted(signal?: AbortSignal): void {
		if (signal?.aborted) {
			throw new Error('Task was aborted');
		}
	}
}

// -- Worker Pool ---------------------------------------------------------

export class WorkerPool extends Disposable {

	private readonly _semaphore: Semaphore;
	private readonly _workers: TaskWorker[] = [];
	private _nextWorkerId = 0;

	constructor(
		private readonly _maxConcurrent: number,
		private readonly _aiProviderService: IAIProviderService,
		private readonly _contextManagerService: IContextManagerService,
		private readonly _permissionService: IPermissionService,
		private readonly _toolIndex: ToolIndex,
		private readonly _logService: ILogService,
	) {
		super();
		this._semaphore = new Semaphore(this._maxConcurrent);
	}

	async executeTask(task: TaskNode, signal?: AbortSignal): Promise<TaskResult> {
		await this._semaphore.acquire();
		try {
			const worker = this._getOrCreateWorker();
			return await worker.execute(task, signal);
		} finally {
			this._semaphore.release();
		}
	}

	async executeTasks(tasks: TaskNode[], signal?: AbortSignal): Promise<Map<string, TaskResult>> {
		const results = new Map<string, TaskResult>();
		const promises = tasks.map(async task => {
			const result = await this.executeTask(task, signal);
			results.set(task.id, result);
		});
		await Promise.all(promises);
		return results;
	}

	private _getOrCreateWorker(): TaskWorker {
		if (this._workers.length < this._maxConcurrent) {
			const id = `worker_${this._nextWorkerId++}`;
			const worker = new TaskWorker(
				id,
				this._aiProviderService,
				this._contextManagerService,
				this._permissionService,
				this._toolIndex,
				this._logService,
			);
			this._workers.push(worker);
			return worker;
		}
		return this._workers[this._nextWorkerId % this._workers.length];
	}
}
