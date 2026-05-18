import { NextRequest } from "next/server";

/**
 * In-process sliding-window rate limiter.
 * Stored on globalThis so it survives Next.js HMR without resetting counters.
 *
 * NOTE: Works correctly in a single Node.js process. For multi-instance
 * deployments a shared store (Redis) would be needed.
 */
interface WindowEntry {
  hits: number[];
  windowMs: number;
}

class RateLimiter {
  private windows: Map<string, WindowEntry> = new Map();
  private lastGc = Date.now();

  check(
    key: string,
    limit: number,
    windowMs: number
  ): { allowed: boolean; retryAfter?: number } {
    const now = Date.now();

    // GC every 2 minutes — prune entries with no recent hits
    if (now - this.lastGc > 120_000) {
      this.lastGc = now;
      for (const [k, entry] of this.windows) {
        const fresh = entry.hits.filter((t) => now - t < entry.windowMs);
        if (fresh.length === 0) this.windows.delete(k);
        else entry.hits = fresh;
      }
    }

    let entry = this.windows.get(key);
    if (!entry) {
      entry = { hits: [], windowMs };
      this.windows.set(key, entry);
    }

    // Slide the window
    entry.hits = entry.hits.filter((t) => now - t < windowMs);

    if (entry.hits.length >= limit) {
      const retryAfter = Math.ceil((entry.hits[0] + windowMs - now) / 1000);
      return { allowed: false, retryAfter };
    }

    entry.hits.push(now);
    return { allowed: true };
  }
}

const g = globalThis as unknown as { _overraRl?: RateLimiter };
export const rateLimiter: RateLimiter =
  g._overraRl ?? (g._overraRl = new RateLimiter());

export function extractIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}
