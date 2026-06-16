// =============================================================
// src/lib/ratelimit.ts — Upstash Rate Limiter
// =============================================================
// Wraps @upstash/ratelimit with a clean helper so route
// handlers only need one import and one await call.
//
// Falls back gracefully when Redis env vars are missing
// (e.g. local dev without Upstash) — logs a warning and
// allows the request through rather than blocking everything.
// =============================================================

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// ─────────────────────────────────────────────────────────────
// Build the rate limiter lazily so missing env vars in dev
// don't crash the entire module on import
// ─────────────────────────────────────────────────────────────

let ratelimit: Ratelimit | null = null;

function getRatelimiter(): Ratelimit | null {
  if (ratelimit) return ratelimit;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token || url === "https://placeholder.upstash.io") {
    if (process.env.NODE_ENV === "development") {
      console.warn(
        "[ratelimit] UPSTASH_REDIS_REST_URL / TOKEN not set — rate limiting is DISABLED in this environment."
      );
    }
    return null;
  }

  ratelimit = new Ratelimit({
    redis: new Redis({ url, token }),
    // Sliding window: 10 requests per 60 minutes per identifier
    limiter: Ratelimit.slidingWindow(10, "60 m"),
    analytics: true,
    prefix: "clipto:rl",
  });

  return ratelimit;
}

// ─────────────────────────────────────────────────────────────
// checkRateLimit(identifier)
//
// Returns: { allowed: true } or { allowed: false, retryAfter: number }
//
// identifier — typically the hashed IP address
// ─────────────────────────────────────────────────────────────

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfter: number; // seconds until reset (0 if allowed)
}

export async function checkRateLimit(
  identifier: string
): Promise<RateLimitResult> {
  const limiter = getRatelimiter();

  // If limiter is unavailable (no Redis), always allow
  if (!limiter) {
    return { allowed: true, remaining: 999, retryAfter: 0 };
  }

  const { success, remaining, reset } = await limiter.limit(identifier);

  const retryAfter = success
    ? 0
    : Math.ceil((reset - Date.now()) / 1000); // ms → seconds

  return { allowed: success, remaining, retryAfter };
}

// ─────────────────────────────────────────────────────────────
// hashIp(ip)
//
// One-way SHA-256 hash of the raw IP address.
// We never store the raw IP — only this hash — for privacy.
// ─────────────────────────────────────────────────────────────

export async function hashIp(ip: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(ip + (process.env.IP_HASH_SALT ?? "clipto"));
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ─────────────────────────────────────────────────────────────
// getClientIp(request)
//
// Extracts the real client IP from Next.js request headers.
// Checks Vercel / Cloudflare / standard proxy headers in order.
// ─────────────────────────────────────────────────────────────

export function getClientIp(request: Request): string {
  return (
    request.headers.get("x-real-ip") ??
    request.headers.get("cf-connecting-ip") ??       // Cloudflare
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    "unknown"
  );
}
