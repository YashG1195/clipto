// =============================================================
// src/app/api/share/text/route.ts
// POST /api/share/text
// =============================================================
// Creates a new text share and returns its public URL.
//
// Flow:
//   1. Extract & hash client IP
//   2. Rate limit: 10 req / 60 min / IP (Upstash sliding window)
//   3. Parse + validate request body
//   4. Generate collision-free slug (nanoid, retries on collision)
//   5. Compute expiresAt from expiresIn param
//   6. Persist Share row via Prisma
//   7. Return { slug, url, type, expiresAt, createdAt }
// =============================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateUniqueSlug } from "@/lib/slug";
import { checkRateLimit, getClientIp, hashIp } from "@/lib/ratelimit";
import type { ExpiresIn, ShareResponse, ErrorResponse } from "@/types/api";

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const MAX_CONTENT_LENGTH = 100_000; // 100 KB of text

/** Maps expiresIn param → milliseconds offset from now */
const EXPIRES_IN_MS: Record<Exclude<ExpiresIn, "never">, number> = {
  "1h":  1 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d":  7 * 24 * 60 * 60 * 1000,
};

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function errorResponse(
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
// POST /api/share/text
// ─────────────────────────────────────────────────────────────

export async function POST(
  request: NextRequest
): Promise<NextResponse<ShareResponse | ErrorResponse>> {

  // ── Step 1: Extract & hash client IP ───────────────────────
  const rawIp = getClientIp(request);
  const ipHash = await hashIp(rawIp);

  // ── Step 2: Rate limiting ───────────────────────────────────
  const { allowed, remaining, retryAfter } = await checkRateLimit(ipHash);

  if (!allowed) {
    return errorResponse(
      `Too many requests. Please wait ${retryAfter} seconds before trying again.`,
      429,
      "RATE_LIMITED",
      {
        "Retry-After": String(retryAfter),
        "X-RateLimit-Remaining": "0",
      }
    );
  }

  // ── Step 3: Parse & validate body ──────────────────────────
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Request body must be valid JSON.", 400, "INVALID_JSON");
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return errorResponse("Request body must be a JSON object.", 400, "INVALID_BODY");
  }

  const { content, expiresIn } = body as Record<string, unknown>;

  // Validate: content
  if (content === undefined || content === null) {
    return errorResponse("'content' is required.", 400, "VALIDATION_ERROR");
  }
  if (typeof content !== "string") {
    return errorResponse("'content' must be a string.", 400, "VALIDATION_ERROR");
  }
  if (content.trim().length === 0) {
    return errorResponse("'content' cannot be empty.", 400, "VALIDATION_ERROR");
  }
  if (content.length > MAX_CONTENT_LENGTH) {
    return errorResponse(
      `'content' exceeds maximum length of ${MAX_CONTENT_LENGTH.toLocaleString()} characters (got ${content.length.toLocaleString()}).`,
      400,
      "CONTENT_TOO_LONG"
    );
  }

  // Validate: expiresIn (optional)
  const validExpiresIn: ExpiresIn[] = ["1h", "24h", "7d", "never"];
  if (expiresIn !== undefined && !validExpiresIn.includes(expiresIn as ExpiresIn)) {
    return errorResponse(
      `'expiresIn' must be one of: ${validExpiresIn.join(", ")}.`,
      400,
      "VALIDATION_ERROR"
    );
  }

  // ── Step 4: Generate unique slug ───────────────────────────
  let slug: string;
  try {
    slug = await generateUniqueSlug();
  } catch (err) {
    console.error("[share/text] Failed to generate slug:", err);
    return errorResponse("Failed to generate share link. Please try again.", 500, "SLUG_ERROR");
  }

  // ── Step 5: Calculate expiry timestamp ─────────────────────
  const expiresAt = calcExpiresAt(expiresIn as ExpiresIn | undefined);

  // ── Step 6: Persist to database ────────────────────────────
  let share: { slug: string; createdAt: Date; expiresAt: Date | null };
  try {
    share = await prisma.share.create({
      data: {
        slug,
        type: "TEXT",
        content,
        expiresAt,
        ipHash,
        // userId: null — anonymous share (no auth in this step)
      },
      select: {
        slug: true,
        createdAt: true,
        expiresAt: true,
      },
    });
  } catch (err) {
    // Log full error server-side but never expose internals to client
    console.error("[share/text] Database error:", err);
    return errorResponse(
      "Failed to save your share. Please try again in a moment.",
      500,
      "DB_ERROR"
    );
  }

  // ── Step 7: Return success response ────────────────────────
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const shareUrl = `${appUrl}/${share.slug}`;

  return NextResponse.json<ShareResponse>(
    {
      slug: share.slug,
      url: shareUrl,
      type: "TEXT",
      expiresAt: share.expiresAt?.toISOString() ?? null,
      createdAt: share.createdAt.toISOString(),
    },
    {
      status: 201,
      headers: {
        "X-RateLimit-Remaining": String(remaining),
      },
    }
  );
}

// ─────────────────────────────────────────────────────────────
// Only POST is supported — return 405 for everything else
// ─────────────────────────────────────────────────────────────

export async function GET(): Promise<NextResponse<ErrorResponse>> {
  return errorResponse("Method not allowed. Use POST.", 405, "METHOD_NOT_ALLOWED", {
    Allow: "POST",
  });
}
