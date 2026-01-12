import { describe, expect, it, vi } from "vitest";
import {
	calculateBackoff,
	DEFAULT_BACKOFF,
	DEFAULT_BASE_DELAY_MS,
	DEFAULT_MAX_RETRIES,
	isRetryableStatus,
	MAX_DELAY_MS,
	parseRetryAfter,
} from "../cfetch/retry";

describe("parseRetryAfter", () => {
	it("should return undefined for null input", () => {
		expect(parseRetryAfter(null)).toBeUndefined();
	});

	it("should return undefined for empty string", () => {
		expect(parseRetryAfter("")).toBeUndefined();
	});

	it("should parse integer seconds", () => {
		expect(parseRetryAfter("5")).toBe(5);
		expect(parseRetryAfter("120")).toBe(120);
		expect(parseRetryAfter("0")).toBe(0);
	});

	it("should return 0 for negative seconds (treated as 0)", () => {
		// Negative seconds are parsed but clamped to 0 since they don't make sense
		expect(parseRetryAfter("-5")).toBe(0);
	});

	it("should parse HTTP-date format", () => {
		const futureDate = new Date(Date.now() + 10000); // 10 seconds in future
		const httpDate = futureDate.toUTCString();
		const result = parseRetryAfter(httpDate);
		// Should be approximately 10 seconds (allow for test execution time)
		expect(result).toBeGreaterThanOrEqual(9);
		expect(result).toBeLessThanOrEqual(11);
	});

	it("should return 0 for past HTTP-date", () => {
		const pastDate = new Date(Date.now() - 10000); // 10 seconds in past
		const httpDate = pastDate.toUTCString();
		expect(parseRetryAfter(httpDate)).toBe(0);
	});

	it("should return undefined for invalid input", () => {
		expect(parseRetryAfter("invalid")).toBeUndefined();
		expect(parseRetryAfter("abc123")).toBeUndefined();
	});
});

describe("isRetryableStatus", () => {
	it("should return true for 429 (rate limit)", () => {
		expect(isRetryableStatus(429)).toBe(true);
	});

	it("should return true for 5xx errors", () => {
		expect(isRetryableStatus(500)).toBe(true);
		expect(isRetryableStatus(502)).toBe(true);
		expect(isRetryableStatus(503)).toBe(true);
		expect(isRetryableStatus(504)).toBe(true);
		expect(isRetryableStatus(599)).toBe(true);
	});

	it("should return false for successful responses", () => {
		expect(isRetryableStatus(200)).toBe(false);
		expect(isRetryableStatus(201)).toBe(false);
		expect(isRetryableStatus(204)).toBe(false);
	});

	it("should return false for client errors (except 429)", () => {
		expect(isRetryableStatus(400)).toBe(false);
		expect(isRetryableStatus(401)).toBe(false);
		expect(isRetryableStatus(403)).toBe(false);
		expect(isRetryableStatus(404)).toBe(false);
		expect(isRetryableStatus(422)).toBe(false);
	});
});

describe("calculateBackoff", () => {
	it("should respect Retry-After header when provided with jitter", () => {
		// Mock Math.random for predictable jitter (5% jitter: 0.5 * 0.1 = 0.05)
		const mockRandom = vi.spyOn(Math, "random").mockReturnValue(0.5);

		// Retry-After is in seconds, converted to ms, plus 5% jitter
		// 5 seconds = 5000ms + 250ms jitter = 5250ms
		expect(calculateBackoff(1, "exponential", 1000, 30000, 5)).toBe(5250);
		// 10 seconds = 10000ms + 500ms jitter = 10500ms
		expect(calculateBackoff(1, "exponential", 1000, 30000, 10)).toBe(10500);

		mockRandom.mockRestore();
	});

	it("should cap Retry-After at maxDelay even with jitter", () => {
		// Mock to ensure jitter would push over limit
		const mockRandom = vi.spyOn(Math, "random").mockReturnValue(0.5);
		// 60 seconds = 60000ms + jitter, but capped at 5000
		expect(calculateBackoff(1, "exponential", 1000, 5000, 60)).toBe(5000);
		mockRandom.mockRestore();
	});

	it("should calculate exponential backoff without Retry-After", () => {
		// Mock Math.random to get predictable results (0.15 gives 13% jitter: 0.1 + 0.15 * 0.2 = 0.13)
		const mockRandom = vi.spyOn(Math, "random").mockReturnValue(0.15);

		// Attempt 1: 1000 * 2^0 = 1000, plus 13% jitter = 1130
		expect(calculateBackoff(1, "exponential", 1000, 30000, undefined)).toBe(
			1130
		);

		// Attempt 2: 1000 * 2^1 = 2000, plus 13% jitter = 2260
		expect(calculateBackoff(2, "exponential", 1000, 30000, undefined)).toBe(
			2260
		);

		// Attempt 3: 1000 * 2^2 = 4000, plus 13% jitter = 4520
		expect(calculateBackoff(3, "exponential", 1000, 30000, undefined)).toBe(
			4520
		);

		mockRandom.mockRestore();
	});

	it("should calculate linear backoff with jitter", () => {
		// Mock Math.random to get predictable results (0.15 gives 13% jitter: 0.1 + 0.15 * 0.2 = 0.13)
		const mockRandom = vi.spyOn(Math, "random").mockReturnValue(0.15);

		// Attempt 1: 1000 * 1 = 1000, plus 13% jitter = 1130
		expect(calculateBackoff(1, "linear", 1000, 30000, undefined)).toBe(1130);

		// Attempt 2: 1000 * 2 = 2000, plus 13% jitter = 2260
		expect(calculateBackoff(2, "linear", 1000, 30000, undefined)).toBe(2260);

		// Attempt 3: 1000 * 3 = 3000, plus 13% jitter = 3390
		expect(calculateBackoff(3, "linear", 1000, 30000, undefined)).toBe(3390);

		mockRandom.mockRestore();
	});

	it("should cap backoff at maxDelay", () => {
		// With exponential, attempt 10 would be 1000 * 2^9 = 512000
		// Should be capped at 5000
		const mockRandom = vi.spyOn(Math, "random").mockReturnValue(0);
		expect(calculateBackoff(10, "exponential", 1000, 5000, undefined)).toBe(
			5000
		);
		mockRandom.mockRestore();
	});
});

describe("retry configuration defaults", () => {
	it("should have sensible default values", () => {
		expect(DEFAULT_MAX_RETRIES).toBe(3);
		expect(DEFAULT_BASE_DELAY_MS).toBe(1000);
		expect(MAX_DELAY_MS).toBe(30000);
		expect(DEFAULT_BACKOFF).toBe("exponential");
	});
});
