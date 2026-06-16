// =============================================================
// src/app/api/share/file/complete/route.ts
// POST /api/share/file/complete
// =============================================================
// Step 2 of 2-step file upload.
//
// After the client PUTs the file to R2 using the presigned URL,
// it calls this endpoint to confirm the upload succeeded.
//
// Steps:
//   1. Validate slug param
//   2. Look up the pending Share row in DB
//   3. Verify the object actually exists in R2 (HeadObjectCommand)
//   4. Stamp confirmedAt = now() so the share becomes publicly visible
//   5. Return { success: true, shareUrl }
//
// Why verify with HeadObject?
//   Without this check, an attacker could call /complete with any
//   slug and mark a share as confirmed without uploading anything.
// =============================================================

import { NextRequest, NextResponse } from "next/server";
import { HeadObjectCommand, NoSuchKey } from "@aws-sdk/client-s3";
import { prisma } from "@/lib/prisma";
import { r2, BUCKET } from "@/lib/r2";
import { isValidSlug } from "@/lib/slug";
import { getClientIp, hashIp } from "@/lib/ratelimit";
import type { ErrorResponse } from "@/types/api";

// ─────────────────────────────────────────────────────────────
// Helper
// ─────────────────────────────────────────────────────────────

function err(
  message: string,
  status: number,
  code?: string
): NextResponse<ErrorResponse> {
  return NextResponse.json<ErrorResponse>(
    { error: message, ...(code ? { code } : {}) },
    { status }
  );
}

// ─────────────────────────────────────────────────────────────
// POST /api/share/file/complete
// ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {

  // ── Parse body ─────────────────────────────────────────────
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return err("Request body must be valid JSON.", 400, "INVALID_JSON");
  }

  const { slug } = (body ?? {}) as Record<string, unknown>;

  // ── Validate slug ──────────────────────────────────────────
  if (!slug || typeof slug !== "string") {
    return err("'slug' is required.", 400, "VALIDATION_ERROR");
  }
  if (!isValidSlug(slug)) {
    return err("Invalid slug format.", 400, "INVALID_SLUG");
  }

  // ── Look up the Share row ──────────────────────────────────
  let share: {
    slug: string;
    storageKey: string | null;
    confirmedAt: Date | null;
    type: string;
    expiresAt: Date | null;
  } | null;

  try {
    share = await prisma.share.findUnique({
      where: { slug },
      select: {
        slug: true,
        storageKey: true,
        confirmedAt: true,
        type: true,
        expiresAt: true,
      },
    });
  } catch (e) {
    console.error("[file/complete] DB lookup error:", e);
    return err("Database error. Please try again.", 500, "DB_ERROR");
  }

  if (!share) {
    return err("Share not found.", 404, "NOT_FOUND");
  }

  if (share.type !== "FILE") {
    return err("This share is not a file upload.", 400, "WRONG_TYPE");
  }

  if (!share.storageKey) {
    return err("Share has no associated storage key.", 400, "NO_STORAGE_KEY");
  }

  // ── Already confirmed? ─────────────────────────────────────
  if (share.confirmedAt) {
    // Idempotent — return success if already confirmed
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    return NextResponse.json({
      success: true,
      shareUrl: `${appUrl}/${share.slug}`,
      alreadyConfirmed: true,
    });
  }

  // ── Verify file exists in R2 ───────────────────────────────
  try {
    await r2.send(
      new HeadObjectCommand({
        Bucket: BUCKET,
        Key: share.storageKey,
      })
    );
    // HeadObject succeeds → object exists
  } catch (e: unknown) {
    // NoSuchKey or 404 → file was never uploaded
    if (
      e instanceof NoSuchKey ||
      (e as { name?: string }).name === "NoSuchKey" ||
      (e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404
    ) {
      console.warn(
        `[file/complete] Object not found in R2 for slug "${slug}", key "${share.storageKey}"`
      );
      return err(
        "File not found in storage. Please re-upload and try again.",
        404,
        "FILE_NOT_IN_STORAGE"
      );
    }

    // Any other R2 error (auth, network, etc.)
    console.error("[file/complete] R2 HeadObject error:", e);
    return err(
      "Could not verify file in storage. Please try again.",
      502,
      "STORAGE_ERROR"
    );
  }

  // ── Stamp confirmedAt ──────────────────────────────────────
  try {
    await prisma.share.update({
      where: { slug },
      data: { confirmedAt: new Date() },
    });
  } catch (e) {
    console.error("[file/complete] DB update error:", e);
    return err("Failed to confirm upload. Please try again.", 500, "DB_ERROR");
  }

  // ── Verify not expired (edge case) ────────────────────────
  if (share.expiresAt && share.expiresAt < new Date()) {
    return err("This share link has expired.", 410, "EXPIRED");
  }

  // ── Success ────────────────────────────────────────────────
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  return NextResponse.json({
    success: true,
    shareUrl: `${appUrl}/${share.slug}`,
    alreadyConfirmed: false,
  });
}

export async function GET(): Promise<NextResponse<ErrorResponse>> {
  return NextResponse.json<ErrorResponse>(
    { error: "Method not allowed. Use POST.", code: "METHOD_NOT_ALLOWED" },
    { status: 405, headers: { Allow: "POST" } }
  );
}
