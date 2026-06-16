// =============================================================
// src/app/api/cron/cleanup/route.ts
// GET /api/cron/cleanup
// =============================================================
// Scheduled cleanup job — deletes expired shares from DB + R2.
// Called by Vercel Cron every hour (see vercel.json).
//
// Security: requires Bearer token matching CRON_SECRET env var.
// Without it, any public request could trigger mass deletion.
//
// Strategy:
//   1. Auth check
//   2. Query all expired shares (expiresAt < now, not null)
//   3. Delete R2 objects for FILE type (parallel, with error collection)
//   4. Batch delete all expired DB rows
//   5. Batch delete Redis cache entries
//   6. Return summary { deleted, fileErrors, durationMs }
// =============================================================

import { NextRequest, NextResponse } from "next/server";
import { DeleteObjectCommand }        from "@aws-sdk/client-s3";
import { prisma }                     from "@/lib/prisma";
import { r2, BUCKET }                 from "@/lib/r2";
import { deleteSlugCache }            from "@/lib/cache";

// ─────────────────────────────────────────────────────────────
// Auth helper
// ─────────────────────────────────────────────────────────────

function isAuthorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;

  // If no CRON_SECRET set, only allow in local dev
  if (!cronSecret) {
    return process.env.NODE_ENV === "development";
  }

  // Accept both "Bearer <secret>" and bare "<secret>"
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : authHeader;

  return token === cronSecret;
}

// ─────────────────────────────────────────────────────────────
// Storage query helpers (also exported for reuse)
// ─────────────────────────────────────────────────────────────

/**
 * Total storage used across all users (bytes).
 * Uses Prisma aggregate to sum fileSize for FILE shares.
 */
export async function getTotalStorageBytes(): Promise<number> {
  const result = await prisma.share.aggregate({
    where:  { type: "FILE", fileSize: { not: null } },
    _sum:   { fileSize: true },
  });
  return result._sum.fileSize ?? 0;
}

/**
 * Storage used per user (bytes), sorted descending.
 * Returns top 100 users by storage consumption.
 */
export async function getStoragePerUser(): Promise<
  { userId: string; totalBytes: number; fileCount: number }[]
> {
  // Prisma groupBy for per-user aggregation
  const rows = await prisma.share.groupBy({
    by:     ["userId"],
    where:  { type: "FILE", fileSize: { not: null }, userId: { not: null } },
    _sum:   { fileSize: true },
    _count: { slug: true },
    orderBy: { _sum: { fileSize: "desc" } },
    take:   100,
  });

  return rows.map((r) => ({
    userId:     r.userId ?? "anonymous",
    totalBytes: r._sum.fileSize  ?? 0,
    fileCount:  r._count.slug    ?? 0,
  }));
}

// ─────────────────────────────────────────────────────────────
// GET /api/cron/cleanup
// ─────────────────────────────────────────────────────────────

export async function GET(request: NextRequest): Promise<NextResponse> {
  const startMs = Date.now();

  // ── Auth check ─────────────────────────────────────────────
  if (!isAuthorized(request)) {
    console.warn("[cron/cleanup] Unauthorized request — missing or invalid CRON_SECRET");
    return NextResponse.json(
      { error: "Unauthorized. Provide a valid Bearer CRON_SECRET.", code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  console.log("[cron/cleanup] Starting cleanup job…");

  // ── Fetch expired shares ───────────────────────────────────
  const now = new Date();
  let expired: {
    slug:       string;
    type:       string;
    storageKey: string | null;
    fileName:   string | null;
  }[];

  try {
    expired = await prisma.share.findMany({
      where: {
        expiresAt: {
          lt:  now,
          not: null,
        },
      },
      select: {
        slug:       true,
        type:       true,
        storageKey: true,
        fileName:   true,
      },
    });
  } catch (e) {
    console.error("[cron/cleanup] DB query failed:", e);
    return NextResponse.json(
      { error: "Failed to query expired shares.", code: "DB_ERROR" },
      { status: 500 }
    );
  }

  console.log(`[cron/cleanup] Found ${expired.length} expired shares to delete`);

  if (expired.length === 0) {
    return NextResponse.json({
      deleted:     0,
      fileDeleted: 0,
      fileErrors:  [],
      durationMs:  Date.now() - startMs,
      message:     "No expired shares to clean up.",
    });
  }

  // ── Delete R2 objects (FILE shares only, parallel) ─────────
  const fileShares = expired.filter(
    (s) => s.type === "FILE" && s.storageKey
  );

  const fileErrors: { slug: string; key: string; error: string }[] = [];
  let fileDeleted = 0;

  await Promise.allSettled(
    fileShares.map(async (share) => {
      try {
        await r2.send(
          new DeleteObjectCommand({
            Bucket: BUCKET,
            Key:    share.storageKey!,
          })
        );
        fileDeleted++;
        console.log(`[cron/cleanup] R2 deleted: ${share.storageKey}`);
      } catch (e) {
        const msg = (e as Error).message ?? String(e);
        console.error(`[cron/cleanup] R2 delete failed for "${share.storageKey}": ${msg}`);
        fileErrors.push({
          slug:  share.slug,
          key:   share.storageKey!,
          error: msg,
        });
      }
    })
  );

  // ── Batch delete from Prisma ───────────────────────────────
  const slugsToDelete = expired.map((s) => s.slug);
  let deleted = 0;

  try {
    const result = await prisma.share.deleteMany({
      where: {
        slug:      { in: slugsToDelete },
        expiresAt: { lt: now, not: null }, // double-check — safety net
      },
    });
    deleted = result.count;
    console.log(`[cron/cleanup] Prisma deleted ${deleted} rows`);
  } catch (e) {
    console.error("[cron/cleanup] Prisma deleteMany failed:", e);
    // Still return partial success — R2 objects may already be gone
    return NextResponse.json(
      {
        error:       "DB batch delete failed. R2 objects may have been deleted.",
        fileDeleted,
        fileErrors,
        code:        "DB_DELETE_ERROR",
      },
      { status: 500 }
    );
  }

  // ── Invalidate Redis cache for all deleted slugs ───────────
  // Run in background — don't await to keep response fast
  Promise.allSettled(
    slugsToDelete.map((slug) => deleteSlugCache(slug))
  ).catch((e) => console.warn("[cron/cleanup] Redis invalidation error:", e));

  const durationMs = Date.now() - startMs;

  console.log(
    `[cron/cleanup] Done in ${durationMs}ms — ` +
    `${deleted} DB rows, ${fileDeleted}/${fileShares.length} R2 objects deleted`
  );

  return NextResponse.json({
    deleted,
    fileDeleted,
    fileErrors: fileErrors.length > 0 ? fileErrors : [],
    durationMs,
    timestamp:  now.toISOString(),
  });
}
