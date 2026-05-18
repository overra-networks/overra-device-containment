import { describe, it, expect } from "vitest";
import {
  cn,
  truncateAddress,
  formatTimestamp,
  formatTimeOnly,
  generateNonce,
} from "@/lib/utils";

describe("cn", () => {
  it("merges class strings", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("dedupes conflicting tailwind classes (tailwind-merge)", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });

  it("handles falsy values", () => {
    expect(cn("a", false, null, undefined, "b")).toBe("a b");
  });

  it("returns empty string for no inputs", () => {
    expect(cn()).toBe("");
  });
});

describe("truncateAddress", () => {
  it("returns empty string for empty input", () => {
    expect(truncateAddress("")).toBe("");
  });

  it("truncates with default 6 chars", () => {
    const addr = "0x1234567890abcdef1234567890abcdef12345678";
    expect(truncateAddress(addr)).toBe("0x123456...345678");
  });

  it("respects custom char count", () => {
    const addr = "0x1234567890abcdef";
    expect(truncateAddress(addr, 4)).toBe("0x1234...cdef");
  });
});

describe("formatTimestamp", () => {
  it("formats a Date object", () => {
    const result = formatTimestamp(new Date("2026-05-12T10:30:45Z"));
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("formats a date string", () => {
    const result = formatTimestamp("2026-05-12T10:30:45Z");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("uses 24-hour clock (no AM/PM)", () => {
    const result = formatTimestamp("2026-05-12T15:30:45Z");
    expect(result).not.toMatch(/AM|PM/i);
  });
});

describe("formatTimeOnly", () => {
  it("returns time without date", () => {
    const result = formatTimeOnly(new Date("2026-05-12T15:30:45Z"));
    expect(result).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });
});

describe("generateNonce", () => {
  it("returns a non-empty string", () => {
    expect(generateNonce()).toMatch(/^[a-z0-9]+$/);
  });

  it("returns different values on each call", () => {
    const a = generateNonce();
    const b = generateNonce();
    expect(a).not.toBe(b);
  });
});
