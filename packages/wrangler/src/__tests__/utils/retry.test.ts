import { APIError } from "@cloudflare/workers-utils";
import { beforeEach, describe, expect, it } from "vitest";
import { logger } from "../../logger";
import { retryOnAPIFailure } from "../../utils/retry";
import { mockConsoleMethods } from "../helpers/mock-console";

describe("retryOnAPIFailure", () => {
	const std = mockConsoleMethods();

	beforeEach(() => {
		const level = logger.loggerLevel;
		logger.loggerLevel = "debug";
		return () => (logger.loggerLevel = level);
	});

	it("should retry 5xx errors and succeed if the 3rd try succeeds", async () => {
		let attempts = 0;

		await retryOnAPIFailure(() => {
			attempts++;
			if (attempts < 3) {
				throw new APIError({ status: 500, text: "500 error" });
			}
		});
		expect(attempts).toBe(3);
		expect(getRetryAndErrorLogs(std.debug)).toMatchInlineSnapshot(`
			Array [
			  "Retrying API call after error...",
			  "APIError: 500 error",
			  "Retrying API call after error...",
			  "APIError: 500 error",
			]
		`);
	});

	it("should throw 5xx error after all retries fail", async () => {
		let attempts = 0;

		await expect(() =>
			retryOnAPIFailure(() => {
				attempts++;
				throw new APIError({ status: 500, text: "500 error" });
			})
		).rejects.toMatchInlineSnapshot(`[APIError: 500 error]`);
		expect(attempts).toBe(3);
		expect(getRetryAndErrorLogs(std.debug)).toMatchInlineSnapshot(`
			Array [
			  "Retrying API call after error...",
			  "APIError: 500 error",
			  "Retrying API call after error...",
			  "APIError: 500 error",
			  "Retrying API call after error...",
			  "APIError: 500 error",
			]
		`);
	});

	it("should retry 429 rate limit errors", async () => {
		let attempts = 0;

		await retryOnAPIFailure(() => {
			attempts++;
			if (attempts < 3) {
				throw new APIError({ status: 429, text: "429 rate limited" });
			}
		});
		expect(attempts).toBe(3);
		expect(getRetryAndErrorLogs(std.debug)).toMatchInlineSnapshot(`
			Array [
			  "Retrying API call after error...",
			  "APIError: 429 rate limited",
			  "Retrying API call after error...",
			  "APIError: 429 rate limited",
			]
		`);
	});

	it("should throw 429 error after all retries fail", async () => {
		let attempts = 0;

		await expect(() =>
			retryOnAPIFailure(() => {
				attempts++;
				throw new APIError({ status: 429, text: "429 rate limited" });
			})
		).rejects.toMatchInlineSnapshot(`[APIError: 429 rate limited]`);
		expect(attempts).toBe(3);
	});

	it("should not retry non-retryable 4xx errors", async () => {
		let attempts = 0;

		await expect(() =>
			retryOnAPIFailure(() => {
				attempts++;
				throw new APIError({ status: 401, text: "401 error" });
			})
		).rejects.toMatchInlineSnapshot(`[APIError: 401 error]`);
		expect(attempts).toBe(1);
		expect(getRetryAndErrorLogs(std.debug)).toMatchInlineSnapshot(`Array []`);
	});

	it("should retry TypeError", async () => {
		let attempts = 0;

		await expect(() =>
			retryOnAPIFailure(() => {
				attempts++;
				throw new TypeError("type error");
			})
		).rejects.toMatchInlineSnapshot(`[TypeError: type error]`);
		expect(attempts).toBe(3);
		expect(getRetryAndErrorLogs(std.debug)).toMatchInlineSnapshot(`
			Array [
			  "Retrying API call after error...",
			  "Retrying API call after error...",
			  "Retrying API call after error...",
			]
		`);
	});

	it("should not retry other errors", async () => {
		let attempts = 0;

		await expect(() =>
			retryOnAPIFailure(() => {
				attempts++;
				throw new Error("some error");
			})
		).rejects.toMatchInlineSnapshot(`[Error: some error]`);
		expect(attempts).toBe(1);
		expect(getRetryAndErrorLogs(std.debug)).toMatchInlineSnapshot(`Array []`);
	});

	it("should retry custom APIError implementation with non-5xx error", async () => {
		let checkedCustomIsRetryable = false;
		class CustomAPIError extends APIError {
			isRetryable(): boolean {
				checkedCustomIsRetryable = true;
				return true;
			}
		}

		let attempts = 0;

		await expect(() =>
			retryOnAPIFailure(() => {
				attempts++;
				throw new CustomAPIError({ status: 401, text: "401 error" });
			})
		).rejects.toMatchInlineSnapshot(`[CustomAPIError: 401 error]`);
		expect(attempts).toBe(3);
		expect(checkedCustomIsRetryable).toBe(true);
		expect(getRetryAndErrorLogs(std.debug)).toMatchInlineSnapshot(`
			Array [
			  "Retrying API call after error...",
			  "CustomAPIError: 401 error",
			  "Retrying API call after error...",
			  "CustomAPIError: 401 error",
			  "Retrying API call after error...",
			  "CustomAPIError: 401 error",
			]
		`);
	});
});

function getRetryAndErrorLogs(debugOutput: string): string[] {
	return debugOutput
		.split("\n")
		.filter((line) => line.includes("Retrying") || line.includes("APIError"));
}
