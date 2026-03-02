/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ILogService } from '../../../../platform/log/common/log.js';

// -- Types ---------------------------------------------------------------

export const enum SidecarState {
	Stopped = 'stopped',
	Starting = 'starting',
	Running = 'running',
	Degraded = 'degraded',
}

export interface ISidecarStatus {
	readonly state: SidecarState;
	readonly degraded: boolean;
	readonly crashCount: number;
}

// -- SidecarManager ------------------------------------------------------

/**
 * Manages the Python sidecar process lifecycle for the knowledge engine.
 *
 * - Checks if Python is available
 * - If not: sets degraded mode flag so knowledge service uses ripgrep fallback
 * - If yes: manages Python sidecar process lifecycle (start/stop/restart
 *   with max 3 crash retries)
 */
export class SidecarManager extends Disposable {

	private static readonly MAX_CRASH_RETRIES = 3;

	private readonly _onDidChangeState = this._register(new Emitter<ISidecarStatus>());
	readonly onDidChangeState: Event<ISidecarStatus> = this._onDidChangeState.event;

	private _state: SidecarState = SidecarState.Stopped;
	private _crashCount = 0;
	private _pythonAvailable: boolean | undefined;

	constructor(
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	/**
	 * Returns `true` when the sidecar is running in degraded mode
	 * (Python not available or sidecar crashed too many times).
	 */
	isDegraded(): boolean {
		return this._state === SidecarState.Degraded;
	}

	/**
	 * Returns the current sidecar status.
	 */
	getStatus(): ISidecarStatus {
		return {
			state: this._state,
			degraded: this.isDegraded(),
			crashCount: this._crashCount,
		};
	}

	/**
	 * Initialize the sidecar manager. Checks for Python availability
	 * and starts the sidecar if possible.
	 */
	async initialize(): Promise<void> {
		this._pythonAvailable = await this._checkPythonAvailable();

		if (!this._pythonAvailable) {
			this._logService.info('[SidecarManager] Python not available, entering degraded mode.');
			this._setState(SidecarState.Degraded);
			return;
		}

		await this.start();
	}

	/**
	 * Start the sidecar process.
	 */
	async start(): Promise<void> {
		if (this._state === SidecarState.Running || this._state === SidecarState.Starting) {
			return;
		}

		if (!this._pythonAvailable) {
			this._setState(SidecarState.Degraded);
			return;
		}

		this._setState(SidecarState.Starting);
		try {
			await this._spawnSidecar();
			this._crashCount = 0;
			this._setState(SidecarState.Running);
			this._logService.info('[SidecarManager] Sidecar started successfully.');
		} catch (err) {
			this._logService.warn('[SidecarManager] Failed to start sidecar:', err);
			this._handleCrash();
		}
	}

	/**
	 * Stop the sidecar process.
	 */
	async stop(): Promise<void> {
		if (this._state === SidecarState.Stopped || this._state === SidecarState.Degraded) {
			return;
		}

		this._logService.info('[SidecarManager] Stopping sidecar.');
		this._setState(SidecarState.Stopped);
	}

	/**
	 * Restart the sidecar process.
	 */
	async restart(): Promise<void> {
		await this.stop();
		await this.start();
	}

	/**
	 * Notify the manager that the sidecar process has crashed.
	 */
	notifyCrash(): void {
		this._logService.warn('[SidecarManager] Sidecar process crashed.');
		this._handleCrash();
	}

	// -- Private helpers ---------------------------------------------------

	private _handleCrash(): void {
		this._crashCount++;
		if (this._crashCount >= SidecarManager.MAX_CRASH_RETRIES) {
			this._logService.warn(`[SidecarManager] Max crash retries (${SidecarManager.MAX_CRASH_RETRIES}) reached, entering degraded mode.`);
			this._setState(SidecarState.Degraded);
			return;
		}

		this._logService.info(`[SidecarManager] Attempting restart (${this._crashCount}/${SidecarManager.MAX_CRASH_RETRIES}).`);
		this.start();
	}

	private _setState(state: SidecarState): void {
		if (this._state === state) {
			return;
		}
		this._state = state;
		this._onDidChangeState.fire(this.getStatus());
	}

	/**
	 * Check if Python is available on the system.
	 * In the common layer we cannot spawn processes directly, so
	 * this returns `false` by default. Node-layer subclasses can
	 * override with actual process checking.
	 */
	private async _checkPythonAvailable(): Promise<boolean> {
		return false;
	}

	/**
	 * Spawn the Python sidecar process.
	 * In the common layer this is a no-op stub. Node-layer subclasses
	 * can override with actual process spawning logic.
	 */
	private async _spawnSidecar(): Promise<void> {
		if (!this._pythonAvailable) {
			throw new Error('Python is not available.');
		}
		this._logService.info('[SidecarManager] Sidecar spawn requested (common-layer stub).');
	}
}
