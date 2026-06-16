// =============================================================
// src/types/api.ts — Shared API TypeScript Types
// Used across all route handlers and client-side fetch calls
// =============================================================

// ─────────────────────────────────────────────────────────────
// Share Types
// ─────────────────────────────────────────────────────────────

export type ShareType = "TEXT" | "FILE" | "URL";

export type ExpiresIn = "1h" | "24h" | "7d" | "never";

// ─────────────────────────────────────────────────────────────
// API Response Types
// ─────────────────────────────────────────────────────────────

/** Returned on successful share creation */
export interface ShareResponse {
  slug: string;
  url: string;
  type: ShareType;
  expiresAt: string | null; // ISO 8601 string or null
  createdAt: string;        // ISO 8601 string
}

/** Returned on any API error */
export interface ErrorResponse {
  error: string;       // Human-readable message safe to show in UI
  code?: string;       // Machine-readable code e.g. "RATE_LIMITED", "VALIDATION_ERROR"
  details?: string;    // Extra context (dev mode only)
}

/** Union for typed fetch results */
export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ErrorResponse; status: number };

// ─────────────────────────────────────────────────────────────
// Request Body Types — mirror exactly what routes expect
// ─────────────────────────────────────────────────────────────

export interface TextShareRequest {
  content: string;
  expiresIn?: ExpiresIn;
}

export interface FileShareRequest {
  fileName: string;
  fileSize: number;
  mimeType: string;
  expiresIn?: ExpiresIn;
}

export interface UrlShareRequest {
  url: string;
  expiresIn?: ExpiresIn;
}

// ─────────────────────────────────────────────────────────────
// View/Resolve Types — returned when fetching a share by slug
// ─────────────────────────────────────────────────────────────

export interface TextShareView {
  type: "TEXT";
  slug: string;
  content: string;
  createdAt: string;
  expiresAt: string | null;
  downloadCount: number;
}

export interface FileShareView {
  type: "FILE";
  slug: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  downloadUrl: string;   // Presigned URL (short-lived)
  createdAt: string;
  expiresAt: string | null;
  downloadCount: number;
}

export interface UrlShareView {
  type: "URL";
  slug: string;
  destination: string;
  createdAt: string;
  expiresAt: string | null;
  downloadCount: number;
}

export type ShareView = TextShareView | FileShareView | UrlShareView;

// ─────────────────────────────────────────────────────────────
// File Upload — presigned URL flow
// ─────────────────────────────────────────────────────────────

export interface PresignedUploadResponse {
  uploadUrl: string;   // PUT directly to R2/S3
  storageKey: string;  // Object key — send back in /confirm
  slug: string;
  url: string;
}

// ─────────────────────────────────────────────────────────────
// Sharings list (dashboard)
// ─────────────────────────────────────────────────────────────

export interface ShareListItem {
  slug: string;
  type: ShareType;
  url: string;
  label: string;          // Truncated content / fileName / destination
  createdAt: string;
  expiresAt: string | null;
  downloadCount: number;
}
