// =============================================================
// src/app/api/share/[slug]/route.ts
// DELETE /api/share/[slug]
// =============================================================
// Deletes a share owned by the authenticated user.
//
// Steps:
//   1. Verify Clerk auth — 401 if not signed in
//   2. Fetch share by slug — 404 if not found
//   3. Verify ownership (share.userId === clerkUserId) — 403 if not owner
//   4. If FILE: delete object from R2 (DeleteObjectCommand)
//   5. Delete DB row from Prisma
//   6. Invalidate Redis cache entry
//   7. Return { success: true }
// =============================================================

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { prisma }            from "@/lib/prisma";
import { r2, BUCKET }        from "@/lib/r2";
import { deleteSlugCache }   from "@/lib/cache";
import { isValidSlug }       from "@/lib/slug";
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
// DELETE /api/share/[slug]
// ─────────────────────────────────────────────────────────────

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { slug: string } }
): Promise<NextResponse> {
  const { slug } = params;

  // ── Validate slug format ───────────────────────────────────
  if (!isValidSlug(slug)) {
    return err("Invalid slug.", 400, "INVALID_SLUG");
  }

  // ── Verify authentication ──────────────────────────────────
  const { userId } = auth();
  if (!userId) {
    return err("You must be signed in to delete a share.", 401, "UNAUTHORIZED");
  }

  // ── Fetch share from DB ────────────────────────────────────
  let share: {
    slug:       string;
    type:       string;
    storageKey: string | null;
    userId:     string | null;
  } | null;

  try {
    share = await prisma.share.findUnique({
      where:  { slug },
      select: { slug: true, type: true, storageKey: true, userId: true },
    });
  } catch (e) {
    console.error("[delete] DB lookup error:", e);
    return err("Database error. Please try again.", 500, "DB_ERROR");
  }

  if (!share) {
    return err("Share not found.", 404, "NOT_FOUND");
  }

  // ── Verify ownership ──────────────────────────────────────
  if (share.userId !== userId) {
    return err("You don't have permission to delete this share.", 403, "FORBIDDEN");
  }

  // ── Delete from R2 (FILE shares only) ─────────────────────
  if (share.type === "FILE" && share.storageKey) {
    try {
      await r2.send(
        new DeleteObjectCommand({
          Bucket: BUCKET,
          Key:    share.storageKey,
        })
      );
    } catch (e) {
      // Log but don't block DB delete — orphaned R2 objects are preferable
      // to ghost DB rows (easier to clean up with a sweep job)
      console.error(`[delete] R2 delete failed for key "${share.storageKey}":`, e);
    }
  }

  // ── Delete DB row ──────────────────────────────────────────
  try {
    await prisma.share.delete({ where: { slug } });
  } catch (e) {
    console.error("[delete] DB delete error:", e);
    return err("Failed to delete share. Please try again.", 500, "DB_ERROR");
  }

  // ── Invalidate Redis cache ─────────────────────────────────
  await deleteSlugCache(slug); // non-fatal, already catches errors internally

  return NextResponse.json({ success: true, slug });
}

export async function GET(): Promise<NextResponse<ErrorResponse>> {
  return NextResponse.json<ErrorResponse>(
    { error: "Method not allowed.", code: "METHOD_NOT_ALLOWED" },
    { status: 405, headers: { Allow: "DELETE" } }
  );
}
