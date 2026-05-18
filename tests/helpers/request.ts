import { NextRequest } from "next/server";

interface RequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  ip?: string;
}

const DEFAULT_BASE = "http://localhost:3000";

export function makeRequest(path: string, opts: RequestOptions = {}): NextRequest {
  const url = path.startsWith("http") ? path : `${DEFAULT_BASE}${path}`;
  const method = opts.method ?? "GET";
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...(opts.ip ? { "x-forwarded-for": opts.ip } : {}),
    ...(opts.headers ?? {}),
  };
  const body = opts.body === undefined ? undefined : typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body);
  return new NextRequest(url, { method, headers, body } as ConstructorParameters<typeof NextRequest>[1]);
}

export async function readJson(res: Response): Promise<unknown> {
  return res.json();
}
