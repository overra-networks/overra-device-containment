import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";

const { sessionState } = vi.hoisted(() => ({
  sessionState: { current: null as any },
}));

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(async () => sessionState.current),
}));

import { POST, GET } from "@/app/api/downloads/generate/route";
import prisma from "@/lib/prisma";
import { resetDatabase, disconnect } from "../../helpers/db";
import { makeRequest } from "../../helpers/request";
import { createUser, createDownload } from "../../helpers/factories";

beforeEach(async () => {
  await resetDatabase();
  sessionState.current = null;
});

afterAll(async () => {
  await disconnect();
});

describe("POST /api/downloads/generate", () => {
  it("returns 401 without session", async () => {
    const res = await POST(
      makeRequest("/api/downloads/generate", { method: "POST", body: { platform: "linux" } })
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid platform", async () => {
    const user = await createUser();
    sessionState.current = { user: { id: user.id } };
    const res = await POST(
      makeRequest("/api/downloads/generate", { method: "POST", body: { platform: "bsd" } })
    );
    expect(res.status).toBe(400);
  });

  it("creates an agentDownload row scoped to the session user", async () => {
    const user = await createUser();
    sessionState.current = { user: { id: user.id } };

    const res = await POST(
      makeRequest("/api/downloads/generate", { method: "POST", body: { platform: "macos" } })
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { token: string; id: string; download_url: string };
    expect(json.token).toMatch(/^[0-9a-f-]{36}$/);
    expect(json.download_url).toContain(json.token);

    const row = await prisma.agentDownload.findUnique({ where: { id: json.id } });
    expect(row).not.toBeNull();
    expect(row!.userId).toBe(user.id);
    expect(row!.platform).toBe("macos");
    expect(row!.activated).toBe(false);
  });

  it("rate-limits to 20 tokens per user per hour", async () => {
    const user = await createUser();
    sessionState.current = { user: { id: user.id } };

    for (let i = 0; i < 20; i++) {
      const res = await POST(
        makeRequest("/api/downloads/generate", { method: "POST", body: { platform: "linux" } })
      );
      expect(res.status).toBe(200);
    }
    const blocked = await POST(
      makeRequest("/api/downloads/generate", { method: "POST", body: { platform: "linux" } })
    );
    expect(blocked.status).toBe(429);
  });
});

describe("GET /api/downloads/generate", () => {
  it("returns 401 without session", async () => {
    const res = await GET(makeRequest("/api/downloads/generate"));
    expect(res.status).toBe(401);
  });

  it("only returns downloads owned by the session user", async () => {
    const userA = await createUser();
    const userB = await createUser();
    await createDownload(userA.id);
    await createDownload(userA.id);
    await createDownload(userB.id);

    sessionState.current = { user: { id: userA.id } };
    const res = await GET(makeRequest("/api/downloads/generate"));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { downloads: Array<{ userId: string }> };
    expect(json.downloads).toHaveLength(2);
    expect(json.downloads.every((d) => d.userId === userA.id)).toBe(true);
  });
});
