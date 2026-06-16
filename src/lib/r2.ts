// =============================================================
// src/lib/r2.ts — Cloudflare R2 S3Client Singleton
// =============================================================
// Configures an AWS S3Client pointed at Cloudflare R2's
// S3-compatible API endpoint. R2 uses the same SDK as S3
// but needs a custom endpoint + auth from CF env vars.
//
// Usage:
//   import { r2, BUCKET } from "@/lib/r2"
//   await r2.send(new PutObjectCommand({ Bucket: BUCKET, ... }))
// =============================================================

import { S3Client } from "@aws-sdk/client-s3";

// ─────────────────────────────────────────────────────────────
// Validate required env vars at module load time
// Fails fast in dev rather than silently at request time
// ─────────────────────────────────────────────────────────────

function requireR2Env(name: string): string {
  const val = process.env[name];
  if (!val || val.startsWith("placeholder") || val.startsWith("your-")) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(`[r2] Missing required env var: ${name}`);
    }
    // In dev, warn but don't crash — routes will handle the missing client
    console.warn(`[r2] ${name} is not set — R2 operations will fail.`);
    return "";
  }
  return val;
}

const ACCOUNT_ID  = requireR2Env("CLOUDFLARE_ACCOUNT_ID");
const ACCESS_KEY  = requireR2Env("CLOUDFLARE_R2_ACCESS_KEY");
const SECRET_KEY  = requireR2Env("CLOUDFLARE_R2_SECRET_KEY");

// ─────────────────────────────────────────────────────────────
// R2 S3Client singleton
// Endpoint format: https://<account-id>.r2.cloudflarestorage.com
// Region must be "auto" for R2 (CF ignores the value but SDK needs one)
// ─────────────────────────────────────────────────────────────

export const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId:     ACCESS_KEY,
    secretAccessKey: SECRET_KEY,
  },
  // R2 doesn't support path-style URLs — force virtual-hosted-style
  forcePathStyle: false,
});

// Bucket name — used in every R2 command
export const BUCKET = process.env.CLOUDFLARE_R2_BUCKET_NAME ?? "clipto-files";

// Public CDN URL base (optional — used to construct public file URLs)
// Only set if you've enabled R2 public access or connected a custom domain
export const R2_PUBLIC_URL = process.env.CLOUDFLARE_R2_PUBLIC_URL ?? "";

// ─────────────────────────────────────────────────────────────
// getPublicFileUrl(storageKey)
//
// Returns the public CDN URL for a file if R2_PUBLIC_URL is set,
// otherwise returns null (caller should generate a presigned URL instead)
// ─────────────────────────────────────────────────────────────

export function getPublicFileUrl(storageKey: string): string | null {
  if (!R2_PUBLIC_URL) return null;
  return `${R2_PUBLIC_URL.replace(/\/$/, "")}/${storageKey}`;
}
