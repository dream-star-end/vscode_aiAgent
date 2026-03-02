/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, IDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { InstantiationType, registerSingleton } from '../../instantiation/common/extensions.js';
import { ILogService } from '../../log/common/log.js';
import {
	IPermissionRequest,
	IPermissionResult,
	IPermissionRule,
	IPermissionService,
	PermissionDecision,
	PermissionLevel,
	PermissionScope,
} from './aiPermission.js';

const DEFAULT_PERMISSIONS: ReadonlyMap<PermissionLevel, PermissionDecision> = new Map([
	[PermissionLevel.Readonly, PermissionDecision.Allow],
	[PermissionLevel.Edit, PermissionDecision.Ask],
	[PermissionLevel.Execute, PermissionDecision.Ask],
	[PermissionLevel.Dangerous, PermissionDecision.Ask],
]);

const FULL_AUTO_PERMISSIONS: ReadonlyMap<PermissionLevel, PermissionDecision> = new Map([
	[PermissionLevel.Readonly, PermissionDecision.Allow],
	[PermissionLevel.Edit, PermissionDecision.Allow],
	[PermissionLevel.Execute, PermissionDecision.Allow],
	[PermissionLevel.Dangerous, PermissionDecision.Ask],
]);

export class PermissionService extends Disposable implements IPermissionService {

	declare readonly _serviceBrand: undefined;

	private readonly _rules: IPermissionRule[] = [];
	private _agentMode: 'fullAuto' | 'semiAuto' | 'supervised' = 'supervised';

	private readonly _onDidChangeRules = this._register(new Emitter<void>());
	readonly onDidChangeRules: Event<void> = this._onDidChangeRules.event;

	constructor(
		@ILogService private readonly logService: ILogService,
	) {
		super();
	}

	async requestPermission(request: IPermissionRequest): Promise<IPermissionResult> {
		const matchedRule = this._findMatchingRule(request);
		if (matchedRule) {
			if (matchedRule.decision === PermissionDecision.Deny) {
				return { decision: PermissionDecision.Deny, rule: matchedRule, remembered: true };
			}
			if (matchedRule.decision === PermissionDecision.Allow) {
				return { decision: PermissionDecision.Allow, rule: matchedRule, remembered: true };
			}
		}

		const defaultDecision = this._getDefaultDecision(request.level);

		this.logService.trace(`[Permission] ${request.action} → ${defaultDecision} (level: ${request.level}, mode: ${this._agentMode})`);

		return { decision: defaultDecision, remembered: false };
	}

	addRule(rule: IPermissionRule): IDisposable {
		this._rules.push(rule);
		this._onDidChangeRules.fire();
		return toDisposable(() => {
			const idx = this._rules.indexOf(rule);
			if (idx >= 0) {
				this._rules.splice(idx, 1);
				this._onDidChangeRules.fire();
			}
		});
	}

	removeRule(pattern: string): void {
		const idx = this._rules.findIndex(r => r.pattern === pattern);
		if (idx >= 0) {
			this._rules.splice(idx, 1);
			this._onDidChangeRules.fire();
		}
	}

	getRules(): IPermissionRule[] {
		return [...this._rules];
	}

	clearRules(scope?: PermissionScope): void {
		if (scope) {
			const before = this._rules.length;
			for (let i = this._rules.length - 1; i >= 0; i--) {
				if (this._rules[i].scope === scope) {
					this._rules.splice(i, 1);
				}
			}
			if (this._rules.length !== before) {
				this._onDidChangeRules.fire();
			}
		} else {
			this._rules.length = 0;
			this._onDidChangeRules.fire();
		}
	}

	getPermissionLevel(action: string): PermissionLevel {
		if (/^(readFile|search|listDir|symbols)/.test(action)) {
			return PermissionLevel.Readonly;
		}
		if (/^(editFile|createFile)/.test(action)) {
			return PermissionLevel.Edit;
		}
		if (/^(terminal|bash|exec)/.test(action)) {
			return PermissionLevel.Execute;
		}
		if (/^(deleteFile|git\s+push|deploy|rm\s+-rf)/.test(action)) {
			return PermissionLevel.Dangerous;
		}
		return PermissionLevel.Execute;
	}

	setAgentMode(mode: 'fullAuto' | 'semiAuto' | 'supervised'): void {
		this._agentMode = mode;
		this.logService.info(`[Permission] Agent mode set to: ${mode}`);
	}

	getAgentMode(): 'fullAuto' | 'semiAuto' | 'supervised' {
		return this._agentMode;
	}

	// -- Private ---

	private _findMatchingRule(request: IPermissionRequest): IPermissionRule | undefined {
		// deny rules first, then ask, then allow
		const sorted = [...this._rules].sort((a, b) => {
			const order = { [PermissionDecision.Deny]: 0, [PermissionDecision.Ask]: 1, [PermissionDecision.Allow]: 2 };
			return order[a.decision] - order[b.decision];
		});

		for (const rule of sorted) {
			if (this._matchesPattern(request.action, rule.pattern)) {
				if (rule.level === undefined || rule.level === request.level) {
					return rule;
				}
			}
		}

		return undefined;
	}

	private _matchesPattern(action: string, pattern: string): boolean {
		const regex = new RegExp('^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
		return regex.test(action);
	}

	private _getDefaultDecision(level: PermissionLevel): PermissionDecision {
		const permMap = this._agentMode === 'fullAuto' ? FULL_AUTO_PERMISSIONS : DEFAULT_PERMISSIONS;
		return permMap.get(level) ?? PermissionDecision.Ask;
	}
}

registerSingleton(IPermissionService, PermissionService, InstantiationType.Delayed);
