// =============================================================
// src/lib/utils.ts — Pure Client-Safe Utility Functions
// =============================================================
// ⚠️  NO server-only imports here (no Prisma, no fs, no crypto)
// This file is imported by both server AND client components.
//
// Server-only utilities (generateUniqueSlug, etc.) stay in slug.ts
// =============================================================

// ─────────────────────────────────────────────────────────────
// isValidSlug(slug)
//
// Validates that a slug is safe to accept from URL params.
// Rules:
//   - Only alphanumeric characters (a-z, A-Z, 0-9)
//   - Length between 4 and 12 characters
//   - No spaces, special chars, or unicode
// ─────────────────────────────────────────────────────────────
export function isValidSlug(slug: string): boolean {
  if (!slug || typeof slug !== "string") return false;
  return /^[a-zA-Z0-9]{4,12}$/.test(slug);
}

// ─────────────────────────────────────────────────────────────
// formatFileSize(bytes)
//
// Converts a raw byte count into a human-readable string.
//
// Examples:
//   formatFileSize(892)       → "892 B"
//   formatFileSize(45056)     → "44.0 KB"
//   formatFileSize(2411724)   → "2.3 MB"
//   formatFileSize(104857600) → "100.0 MB"
// ─────────────────────────────────────────────────────────────
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";

  const units     = ["B", "KB", "MB", "GB"] as const;
  const thresholds = [1, 1024, 1024 * 1024, 1024 * 1024 * 1024] as const;

  let unitIndex = 0;
  for (let i = units.length - 1; i >= 0; i--) {
    if (bytes >= thresholds[i]) { unitIndex = i; break; }
  }

  if (unitIndex === 0) return `${bytes} B`;

  const value = bytes / thresholds[unitIndex];
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
  ) return "code";
  if (
    mimeType.includes("zip") || mimeType.includes("tar") ||
    mimeType.includes("gzip") || mimeType.includes("rar") ||
    mimeType.includes("7z")
  ) return "archive";
  if (
    mimeType.includes("word") || mimeType.includes("spreadsheet") ||
    mimeType.includes("presentation") || mimeType.includes("opendocument")
  ) return "document";
  return "file";
}
