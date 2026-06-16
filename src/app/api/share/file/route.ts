// =============================================================
// src/app/api/share/file/route.ts
// POST /api/share/file
// =============================================================
// Step 1 of 2-step file upload:
//   1. Validate file metadata (name, size, MIME type)
//   2. Generate slug + storageKey
//   3. Create a pending Share row in DB
//   4. Return a presigned PUT URL valid for 10 minutes
//
// Client then PUTs the file directly to R2 using uploadUrl,
// then calls POST /api/share/file/complete to confirm.
// =============================================================

import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { prisma } from "@/lib/prisma";
import { r2, BUCKET } from "@/lib/r2";
import { generateUniqueSlug } from "@/lib/slug";
import { checkRateLimit, getClientIp, hashIp } from "@/lib/ratelimit";
import type { ExpiresIn, ErrorResponse } from "@/types/api";

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB in bytes
const PRESIGN_EXPIRES_IN = 600;           // 10 minutes in seconds

/** Allowed MIME types — extend this list as needed */
const ALLOWED_MIME_TYPES = new Set([
  // Images
  "image/jpeg", "image/png", "image/gif", "image/webp",
  "image/svg+xml", "image/avif", "image/tiff", "image/bmp",
  // Documents
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.oasis.opendocument.spreadsheet",
  // Archives
  "application/zip", "application/x-tar", "application/gzip",
  "application/x-7z-compressed", "application/x-rar-compressed",
  "application/x-bzip2",
  // Code / text
  "text/plain", "text/html", "text/css", "text/csv",
  "text/javascript", "application/json", "application/xml",
  "application/x-yaml",
  // Audio
  "audio/mpeg", "audio/wav", "audio/ogg", "audio/flac",
  "audio/aac", "audio/webm",
  // Video
  "video/mp4", "video/webm", "video/ogg", "video/quicktime",
  "video/x-msvideo", "video/mpeg",
]);

const VALID_EXPIRES_IN: ExpiresIn[] = ["1h", "24h", "7d", "never"];

const EXPIRES_IN_MS: Record<Exclude<ExpiresIn, "never">, number> = {
  "1h":  3_600_000,
  "24h": 86_400_000,
  "7d":  604_800_000,
};

// ─────────────────────────────────────────────────────────────
// Helpers
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

/** Strip dangerous chars from file name for use in storage keys */
function sanitizeFileName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9._-]/g, "_") // replace unsafe chars with _
    .replace(/_{2,}/g, "_")            // collapse consecutive underscores
    .replace(/^_|_$/g, "")            // trim leading/trailing underscores
    .slice(0, 200);                    // cap length
}

function calcExpiresAt(expiresIn: ExpiresIn | undefined): Date | null {
  if (!expiresIn || expiresIn === "never") return null;
  return new Date(Date.now() + EXPIRES_IN_MS[expiresIn]);
}

// ─────────────────────────────────────────────────────────────
// POST /api/share/file
// ─────────────────────────────────────────────────────────────

export async function POST(
  request: NextRequest
): Promise<NextResponse> {

  // ── Rate limit: 5 uploads/hour/IP ──────────────────────────
  const rawIp = getClientIp(request);
  const ipHash = await hashIp(rawIp);

  // Use a separate rate limit key for file uploads (stricter than text)
  const { allowed, remaining, retryAfter } = await checkRateLimit(
    `file:${ipHash}`
  );

  if (!allowed) {
    return err(
      `Upload limit reached. Please wait ${retryAfter} seconds before uploading again.`,
      429,
      "RATE_LIMITED",
      { "Retry-After": String(retryAfter), "X-RateLimit-Remaining": "0" }
    );
  }

  // ── Parse body ─────────────────────────────────────────────
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return err("Request body must be valid JSON.", 400, "INVALID_JSON");
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return err("Request body must be a JSON object.", 400, "INVALID_BODY");
  }

  const { fileName, fileSize, mimeType, expiresIn } =
    body as Record<string, unknown>;

  // ── Validate fileName ──────────────────────────────────────
  if (!fileName || typeof fileName !== "string" || fileName.trim() === "") {
    return err("'fileName' is required and must be a non-empty string.", 400, "VALIDATION_ERROR");
  }
  if (fileName.length > 255) {
    return err("'fileName' must not exceed 255 characters.", 400, "VALIDATION_ERROR");
  }

  // ── Validate fileSize ──────────────────────────────────────
  if (fileSize === undefined || fileSize === null) {
    return err("'fileSize' is required.", 400, "VALIDATION_ERROR");
  }
  if (typeof fileSize !== "number" || !Number.isInteger(fileSize) || fileSize <= 0) {
    return err("'fileSize' must be a positive integer (bytes).", 400, "VALIDATION_ERROR");
  }
  if (fileSize > MAX_FILE_SIZE) {
    return err(
      `File too large. Maximum allowed size is 100 MB (got ${(fileSize / 1024 / 1024).toFixed(1)} MB).`,
      400,
      "FILE_TOO_LARGE"
    );
  }

  // ── Validate mimeType ──────────────────────────────────────
  if (!mimeType || typeof mimeType !== "string") {
    return err("'mimeType' is required.", 400, "VALIDATION_ERROR");
  }
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    return err(
      `File type '${mimeType}' is not allowed. Supported types include images, documents, archives, audio, and video.`,
      400,
      "UNSUPPORTED_MIME_TYPE"
    );
  }

  // ── Validate expiresIn ─────────────────────────────────────
  if (expiresIn !== undefined && !VALID_EXPIRES_IN.includes(expiresIn as ExpiresIn)) {
    return err(
      `'expiresIn' must be one of: ${VALID_EXPIRES_IN.join(", ")}.`,
      400,
      "VALIDATION_ERROR"
    );
  }

  // ── Generate slug ──────────────────────────────────────────
  let slug: string;
  try {
    slug = await generateUniqueSlug();
  } catch (e) {
    console.error("[share/file] Slug generation failed:", e);
    return err("Failed to generate share link. Please try again.", 500, "SLUG_ERROR");
  }

  // ── Build storage key ──────────────────────────────────────
  // Format: uploads/<slug>/<sanitized-filename>
  const safeName = sanitizeFileName(fileName.trim());
  const storageKey = `uploads/${slug}/${safeName}`;

  // ── Generate presigned PUT URL ─────────────────────────────
  let uploadUrl: string;
  try {
    const command = new PutObjectCommand({
      Bucket: BUCKET,
      Key: storageKey,
      ContentType: mimeType,
      ContentLength: fileSize,
      // Metadata stored alongside the object in R2
      Metadata: {
        "original-filename": encodeURIComponent(fileName),
        "share-slug": slug,
      },
    });

    uploadUrl = await getSignedUrl(r2, command, {
      expiresIn: PRESIGN_EXPIRES_IN,
    });
  } catch (e) {
    console.error("[share/file] Presign error:", e);
    return err("Failed to generate upload URL. Please try again.", 500, "PRESIGN_ERROR");
  }

  // ── Persist pending Share to DB ────────────────────────────
  const expiresAt = calcExpiresAt(expiresIn as ExpiresIn | undefined);

  try {
    await prisma.share.create({
      data: {
        slug,
        type: "FILE",
        storageKey,
        fileName: fileName.trim(),
        fileSize,
        mimeType,
        expiresAt,
        ipHash,
        // confirmedAt is null — set only after /complete verifies the upload
      },
    });
  } catch (e) {
    console.error("[share/file] DB error:", e);
    return err("Failed to save file share. Please try again.", 500, "DB_ERROR");
  }

  // ── Return presigned URL + share URL ──────────────────────
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  return NextResponse.json(
    {
      slug,
      uploadUrl,
      shareUrl: `${appUrl}/${slug}`,
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
