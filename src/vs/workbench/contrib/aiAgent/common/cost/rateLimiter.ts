/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILogService } from '../../../../../platform/log/common/log.js';

// -- Token Bucket State (internal) --------------------------------------

interface ITokenBucket {
	readonly providerId: string;
	tokens: number;
	maxTokens: number;
	refillRate: number;
	lastRefill: number;
	backoffFactor: number;
	consecutiveSuccesses: number;
}

// -- Rate Limit Error Check ----------------------------------------------

function isRateLimitError(error: unknown): boolean {
	if (error instanceof Error) {
		const msg = error.message.toLowerCase();
		return msg.includes('rate limit') || msg.includes('429') || msg.includes('too many requests');
	}
	return false;
}

// -- Default Settings ----------------------------------------------------

const DEFAULT_MAX_TOKENS = 10;
const DEFAULT_REFILL_RATE = 2;
const BACKOFF_MULTIPLIER = 0.5;
const RECOVERY_INCREMENT = 0.1;
const MAX_BACKOFF_FACTOR = 4;
const RECOVERY_SUCCESS_THRESHOLD = 3;
const MIN_EFFECTIVE_RATE = 0.125;

// -- Global Rate Limiter ------------------------------------------------

export class GlobalRateLimiter {

	private readonly _buckets = new Map<string, ITokenBucket>();

	constructor(
		private readonly _logService: ILogService,
	) { }

	async schedule<T>(providerId: string, fn: () => Promise<T>): Promise<T> {
		const bucket = this._getOrCreateBucket(providerId);
		await this._waitForToken(bucket);

		try {
			const result = await fn();
			this._onSuccess(bucket);
			return result;
		} catch (err) {
			if (isRateLimitError(err)) {
				this._onRateLimit(bucket);
			}
			throw err;
		}
	}

	getProviderStatus(providerId: string): {
		readonly tokens: number;
		readonly maxTokens: number;
		readonly refillRate: number;
		readonly backoffFactor: number;
	} | undefined {
		const bucket = this._buckets.get(providerId);
		if (!bucket) {
			return undefined;
		}
		this._refill(bucket);
		return {
			tokens: bucket.tokens,
			maxTokens: bucket.maxTokens,
			refillRate: bucket.refillRate,
			backoffFactor: bucket.backoffFactor,
		};
	}

	reset(providerId: string): void {
		this._buckets.delete(providerId);
	}

	private _getOrCreateBucket(providerId: string): ITokenBucket {
		let bucket = this._buckets.get(providerId);
		if (!bucket) {
			bucket = {
				providerId,
				tokens: DEFAULT_MAX_TOKENS,
				maxTokens: DEFAULT_MAX_TOKENS,
				refillRate: DEFAULT_REFILL_RATE,
				lastRefill: Date.now(),
				backoffFactor: 1,
				consecutiveSuccesses: 0,
			};
			this._buckets.set(providerId, bucket);
		}
		return bucket;
	}

	private async _waitForToken(bucket: ITokenBucket): Promise<void> {
		this._refill(bucket);

		if (bucket.tokens >= 1) {
			bucket.tokens -= 1;
			return;
		}

		const effectiveRefillRate = bucket.refillRate / bucket.backoffFactor;
		const waitMs = effectiveRefillRate > 0 ? (1 / effectiveRefillRate) * 1000 : 1000;

		this._logService.debug(
			`[RateLimiter] Waiting ${waitMs.toFixed(0)}ms for token from provider: ${bucket.providerId}`
		);

		await this._delay(waitMs);
		this._refill(bucket);

		if (bucket.tokens >= 1) {
			bucket.tokens -= 1;
			return;
		}

		bucket.tokens = 0;
	}

	private _refill(bucket: ITokenBucket): void {
		const now = Date.now();
		const elapsedSeconds = (now - bucket.lastRefill) / 1000;
		if (elapsedSeconds <= 0) {
			return;
		}

		const effectiveRefillRate = bucket.refillRate / bucket.backoffFactor;
		const tokensToAdd = elapsedSeconds * effectiveRefillRate;

		bucket.tokens = Math.min(bucket.maxTokens, bucket.tokens + tokensToAdd);
		bucket.lastRefill = now;
	}

	private _onSuccess(bucket: ITokenBucket): void {
		bucket.consecutiveSuccesses += 1;

		if (bucket.consecutiveSuccesses >= RECOVERY_SUCCESS_THRESHOLD && bucket.backoffFactor > 1) {
			bucket.backoffFactor = Math.max(1, bucket.backoffFactor - RECOVERY_INCREMENT);
			bucket.consecutiveSuccesses = 0;
			this._logService.debug(
				`[RateLimiter] Recovery for provider ${bucket.providerId}: backoff=${bucket.backoffFactor.toFixed(2)}`
			);
		}
	}

	private _onRateLimit(bucket: ITokenBucket): void {
		bucket.consecutiveSuccesses = 0;
		bucket.backoffFactor = Math.min(
			MAX_BACKOFF_FACTOR,
			bucket.backoffFactor * (1 + BACKOFF_MULTIPLIER)
		);

		const effectiveRate = bucket.refillRate / bucket.backoffFactor;
		if (effectiveRate < MIN_EFFECTIVE_RATE) {
			bucket.backoffFactor = bucket.refillRate / MIN_EFFECTIVE_RATE;
		}

		bucket.tokens = 0;

		this._logService.warn(
			`[RateLimiter] Rate limited by provider ${bucket.providerId}: ` +
			`backoff=${bucket.backoffFactor.toFixed(2)}, ` +
			`effective rate=${(bucket.refillRate / bucket.backoffFactor).toFixed(2)} tokens/s`
		);
	}

	private _delay(ms: number): Promise<void> {
		return new Promise<void>(resolve => {
			setTimeout(resolve, ms);
		});
	}
}
