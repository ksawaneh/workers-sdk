import { setTimeout } from "node:timers/promises";
import { APIError } from "@cloudflare/workers-utils";
import chalk from "chalk";
import { logger } from "../logger";

const MAX_ATTEMPTS = 3;

/**
 * Wrap around calls to the Cloudflare API to automatically retry
 * calls that result in a retryable error (5xx or 429).
 *
 * Note: This function is maintained for backwards compatibility.
 * The core fetch layer (performApiFetch) now handles retries automatically.
 *
 * Retries will back off at a rate of 1000ms per retry, with a 0ms delay for the first retry.
 *
 * This function will retry:
 * - 5xx server errors
 * - 429 rate limit errors (respects Retry-After header via APIError.retryAfter)
 * - TypeError (network failures)
 */
export async function retryOnAPIFailure<T>(
	action: () => T | Promise<T>,
	backoff = 0,
	attempts = MAX_ATTEMPTS
): Promise<T> {
	try {
		return await action();
	} catch (err) {
		if (err instanceof APIError) {
			if (!err.isRetryable()) {
				throw err;
			}
			// Use Retry-After header if available (in seconds, convert to ms)
			if (err.retryAfter !== undefined && err.retryAfter > 0) {
				backoff = Math.max(backoff, err.retryAfter * 1000);
			}
		} else if (!(err instanceof TypeError)) {
			throw err;
		}

		logger.debug(chalk.dim(`Retrying API call after error...`));
		logger.debug(err);

		if (attempts <= 1) {
			throw err;
		}

		await setTimeout(backoff);
		return retryOnAPIFailure(
			action,
			backoff + (MAX_ATTEMPTS - attempts) * 1000,
			attempts - 1
		);
	}
}
