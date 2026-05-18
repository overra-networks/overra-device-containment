import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { GET } from "@/app/api/downloads/[token]/route";
import { resetDatabase, disconnect } from "../../helpers/db";
import { makeRequest } from "../../helpers/request";
import { createUser, createDownload } from "../../helpers/factories";

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await disconnect();
});

function makeParams(token: string) {
  return { params: Promise.resolve({ token }) };
}

describe("GET /api/downloads/[token]", () => {
  it("returns 404 for unknown token", async () => {
    const res = await GET(
      makeRequest("/api/downloads/does-not-exist"),
      makeParams("does-not-exist")
    );
    expect(res.status).toBe(404);
  });

  it("serves a PowerShell installer for windows downloads", async () => {
    const user = await createUser();
    const dl = await createDownload(user.id, { platform: "windows" });

    const res = await GET(makeRequest(`/api/downloads/${dl.downloadToken}`), makeParams(dl.downloadToken));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/x-powershell");
    expect(res.headers.get("Content-Disposition")).toMatch(/overra-agent-installer\.ps1/);

    const body = await res.text();
    expect(body).toContain("Overra Agent Installer (Windows)");
    expect(body).toContain(dl.downloadToken);
  });

  it("serves a bash installer for linux downloads", async () => {
    const user = await createUser();
    const dl = await createDownload(user.id, { platform: "linux" });

    const res = await GET(makeRequest(`/api/downloads/${dl.downloadToken}`), makeParams(dl.downloadToken));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/x-sh");
    expect(res.headers.get("Content-Disposition")).toMatch(/overra-agent-install\.sh/);

    const body = await res.text();
    expect(body).toContain("#!/bin/bash");
    expect(body).toContain(dl.downloadToken);
  });

  it("serves a bash installer for macos downloads", async () => {
    const user = await createUser();
    const dl = await createDownload(user.id, { platform: "macos" });

    const res = await GET(makeRequest(`/api/downloads/${dl.downloadToken}`), makeParams(dl.downloadToken));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/x-sh");
    const body = await res.text();
    expect(body).toContain("#!/bin/bash");
  });
});
