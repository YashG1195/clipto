// =============================================================
// src/lib/slug.ts — Slug Generation (SERVER ONLY)
// =============================================================
// ⚠️  This file imports Prisma — DO NOT import it in client components.
//     For pure utilities (formatFileSize, isValidSlug, getMimeTypeCategory)
//     import from "@/lib/utils" instead — that file is client-safe.
// =============================================================

import { customAlphabet } from "nanoid";
import { prisma } from "@/lib/prisma";

// Re-export pure utilities so existing server-side imports keep working
export { isValidSlug, formatFileSize, getMimeTypeCategory } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────
// Alphabet — 62 chars (a-z, A-Z, 0-9)
// Excludes special chars for clean, typeable URLs
// ─────────────────────────────────────────────────────────────
const ALPHABET   = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const MAX_RETRIES = 5;
const BASE_LENGTH = 6;

// ─────────────────────────────────────────────────────────────
// generateUniqueSlug()
//
// Generates a collision-free slug by:
//   1. Creating a nanoid candidate of `length` chars
//   2. Checking the Share table for an existing row
//   3. If taken → retry with length + 1
//   4. If all retries fail → throws
// ─────────────────────────────────────────────────────────────
export async function generateUniqueSlug(): Promise<string> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const length    = BASE_LENGTH + attempt;
    const nanoid    = customAlphabet(ALPHABET, length);
    const candidate = nanoid();

    const existing = await prisma.share.findUnique({
      where:  { slug: candidate },
      select: { slug: true },
    });

    if (!existing) return candidate;

    if (process.env.NODE_ENV === "development") {
      console.warn(
        `[slug] Collision on attempt ${attempt + 1}: "${candidate}" (len=${length}), retrying...`
      );
    }
  }

  throw new Error(
    `[slug] Failed to generate a unique slug after ${MAX_RETRIES} attempts. ` +
    `Database may be near capacity — consider increasing BASE_LENGTH.`
  );
}
