// =============================================================
// src/app/api/shorten/route.ts
// POST /api/shorten
// =============================================================
// Creates a short URL and returns the slug + short link.
//
// Flow:
//   1. Rate limit: 20 shortens / hour / IP (Upstash sliding window)
//   2. Parse + validate URL:
//      - Must parse with URL constructor (catches malformed)
//      - Protocol must be http or https
//      - Must not be localhost / private IP (SSRF prevention)
//      - Must not already be a clipto/kuick.io short URL (loop prevention)
//   3. Generate unique slug
//   4. Compute expiresAt
//   5. Save to Prisma: type=URL, content=originalUrl
//   6. Cache in Upstash: key="clipto:slug:<slug>", value=originalUrl, TTL=expiresAt
//   7. Return { slug, shortUrl, originalUrl }
// =============================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateUniqueSlug } from "@/lib/slug";
import { checkRateLimit, getClientIp, hashIp } from "@/lib/ratelimit";
import { setSlugCacheUntil } from "@/lib/cache";
import type { ExpiresIn, ErrorResponse } from "@/types/api";

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const VALID_EXPIRES_IN: ExpiresIn[] = ["1h", "24h", "7d", "never"];

const EXPIRES_IN_MS: Record<Exclude<ExpiresIn, "never">, number> = {
  "1h":  3_600_000,
  "24h": 86_400_000,
  "7d":  604_800_000,
};

/** Our own domains — URLs pointing here would create redirect loops */
const OWN_HOSTNAMES = new Set([
  "kuick.io",
  "www.kuick.io",
  "clipto.vercel.app",
  "localhost",
  "127.0.0.1",
  "::1",
]);

/**
 * RFC-1918 private IP ranges + loopback + link-local.
 * Prevents SSRF attacks where someone shortens an internal IP.
 */
const PRIVATE_IP_PATTERNS = [
  /^127\./,                          // 127.0.0.0/8 — loopback
  /^10\./,                           // 10.0.0.0/8 — private
  /^192\.168\./,                     // 192.168.0.0/16 — private
  /^172\.(1[6-9]|2\d|3[01])\./,     // 172.16.0.0/12 — private
  /^169\.254\./,                     // 169.254.0.0/16 — link-local
  /^::1$/,                           // IPv6 loopback
  /^fc00:/,                          // IPv6 unique local
  /^fe80:/,                          // IPv6 link-local
];

// ─────────────────────────────────────────────────────────────
// URL Validator
// Returns null if valid, or an error string describing the problem
// ─────────────────────────────────────────────────────────────

function validateUrl(raw: string): { parsed: URL } | { error: string } {
  // 1. Length check
  if (!raw || typeof raw !== "string" || raw.trim() === "") {
    return { error: "'url' is required." };
  }
  if (raw.length > 2048) {
    return { error: "URL must not exceed 2048 characters." };
  }

  // 2. Parse — catches malformed URLs
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return { error: `'${raw}' is not a valid URL. Make sure to include http:// or https://.` };
  }

  // 3. Protocol must be http or https
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      error: `Only http:// and https:// URLs are supported (got "${parsed.protocol}").`,
    };
  }

  // 4. Block our own domains → prevents redirect loops
  const hostname = parsed.hostname.toLowerCase();
  if (OWN_HOSTNAMES.has(hostname)) {
    return {
      error: "Cannot shorten a URL that points to this service (would create a redirect loop).",
    };
  }

  // 5. Block private/loopback IPs → SSRF prevention
  for (const pattern of PRIVATE_IP_PATTERNS) {
    if (pattern.test(hostname)) {
      return {
        error: "Cannot shorten URLs pointing to private or local IP addresses.",
      };
    }
  }

  // 6. Hostname must have at least one dot (e.g. "example.com")
  //    This catches bare hostnames like "http://intranet/secret"
  if (!hostname.includes(".") && hostname !== "localhost") {
    return {
      error: `'${hostname}' doesn't look like a valid public hostname.`,
    };
  }

  return { parsed };
}

// ─────────────────────────────────────────────────────────────
// Helper
// ─────────────────────────────────────────────────────────────

function err(
  message: string,
  status: number,
  code?: string,
  headers?: HeadersInit
): NextResponse<ErrorResponse> {
  return NextResponse.json<ErrorResponse>(
    { error: message, ...(code ? { code } : {}) },
    { status, headers }
  );
}

function calcExpiresAt(expiresIn: ExpiresIn | undefined): Date | null {
  if (!expiresIn || expiresIn === "never") return null;
  return new Date(Date.now() + EXPIRES_IN_MS[expiresIn]);
}

// ─────────────────────────────────────────────────────────────
// POST /api/shorten
// ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {

  // ── Step 1: Rate limit — 20/hr/IP (more generous than uploads) ──
  const rawIp  = getClientIp(request);
  const ipHash = await hashIp(rawIp);

  const { allowed, remaining, retryAfter } = await checkRateLimit(
    `shorten:${ipHash}`
  );

  if (!allowed) {
    return err(
      `Too many requests. Please wait ${retryAfter} seconds before shortening another URL.`,
      429,
      "RATE_LIMITED",
      { "Retry-After": String(retryAfter), "X-RateLimit-Remaining": "0" }
    );
  }

  // ── Step 2: Parse body ─────────────────────────────────────
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return err("Request body must be valid JSON.", 400, "INVALID_JSON");
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return err("Request body must be a JSON object.", 400, "INVALID_BODY");
  }

  const { url: rawUrl, expiresIn } = body as Record<string, unknown>;

  // ── Step 3: Validate URL ───────────────────────────────────
  const validation = validateUrl(rawUrl as string);
  if ("error" in validation) {
    return err(validation.error, 400, "INVALID_URL");
  }
  const { parsed } = validation;
  const originalUrl = parsed.href; // normalised canonical form

  // ── Validate expiresIn ─────────────────────────────────────
  if (expiresIn !== undefined && !VALID_EXPIRES_IN.includes(expiresIn as ExpiresIn)) {
    return err(
      `'expiresIn' must be one of: ${VALID_EXPIRES_IN.join(", ")}.`,
      400,
      "VALIDATION_ERROR"
    );
  }

  // ── Step 4: Generate slug ──────────────────────────────────
  let slug: string;
  try {
    slug = await generateUniqueSlug();
  } catch (e) {
    console.error("[shorten] Slug generation failed:", e);
    return err("Failed to generate short URL. Please try again.", 500, "SLUG_ERROR");
  }

  // ── Step 5: Compute expiry ─────────────────────────────────
  const expiresAt = calcExpiresAt(expiresIn as ExpiresIn | undefined);

  // ── Step 6: Persist to database ────────────────────────────
  try {
    await prisma.share.create({
      data: {
        slug,
        type: "URL",
        content: originalUrl,   // destination URL stored in content field
        expiresAt,
        ipHash,
      },
    });
  } catch (e) {
    console.error("[shorten] DB error:", e);
    return err("Failed to create short URL. Please try again.", 500, "DB_ERROR");
  }

  // ── Step 7: Cache in Redis ─────────────────────────────────
  // Store the destination URL keyed by slug for O(1) redirects
  // without hitting the database on every visitor click.
  await setSlugCacheUntil(slug, originalUrl, expiresAt);

  // ── Return success ─────────────────────────────────────────
  const appUrl  = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const shortUrl = `${appUrl}/${slug}`;

  return NextResponse.json(
    {
      slug,
      shortUrl,
      originalUrl,
      expiresAt: expiresAt?.toISOString() ?? null,
    },
    {
      status: 201,
      headers: { "X-RateLimit-Remaining": String(remaining) },
    }
  );
}

export async function GET(): Promise<NextResponse<ErrorResponse>> {
  return NextResponse.json<ErrorResponse>(
    { error: "Method not allowed. Use POST.", code: "METHOD_NOT_ALLOWED" },
    { status: 405, headers: { Allow: "POST" } }
  );
}
