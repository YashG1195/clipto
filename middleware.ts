// =============================================================
// middleware.ts — Edge Middleware (Vercel Edge Runtime)
// =============================================================
// Runs BEFORE every matched request, at the CDN edge — no cold
// starts, no Node.js APIs. Only Web-standard APIs + Upstash SDK.
//
// Responsibilities:
//   1. Extract client IP from proxy headers
//   2. Rate-limit API routes per IP using Upstash sliding window
//   3. Validate slug format for /:slug routes (fast 404 bypass)
//   4. Forward all allowed requests with NextResponse.next()
// =============================================================

import { NextRequest, NextResponse } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// ─────────────────────────────────────────────────────────────
// Edge Runtime declaration
// ─────────────────────────────────────────────────────────────

export const runtime = "experimental-edge";

// ─────────────────────────────────────────────────────────────
// Redis + Rate limiters
//
// Lazily built so the module doesn't crash when Redis env vars
// are absent in local dev. All limiters use a shared Redis
// instance but different key prefixes and windows.
// ─────────────────────────────────────────────────────────────

let redis: Redis | null = null;

function getRedis(): Redis | null {
  if (redis) return redis;

  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token || url.includes("placeholder")) {
    return null;
  }

  redis = new Redis({ url, token });
  return redis;
}

// Cache limiter instances — built once per cold start
const limiters: Map<string, Ratelimit> = new Map();

function getLimiter(name: string, requests: number, window: string): Ratelimit | null {
  if (limiters.has(name)) return limiters.get(name)!;

  const r = getRedis();
  if (!r) return null;

  const limiter = new Ratelimit({
    redis: r,
    limiter: Ratelimit.slidingWindow(requests, window as `${number} ${"ms" | "s" | "m" | "h" | "d"}`),
    analytics: false,           // keep edge cold-start fast
    prefix: `clipto:mw:${name}`,
  });

  limiters.set(name, limiter);
  return limiter;
}

// ─────────────────────────────────────────────────────────────
// getClientIP(request)
//
// Extracts the real client IP from common proxy headers.
// Priority: Vercel real IP → Cloudflare → x-forwarded-for → fallback
// ─────────────────────────────────────────────────────────────

function getClientIP(request: NextRequest): string {
  return (
    request.headers.get("x-real-ip")?.trim() ??
    request.headers.get("cf-connecting-ip")?.trim() ??
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    "127.0.0.1"
  );
}

// ─────────────────────────────────────────────────────────────
// 429 Response builder
// ─────────────────────────────────────────────────────────────

function rateLimitedResponse(retryAfter: number): NextResponse {
  return NextResponse.json(
    {
      error: "Too many requests. Please slow down.",
      retryAfter,
      code: "RATE_LIMITED",
    },
    {
      status: 429,
      headers: {
        "Retry-After":            String(retryAfter),
        "X-RateLimit-Remaining":  "0",
        "Content-Type":           "application/json",
      },
    }
  );
}

// ─────────────────────────────────────────────────────────────
// Slug validation regex
// Must match isValidSlug() in lib/slug.ts exactly
// ─────────────────────────────────────────────────────────────

const SLUG_REGEX = /^[a-zA-Z0-9]{4,12}$/;

// ─────────────────────────────────────────────────────────────
// Route matchers — determine which rate limit bucket to use
// ─────────────────────────────────────────────────────────────

type RateLimitConfig = {
  limiterKey: string;
  requests: number;
  window: string;
};

function getRateLimitConfig(pathname: string): RateLimitConfig | null {
  // /api/shorten — most generous (20/hr)
  if (pathname === "/api/shorten") {
    return { limiterKey: "shorten", requests: 20, window: "1 h" };
  }

  // /api/share/file — strictest (5/hr — large uploads)
  if (pathname.startsWith("/api/share/file")) {
    return { limiterKey: "share_file", requests: 5, window: "1 h" };
  }

  // /api/share/* — standard (10/hr)
  if (pathname.startsWith("/api/share")) {
    return { limiterKey: "share", requests: 10, window: "1 h" };
  }

  // /api/* (other) — generic guard (30/hr)
  if (pathname.startsWith("/api/")) {
    return { limiterKey: "api_generic", requests: 30, window: "1 h" };
  }

  return null; // no rate limiting for this path
}

// ─────────────────────────────────────────────────────────────
// middleware()
// ─────────────────────────────────────────────────────────────

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;
  const ip = getClientIP(request);

  // ── 1. Skip auth routes entirely ──────────────────────────
  // Clerk / NextAuth callbacks must not be rate-limited
  if (
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/sign-in") ||
    pathname.startsWith("/sign-up")
  ) {
    return NextResponse.next();
  }

  // ── 2. Rate limit API routes ───────────────────────────────
  const rlConfig = getRateLimitConfig(pathname);

  if (rlConfig) {
    const limiter = getLimiter(
      rlConfig.limiterKey,
      rlConfig.requests,
      rlConfig.window
    );

    if (limiter) {
      // Identifier = limiterKey:ip so each endpoint has its own bucket per IP
      const identifier = `${rlConfig.limiterKey}:${ip}`;

      try {
        const { success, reset, remaining } = await limiter.limit(identifier);

        if (!success) {
          const retryAfter = Math.max(1, Math.ceil((reset - Date.now()) / 1000));
          return rateLimitedResponse(retryAfter);
        }

        // Attach rate limit headers to allowed requests
        const response = NextResponse.next();
        response.headers.set("X-RateLimit-Remaining", String(remaining));
        response.headers.set("X-RateLimit-Reset",     String(reset));
        return response;

      } catch (e) {
        // Redis failure must never block the request — fail open
        console.warn("[middleware] Rate limiter error (failing open):", e);
        return NextResponse.next();
      }
    }

    // No limiter available (Redis not configured) — pass through
    return NextResponse.next();
  }

  // ── 3. Slug route validation ───────────────────────────────
  // For /:slug routes, validate the slug format here at the edge
  // so malformed slugs are caught before hitting the server component.
  //
  // We only do this for single-segment paths that don't start with
  // a known prefix (api, _next, favicon, etc.)
  const segments = pathname.split("/").filter(Boolean);

  if (
    segments.length === 1 &&
    !pathname.startsWith("/_next") &&
    !pathname.startsWith("/favicon") &&
    !pathname.startsWith("/api")    &&
    !pathname.startsWith("/sign")   &&
    !pathname.startsWith("/public")
  ) {
    const slug = segments[0];

    if (!SLUG_REGEX.test(slug)) {
      // Invalid slug format — let Next.js render the 404 page
      // (don't redirect, just pass through; the [slug] page will notFound())
      return NextResponse.next();
    }
  }

  // ── 4. All clear — forward the request ────────────────────
  return NextResponse.next();
}

// ─────────────────────────────────────────────────────────────
// Matcher config
//
// Include:  /api/* routes, /:slug routes
// Exclude:  Next.js internals, static files, images, favicon
//
// Note: the slug matcher is intentionally broad — the middleware
// itself filters out non-slug single-segment paths above.
// ─────────────────────────────────────────────────────────────

export const config = {
  matcher: [
    // All API routes (except static/_next)
    "/api/(.*)",
    // Single-segment slug routes — exclude known non-slug prefixes
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|public/).*)",
  ],
};
