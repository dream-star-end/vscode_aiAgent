/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { IDisposable } from '../../../base/common/lifecycle.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';

export const IPermissionService = createDecorator<IPermissionService>('aiPermissionService');

// -- Permission Levels ---

export const enum PermissionLevel {
	Readonly = 0,
	Edit = 1,
	Execute = 2,
	Dangerous = 3,
}

// -- Permission Decisions --------------------------------------------

export const enum PermissionDecision {
	Allow = 'allow',
	Deny = 'deny',
	Ask = 'ask',
}

// -- Permission Scope ------------------------------------------------

export const enum PermissionScope {
	Session = 'session',
	Project = 'project',
	Global = 'global',
}

// -- Interfaces ------------------------------------------------------

export interface IPermissionRequest {
	readonly action: string;
	readonly level: PermissionLevel;
	readonly resource?: string;
	readonly detail?: string;
}

export interface IPermissionRule {
	readonly pattern: string;
	readonly decision: PermissionDecision;
	readonly scope: PermissionScope;
	readonly level?: PermissionLevel;
}

export interface IPermissionResult {
	readonly decision: PermissionDecision;
	readonly rule?: IPermissionRule;
	readonly remembered: boolean;
}

// -- Service Interface ---

export interface IPermissionService {
	readonly _serviceBrand: undefined;

	readonly onDidChangeRules: Event<void>;

	requestPermission(request: IPermissionRequest): Promise<IPermissionResult>;

	addRule(rule: IPermissionRule): IDisposable;
	removeRule(pattern: string): void;
	getRules(): IPermissionRule[];
	clearRules(scope?: PermissionScope): void;

	getPermissionLevel(action: string): PermissionLevel;

	setAgentMode(mode: 'fullAuto' | 'semiAuto' | 'supervised'): void;
	getAgentMode(): 'fullAuto' | 'semiAuto' | 'supervised';
}
