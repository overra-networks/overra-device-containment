import { describe, it, expect } from "vitest";

describe("smoke", () => {
  it("vitest is wired up", () => {
    expect(1 + 1).toBe(2);
  });

  it("test env defaults are loaded", () => {
    expect(process.env.JWT_SECRET).toBeDefined();
    expect(process.env.NEXTAUTH_SECRET).toBeDefined();
  });
});
