import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { rateLimiter, extractIp } from "@/lib/rate-limit";

function uniqueKey(): string {
  return `test:${Math.random().toString(36).slice(2)}:${Date.now()}`;
}

describe("rateLimiter.check", () => {
  it("allows requests under the limit", () => {
    const key = uniqueKey();
    for (let i = 0; i < 3; i++) {
      expect(rateLimiter.check(key, 5, 60_000).allowed).toBe(true);
    }
  });

  it("blocks once the limit is reached", () => {
    const key = uniqueKey();
    for (let i = 0; i < 3; i++) rateLimiter.check(key, 3, 60_000);

    const result = rateLimiter.check(key, 3, 60_000);
    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBeGreaterThan(0);
  });

  it("scopes counters per key", () => {
    const keyA = uniqueKey();
    const keyB = uniqueKey();

    for (let i = 0; i < 2; i++) rateLimiter.check(keyA, 2, 60_000);
    expect(rateLimiter.check(keyA, 2, 60_000).allowed).toBe(false);
    expect(rateLimiter.check(keyB, 2, 60_000).allowed).toBe(true);
  });
});

describe("rateLimiter.check (sliding window with fake timers)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("re-allows requests once the window has elapsed", () => {
    const key = uniqueKey();
    const windowMs = 1000;
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

    for (let i = 0; i < 2; i++) rateLimiter.check(key, 2, windowMs);
    expect(rateLimiter.check(key, 2, windowMs).allowed).toBe(false);

    vi.setSystemTime(new Date("2026-01-01T00:00:02Z"));
    expect(rateLimiter.check(key, 2, windowMs).allowed).toBe(true);
  });

  it("reports retryAfter in seconds based on oldest hit", () => {
    const key = uniqueKey();
    const windowMs = 60_000;
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    rateLimiter.check(key, 1, windowMs);

    vi.setSystemTime(new Date("2026-01-01T00:00:30Z"));
    const result = rateLimiter.check(key, 1, windowMs);
    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBe(30);
  });
});

describe("extractIp", () => {
  function makeReq(headers: Record<string, string>): NextRequest {
    return new NextRequest("http://localhost/test", { headers });
  }

  it("prefers the first IP in x-forwarded-for", () => {
    expect(extractIp(makeReq({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" }))).toBe("1.2.3.4");
  });

  it("trims whitespace in x-forwarded-for", () => {
    expect(extractIp(makeReq({ "x-forwarded-for": "  1.2.3.4  " }))).toBe("1.2.3.4");
  });

  it("falls back to x-real-ip", () => {
    expect(extractIp(makeReq({ "x-real-ip": "9.9.9.9" }))).toBe("9.9.9.9");
  });

  it("returns 'unknown' when no IP header is present", () => {
    expect(extractIp(makeReq({}))).toBe("unknown");
  });
});
