/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IHooksService = createDecorator<IHooksService>('hooksService');

// -- Hook Events ---

export type HookEvent =
	| 'onFileChange'
	| 'onBuildStart'
	| 'onBuildEnd'
	| 'onTestStart'
	| 'onTestEnd'
	| 'onDeploy'
	| 'onError';

// -- Hook Types ---

export type HookType = 'shell' | 'http' | 'script';

export interface IShellHookConfig {
	readonly type: 'shell';
	readonly command: string;
	readonly cwd?: string;
	readonly timeout?: number;
}

export interface IHttpHookConfig {
	readonly type: 'http';
	readonly url: string;
	readonly method: 'GET' | 'POST' | 'PUT' | 'DELETE';
	readonly headers?: Record<string, string>;
	readonly body?: string;
}

export interface IScriptHookConfig {
	readonly type: 'script';
	readonly scriptPath: string;
	readonly args?: string[];
}

export type HookConfig = IShellHookConfig | IHttpHookConfig | IScriptHookConfig;

export interface IHook {
	readonly id: string;
	readonly event: HookEvent;
	readonly name: string;
	readonly config: HookConfig;
	readonly enabled: boolean;
	readonly priority: number;
}

export interface HookResult {
	readonly hookId: string;
	readonly success: boolean;
	readonly output?: string;
	readonly error?: string;
	readonly durationMs: number;
}

export interface IHooksService {
	readonly _serviceBrand: undefined;

	register(hook: IHook): IDisposable;
	unregister(hookId: string): void;
	emit(event: HookEvent, context?: Record<string, string>): Promise<HookResult[]>;
	getHooks(event?: HookEvent): IHook[];
	enableHook(hookId: string): void;
	disableHook(hookId: string): void;
}
