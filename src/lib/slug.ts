// =============================================================
// src/lib/slug.ts — Slug Generation & Validation Utilities
// =============================================================
// Uses nanoid to create short, collision-safe URL slugs.
// The alphabet is restricted to alphanumeric chars only —
// no hyphens, underscores, or special chars — so slugs are
// safe in URLs, easy to type, and visually unambiguous.
// =============================================================

import { customAlphabet } from "nanoid";
import { prisma } from "@/lib/prisma";

// ─────────────────────────────────────────────────────────────
// Alphabet — 62 chars (a-z, A-Z, 0-9)
// Excludes: - _ ~ . special chars for clean URLs
// ─────────────────────────────────────────────────────────────
const ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

// Maximum number of retry attempts before giving up
const MAX_RETRIES = 5;

// Starting slug length — grows on each collision
const BASE_LENGTH = 6;

// ─────────────────────────────────────────────────────────────
// generateUniqueSlug()
//
// Generates a collision-free slug by:
//   1. Creating a nanoid candidate of `length` chars
//   2. Checking the Share table for an existing row with that slug
//   3. If taken → retry with length + 1 (reduces collision probability)
//   4. If all MAX_RETRIES fail → throws (this should never happen in practice)
// ─────────────────────────────────────────────────────────────
export async function generateUniqueSlug(): Promise<string> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    // Increase length on each retry: 6 → 7 → 8 → 9 → 10
    const length = BASE_LENGTH + attempt;
    const nanoid = customAlphabet(ALPHABET, length);
    const candidate = nanoid();

    // Check for collision in the database
    const existing = await prisma.share.findUnique({
      where: { slug: candidate },
      select: { slug: true }, // Only fetch slug — minimal data transfer
    });

    if (!existing) {
      // No collision — this slug is safe to use
      return candidate;
    }

    // Collision found — log in dev for monitoring
    if (process.env.NODE_ENV === "development") {
      console.warn(
        `[slug] Collision on attempt ${attempt + 1}: "${candidate}" (len=${length}), retrying...`
      );
    }
  }

  // Exhausted all retries — this is astronomically unlikely in practice:
  // At 6 chars with 62^6 = ~56 billion combinations, collisions are
  // effectively impossible until the table has tens of millions of rows.
  throw new Error(
    `[slug] Failed to generate a unique slug after ${MAX_RETRIES} attempts. ` +
      `Database may be near capacity — consider increasing BASE_LENGTH.`
  );
}

// ─────────────────────────────────────────────────────────────
// isValidSlug(slug)
//
// Validates that a slug is safe to accept from URL params.
// Rules:
//   - Only alphanumeric characters (a-z, A-Z, 0-9)
//   - Length between 4 and 12 characters
//   - No spaces, special chars, or unicode
//
// Use this in route handlers before hitting the DB:
//   if (!isValidSlug(params.slug)) return notFound()
// ─────────────────────────────────────────────────────────────
export function isValidSlug(slug: string): boolean {
  if (!slug || typeof slug !== "string") return false;
  // ^[a-zA-Z0-9]{4,12}$ — strict alphanumeric, 4–12 chars
  return /^[a-zA-Z0-9]{4,12}$/.test(slug);
}

// =============================================================
// formatFileSize(bytes)
//
// Converts a raw byte count into a human-readable string.
//
// Examples:
//   formatFileSize(892)          → "892 B"
//   formatFileSize(45056)        → "44.0 KB"
//   formatFileSize(2411724)      → "2.3 MB"
//   formatFileSize(104857600)    → "100.0 MB"
//
// Uses 1024-based units (KiB/MiB) but labels them KB/MB
// to match user expectations (same as macOS Finder, Windows).
// =============================================================
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";

  const units = ["B", "KB", "MB", "GB"] as const;
  const thresholds = [1, 1024, 1024 * 1024, 1024 * 1024 * 1024] as const;

  // Find the largest unit where bytes >= threshold
  let unitIndex = 0;
  for (let i = units.length - 1; i >= 0; i--) {
    if (bytes >= thresholds[i]) {
      unitIndex = i;
      break;
    }
  }

  if (unitIndex === 0) {
    // Bytes — no decimal places needed
    return `${bytes} B`;
  }

  const value = bytes / thresholds[unitIndex];
  // 1 decimal place for KB/MB/GB
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

// ─────────────────────────────────────────────────────────────
// getMimeTypeCategory(mimeType)
//
// Returns a simple category label for a MIME type.
// Used for rendering appropriate icons and labels in the UI.
// ─────────────────────────────────────────────────────────────
export function getMimeTypeCategory(
  mimeType: string | null | undefined
): "image" | "video" | "audio" | "pdf" | "code" | "archive" | "document" | "file" {
  if (!mimeType) return "file";

  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType === "application/pdf") return "pdf";
  if (
    mimeType.startsWith("text/") ||
    mimeType.includes("javascript") ||
    mimeType.includes("json") ||
    mimeType.includes("xml")
  )
    return "code";
  if (
    mimeType.includes("zip") ||
    mimeType.includes("tar") ||
    mimeType.includes("gzip") ||
    mimeType.includes("rar") ||
    mimeType.includes("7z")
  )
    return "archive";
  if (
    mimeType.includes("word") ||
    mimeType.includes("spreadsheet") ||
    mimeType.includes("presentation") ||
    mimeType.includes("opendocument")
  )
    return "document";

  return "file";
}
