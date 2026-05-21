import { describe, it, expect } from "vitest";
import { nextResetTokenState } from "@/lib/reset-token-capture";

describe("nextResetTokenState", () => {
  it("captures the token from URL params on first read", () => {
    expect(nextResetTokenState("", "abc123")).toEqual({
      token: "abc123",
      shouldStripUrl: true,
    });
  });

  it("preserves the captured token when the effect re-fires with no token in params", () => {
    // Regression for the "Missing reset token" bug: in Next.js 14.1+ the
    // useSearchParams hook reacts to window.history.replaceState. After the
    // page strips ?token=... from the URL, the effect re-runs with an empty
    // query string. The previously captured token must NOT be clobbered.
    expect(nextResetTokenState("abc123", null)).toEqual({
      token: "abc123",
      shouldStripUrl: false,
    });
  });

  it("treats an empty-string param the same as a missing param", () => {
    expect(nextResetTokenState("abc123", "")).toEqual({
      token: "abc123",
      shouldStripUrl: false,
    });
  });

  it("returns an empty token when nothing has ever been provided", () => {
    expect(nextResetTokenState("", null)).toEqual({
      token: "",
      shouldStripUrl: false,
    });
  });

  it("refreshes the captured token if a new token arrives in params", () => {
    expect(nextResetTokenState("oldtoken", "newtoken")).toEqual({
      token: "newtoken",
      shouldStripUrl: true,
    });
  });
});
