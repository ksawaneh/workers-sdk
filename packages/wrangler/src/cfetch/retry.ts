import chalk from "chalk";
import { logger } from "../logger";

export const DEFAULT_MAX_RETRIES = 3;
export const DEFAULT_BASE_DELAY_MS = 1000;
export const MAX_DELAY_MS = 30_000;

export type BackoffStrategy = "exponential" | "linear";
export const DEFAULT_BACKOFF: BackoffStrategy = "exponential";

export interface RetryConfig {
	maxRetries?: number;
	backoffStrategy?: BackoffStrategy;
	baseDelayMs?: number;
	maxDelayMs?: number;
}

/**
 * Parse Retry-After header value.
 * Can be seconds (integer) or HTTP-date format (RFC 7231).
 *
 * @returns Retry delay in seconds, or undefined if header is invalid
 */
export function parseRetryAfter(header: string | null): number | undefined {
	if (!header) {
		return undefined;
	}

	// Try parsing as seconds (integer) - must be all digits optionally with leading sign
	// Note: parseInt would parse "123abc" as 123, so we check for pure numeric string
	if (/^-?\d+$/.test(header)) {
		const seconds = parseInt(header, 10);
		// Negative values are clamped to 0 (retry immediately)
		return Math.max(0, seconds);
	}

	// Try parsing as HTTP-date
	const date = Date.parse(header);
	if (!isNaN(date)) {
		return Math.max(0, Math.ceil((date - Date.now()) / 1000));
	}

	return undefined;
}

/**
 * Calculate delay for retry attempt with jitter.
 * Jitter (10-30%) is applied to both exponential and linear strategies
 * to prevent thundering herd problems.
 */
export function calculateBackoff(
	attempt: number,
	strategy: BackoffStrategy,
	baseDelay: number,
	maxDelay: number,
	retryAfterSeconds?: number
): number {
	// Respect Retry-After header if provided (convert to ms, cap at maxDelay)
	// Add small jitter (0-10%) even for Retry-After to avoid thundering herd
	// when many clients receive the same Retry-After value
	if (retryAfterSeconds !== undefined) {
		const baseMs = retryAfterSeconds * 1000;
		const jitter = baseMs * Math.random() * 0.1;
		return Math.min(baseMs + jitter, maxDelay);
	}

	let delay: number;
	if (strategy === "exponential") {
		// 1s, 2s, 4s, 8s...
		delay = baseDelay * Math.pow(2, attempt - 1);
	} else {
		// linear: 1s, 2s, 3s...
		delay = baseDelay * attempt;
	}

	// Add jitter (10-30%) to both strategies to avoid thundering herd
	delay += delay * (0.1 + Math.random() * 0.2);

	return Math.min(delay, maxDelay);
}

/**
 * Check if HTTP status is retryable (5xx server errors or 429 rate limit).
 */
export function isRetryableStatus(status: number): boolean {
	return status === 429 || (status >= 500 && status < 600);
}

/**
 * Log retry attempt. Shows user-visible warning for rate limits,
 * debug-level for other retryable errors.
 */
export function logRetryAttempt(
	status: number,
	attempt: number,
	maxRetries: number,
	delayMs: number
): void {
	const delaySeconds = Math.max(1, Math.round(delayMs / 1000));

	if (status === 429) {
		logger.warn(
			chalk.yellow(
				`Rate limited by Cloudflare API. Retrying in ${delaySeconds}s (attempt ${attempt}/${maxRetries})...`
			)
		);
	} else {
		logger.debug(
			chalk.dim(
				`API error (${status}). Retrying in ${delaySeconds}s (attempt ${attempt}/${maxRetries})...`
			)
		);
	}
}
