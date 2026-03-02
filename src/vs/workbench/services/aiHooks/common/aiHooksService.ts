/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import {
	HookEvent,
	HookResult,
	IHook,
	IHooksService,
} from './aiHooks.js';

export class HooksService extends Disposable implements IHooksService {

	declare readonly _serviceBrand: undefined;

	private readonly _hooks = new Map<string, IHook>();

	constructor(
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	register(hook: IHook): IDisposable {
		if (this._hooks.has(hook.id)) {
			this._logService.warn(`[Hooks] Hook '${hook.id}' is already registered, replacing.`);
		}
		this._hooks.set(hook.id, hook);
		this._logService.info(`[Hooks] Registered hook: ${hook.id} (${hook.event})`);

		return toDisposable(() => {
			this._hooks.delete(hook.id);
			this._logService.info(`[Hooks] Unregistered hook: ${hook.id}`);
		});
	}

	unregister(hookId: string): void {
		if (this._hooks.delete(hookId)) {
			this._logService.info(`[Hooks] Unregistered hook: ${hookId}`);
		}
	}

	async emit(event: HookEvent, context?: Record<string, string>): Promise<HookResult[]> {
		const hooks = this._getEnabledHooksForEvent(event);
		if (hooks.length === 0) {
			return [];
		}

		this._logService.info(`[Hooks] Emitting '${event}' to ${hooks.length} hooks.`);
		const results: HookResult[] = [];

		for (const hook of hooks) {
			const startTime = Date.now();
			try {
				const output = await this._executeHook(hook, context);
				results.push({
					hookId: hook.id,
					success: true,
					output,
					durationMs: Date.now() - startTime,
				});
			} catch (err) {
				const errorMessage = err instanceof Error ? err.message : String(err);
				this._logService.warn(`[Hooks] Hook '${hook.id}' failed:`, errorMessage);
				results.push({
					hookId: hook.id,
					success: false,
					error: errorMessage,
					durationMs: Date.now() - startTime,
				});
			}
		}

		return results;
	}

	getHooks(event?: HookEvent): IHook[] {
		if (event) {
			return this._getHooksForEvent(event);
		}
		return [...this._hooks.values()];
	}

	enableHook(hookId: string): void {
		const hook = this._hooks.get(hookId);
		if (hook) {
			this._hooks.set(hookId, { ...hook, enabled: true });
		}
	}

	disableHook(hookId: string): void {
		const hook = this._hooks.get(hookId);
		if (hook) {
			this._hooks.set(hookId, { ...hook, enabled: false });
		}
	}

	private _getHooksForEvent(event: HookEvent): IHook[] {
		const hooks: IHook[] = [];
		for (const [, hook] of this._hooks) {
			if (hook.event === event) {
				hooks.push(hook);
			}
		}
		return hooks.sort((a, b) => b.priority - a.priority);
	}

	private _getEnabledHooksForEvent(event: HookEvent): IHook[] {
		return this._getHooksForEvent(event).filter(h => h.enabled);
	}

	private async _executeHook(hook: IHook, context?: Record<string, string>): Promise<string> {
		switch (hook.config.type) {
			case 'shell':
				return this._executeShellHook(hook, context);
			case 'http':
				return this._executeHttpHook(hook);
			case 'script':
				return this._executeScriptHook(hook, context);
		}
	}

	/**
	 * Shell hook execution. In the common layer, actual process spawning
	 * requires a node-layer delegate. This base implementation logs the
	 * command for observability.
	 */
	private async _executeShellHook(hook: IHook, context?: Record<string, string>): Promise<string> {
		if (hook.config.type !== 'shell') {
			throw new Error('[Hooks] Invalid config type for shell hook.');
		}
		const cmd = this._interpolateContext(hook.config.command, context);
		this._logService.info(`[Hooks] Shell hook '${hook.id}': ${cmd}`);
		return `[shell] executed: ${cmd}`;
	}

	private async _executeHttpHook(hook: IHook): Promise<string> {
		if (hook.config.type !== 'http') {
			throw new Error('[Hooks] Invalid config type for http hook.');
		}
		this._logService.info(`[Hooks] HTTP hook '${hook.id}': ${hook.config.method} ${hook.config.url}`);
		return `[http] ${hook.config.method} ${hook.config.url}`;
	}

	private async _executeScriptHook(hook: IHook, context?: Record<string, string>): Promise<string> {
		if (hook.config.type !== 'script') {
			throw new Error('[Hooks] Invalid config type for script hook.');
		}
		const args = hook.config.args?.map(a => this._interpolateContext(a, context)) ?? [];
		this._logService.info(`[Hooks] Script hook '${hook.id}': ${hook.config.scriptPath} ${args.join(' ')}`);
		return `[script] executed: ${hook.config.scriptPath} ${args.join(' ')}`;
	}

	private _interpolateContext(template: string, context?: Record<string, string>): string {
		if (!context) {
			return template;
		}
		let result = template;
		for (const [key, value] of Object.entries(context)) {
			result = result.replace(new RegExp(`\\$\\{${key}\\}`, 'g'), value);
		}
		return result;
	}
}

registerSingleton(IHooksService, HooksService, InstantiationType.Delayed);
