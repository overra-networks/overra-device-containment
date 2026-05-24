import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { POST } from "@/app/api/auth/signup/route";
import prisma from "@/lib/prisma";
import { resetDatabase, disconnect } from "../../helpers/db";
import { makeRequest } from "../../helpers/request";

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await disconnect();
});

// Unique IP per test class to avoid sharing the rate-limit counter with sibling tests.
const baseIp = "10.10.0";

describe("POST /api/auth/signup", () => {
  it("creates a new user with hashed password and returns 201", async () => {
    const res = await POST(
      makeRequest("/api/auth/signup", {
        method: "POST",
        body: { email: "alice@example.com", password: "supersecret", name: "Alice" },
        ip: `${baseIp}.1`,
      })
    );
    expect(res.status).toBe(201);

    const json = (await res.json()) as { user: { id: string; email: string; name: string; plan: string } };
    expect(json.user.email).toBe("alice@example.com");
    expect(json.user.name).toBe("Alice");
    expect(json.user.plan).toBe("free");
    expect(json.user).not.toHaveProperty("passwordHash");

    const dbUser = await prisma.user.findUnique({ where: { email: "alice@example.com" } });
    expect(dbUser).not.toBeNull();
    expect(dbUser!.passwordHash).not.toBe("supersecret");
    expect(dbUser!.passwordHash!.startsWith("$2")).toBe(true);
  });

  it("lowercases and trims the email", async () => {
    const res = await POST(
      makeRequest("/api/auth/signup", {
        method: "POST",
        body: { email: "  Bob@Example.COM  ", password: "supersecret", name: "Bob" },
        ip: `${baseIp}.2`,
      })
    );
    expect(res.status).toBe(201);
    const dbUser = await prisma.user.findUnique({ where: { email: "bob@example.com" } });
    expect(dbUser).not.toBeNull();
  });

  it("rejects when required fields are missing", async () => {
    const res = await POST(
      makeRequest("/api/auth/signup", {
        method: "POST",
        body: { email: "carol@example.com" },
        ip: `${baseIp}.3`,
      })
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toMatch(/required/i);
  });

  it("rejects passwords shorter than 8 characters", async () => {
    const res = await POST(
      makeRequest("/api/auth/signup", {
        method: "POST",
        body: { email: "dave@example.com", password: "short", name: "Dave" },
        ip: `${baseIp}.4`,
      })
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toMatch(/8 characters/i);
  });

  it("rejects duplicate emails with 409", async () => {
    const body = { email: "eve@example.com", password: "supersecret", name: "Eve" };
    const first = await POST(makeRequest("/api/auth/signup", { method: "POST", body, ip: `${baseIp}.5` }));
    expect(first.status).toBe(201);

    const second = await POST(makeRequest("/api/auth/signup", { method: "POST", body, ip: `${baseIp}.6` }));
    expect(second.status).toBe(409);
    const json = (await second.json()) as { error: string };
    expect(json.error).toMatch(/already exists/i);
  });

  it("rate-limits to 5 signups per IP per hour", async () => {
    const ip = `${baseIp}.99`;
    for (let i = 0; i < 5; i++) {
      const res = await POST(
        makeRequest("/api/auth/signup", {
          method: "POST",
          body: { email: `user${i}@rl.com`, password: "supersecret", name: `U${i}` },
          ip,
        })
      );
      expect(res.status).toBe(201);
    }
    const blocked = await POST(
      makeRequest("/api/auth/signup", {
        method: "POST",
        body: { email: "user5@rl.com", password: "supersecret", name: "U5" },
        ip,
      })
    );
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toBeDefined();
  });
});
