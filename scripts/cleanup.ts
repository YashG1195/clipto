#!/usr/bin/env ts-node
// =============================================================
// scripts/cleanup.ts — Local Manual Cleanup Utility
// =============================================================
// Deletes expired shares from Prisma + R2 without needing
// the Next.js server running. Useful for:
//   - Local dev cleanup
//   - Emergency purge from CLI
//   - CI pipeline integration
//
// Usage:
//   npx ts-node scripts/cleanup.ts
//   npx ts-node scripts/cleanup.ts --dry-run
//   npx ts-node scripts/cleanup.ts --before 2024-01-01
//
// Requires DATABASE_URL and CLOUDFLARE_* env vars to be set.
// Will load from .env.local automatically.
// =============================================================

import { config }              from "dotenv";
import { resolve }             from "path";
import { PrismaClient }        from "@prisma/client";
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";

// Load .env.local from project root
config({ path: resolve(__dirname, "../.env.local") });
config({ path: resolve(__dirname, "../.env") });

// ─────────────────────────────────────────────────────────────
// CLI Args
// ─────────────────────────────────────────────────────────────

const args       = process.argv.slice(2);
const isDryRun   = args.includes("--dry-run");
const beforeArg  = args.find((a) => a.startsWith("--before="))?.split("=")[1];
const beforeDate = beforeArg ? new Date(beforeArg) : new Date();

console.log("=".repeat(60));
console.log("clipto — Expired Share Cleanup Script");
console.log("=".repeat(60));
console.log(`Mode:        ${isDryRun ? "DRY RUN (no changes)" : "LIVE"}`);
console.log(`Before date: ${beforeDate.toISOString()}`);
console.log("=".repeat(60));

// ─────────────────────────────────────────────────────────────
// Clients
// ─────────────────────────────────────────────────────────────

const prisma = new PrismaClient({
  log: ["warn", "error"],
});

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID ?? "";
const r2 = accountId
  ? new S3Client({
      region:   "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId:     process.env.CLOUDFLARE_R2_ACCESS_KEY    ?? "",
        secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_KEY    ?? "",
      },
      forcePathStyle: false,
    })
  : null;

const BUCKET = process.env.CLOUDFLARE_R2_BUCKET_NAME ?? "clipto-files";

// ─────────────────────────────────────────────────────────────
// Storage stats query
// ─────────────────────────────────────────────────────────────

async function printStorageStats(): Promise<void> {
  const [totalResult, perUser] = await Promise.all([
    prisma.share.aggregate({
      where: { type: "FILE", fileSize: { not: null } },
      _sum:  { fileSize: true },
      _count: { slug: true },
    }),
    prisma.share.groupBy({
      by:     ["userId"],
      where:  { type: "FILE", fileSize: { not: null } },
      _sum:   { fileSize: true },
      _count: { slug: true },
      orderBy: { _sum: { fileSize: "desc" } },
      take:   5,
    }),
  ]);

  const totalBytes = totalResult._sum.fileSize ?? 0;
  const totalFiles = totalResult._count.slug   ?? 0;

  console.log("\n📊  Storage Stats");
  console.log("-".repeat(40));
  console.log(`  Total files:        ${totalFiles.toLocaleString()}`);
  console.log(`  Total storage used: ${formatBytes(totalBytes)}`);

  if (perUser.length > 0) {
    console.log("\n  Top users by storage:");
    perUser.forEach((u, i) => {
      const bytes = u._sum.fileSize ?? 0;
      const count = u._count.slug   ?? 0;
      console.log(
        `    ${i + 1}. ${(u.userId ?? "anon").slice(0, 20).padEnd(20)} ` +
        `${formatBytes(bytes).padStart(10)}  (${count} files)`
      );
    });
  }
  console.log("");
}

// ─────────────────────────────────────────────────────────────
// Main cleanup
// ─────────────────────────────────────────────────────────────

async function cleanup(): Promise<void> {
  // Print stats before cleanup
  await printStorageStats();

  // Fetch expired shares
  const expired = await prisma.share.findMany({
    where: {
      expiresAt: { lt: beforeDate, not: null },
    },
    select: {
      slug:       true,
      type:       true,
      storageKey: true,
      fileName:   true,
      fileSize:   true,
      expiresAt:  true,
    },
    orderBy: { expiresAt: "asc" },
  });

  if (expired.length === 0) {
    console.log("✅  No expired shares found. Nothing to clean up.\n");
    return;
  }

  console.log(`🗑️   Found ${expired.length} expired share(s) to delete:\n`);

  // Print table
  const fileShares = expired.filter((s) => s.type === "FILE" && s.storageKey);
  const totalBytes = fileShares.reduce((acc, s) => acc + (s.fileSize ?? 0), 0);

  expired.forEach((s, i) => {
    const expiredAgo = s.expiresAt
      ? Math.round((Date.now() - s.expiresAt.getTime()) / 60_000)
      : 0;
    console.log(
      `  [${i + 1}] ${s.type.padEnd(4)} /${s.slug}` +
      (s.fileName ? `  ${s.fileName}` : "") +
      `  (expired ${expiredAgo}m ago)`
    );
  });

  console.log(`\n     ${fileShares.length} file object(s) to remove from R2 (${formatBytes(totalBytes)})`);

  if (isDryRun) {
    console.log("\n⚠️   DRY RUN — no changes made. Remove --dry-run to execute.\n");
    return;
  }

  console.log("\n🚀  Starting deletion…\n");

  // Delete R2 objects
  let r2Deleted = 0;
  const r2Errors: string[] = [];

  if (r2 && fileShares.length > 0) {
    const results = await Promise.allSettled(
      fileShares.map(async (s) => {
        await r2.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: s.storageKey! }));
        console.log(`  ✅ R2: ${s.storageKey}`);
        r2Deleted++;
      })
    );

    results.forEach((r, i) => {
      if (r.status === "rejected") {
        const msg = (r.reason as Error).message ?? String(r.reason);
        console.error(`  ❌ R2: ${fileShares[i].storageKey} — ${msg}`);
        r2Errors.push(msg);
      }
    });
  } else if (fileShares.length > 0) {
    console.warn("  ⚠️  R2 client not configured — skipping file deletion from storage");
  }

  // Batch delete from DB
  const slugs = expired.map((s) => s.slug);
  const { count } = await prisma.share.deleteMany({
    where: { slug: { in: slugs }, expiresAt: { lt: beforeDate, not: null } },
  });

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log(`✅  Cleanup complete!`);
  console.log(`    DB rows deleted:    ${count}`);
  console.log(`    R2 files deleted:   ${r2Deleted}/${fileShares.length}`);
  if (r2Errors.length > 0) {
    console.log(`    R2 errors:         ${r2Errors.length}`);
  }
  console.log("=".repeat(60) + "\n");
}

// ─────────────────────────────────────────────────────────────
// Utility
// ─────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / 1024 ** i).toFixed(1)} ${units[i]}`;
}

// ─────────────────────────────────────────────────────────────
// Run
// ─────────────────────────────────────────────────────────────

cleanup()
  .catch((e) => {
    console.error("\n❌  Fatal error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
