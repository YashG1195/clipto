// =============================================================
// src/lib/cache.ts — Upstash Redis Cache Helpers
// =============================================================
// Thin wrapper around @upstash/redis for slug caching.
// All operations fail gracefully — a cache miss just means
// we fall through to the database, never crash the request.
//
// Key namespace: "clipto:slug:<slug>" → original URL / content
// TTL mirrors the share's expiresAt so cache auto-expires.
// =============================================================

import { Redis } from "@upstash/redis";

// ─────────────────────────────────────────────────────────────
// Redis singleton — lazily initialised to avoid crashing when
// env vars are missing in local dev without Upstash
// ─────────────────────────────────────────────────────────────

let redis: Redis | null = null;

function getRedis(): Redis | null {
  if (redis) return redis;

  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (
    !url || !token ||
    url.includes("placeholder") ||
    token.includes("placeholder")
  ) {
    if (process.env.NODE_ENV === "development") {
      console.warn(
        "[cache] Upstash Redis env vars not set — slug caching DISABLED. " +
        "Requests will always hit the database."
      );
    }
    return null;
  }

  redis = new Redis({ url, token });
  return redis;
}

// ─────────────────────────────────────────────────────────────
// Key builder — all cache keys live under a single namespace
// so it's easy to flush all clipto keys if needed
// ─────────────────────────────────────────────────────────────

const PREFIX = "clipto:slug:";

function buildKey(slug: string): string {
  return `${PREFIX}${slug}`;
}

// ─────────────────────────────────────────────────────────────
// getSlugFromCache(slug)
//
// Returns the cached value for a slug (URL destination, text
// content preview, or file metadata JSON), or null on miss/error.
//
// Always returns null instead of throwing so callers can
// transparently fall through to the DB.
// ─────────────────────────────────────────────────────────────

export async function getSlugFromCache(slug: string): Promise<string | null> {
  const client = getRedis();
  if (!client) return null;

  try {
    const value = await client.get<string>(buildKey(slug));
    return value ?? null;
  } catch (e) {
    // Cache failure is non-fatal — log and fall through to DB
    console.warn(`[cache] GET failed for slug "${slug}":`, e);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// setSlugCache(slug, value, ttlSeconds?)
//
// Stores a value for a slug with an optional TTL.
// If ttlSeconds is undefined or 0, the key never expires
// (use for "never" expiry shares).
//
// Returns true on success, false on failure (non-fatal).
// ─────────────────────────────────────────────────────────────

export async function setSlugCache(
  slug: string,
  value: string,
  ttlSeconds?: number
): Promise<boolean> {
  const client = getRedis();
  if (!client) return false;

  try {
    const key = buildKey(slug);

    if (ttlSeconds && ttlSeconds > 0) {
      // EX sets expiry in seconds
      await client.set(key, value, { ex: ttlSeconds });
    } else {
      // No TTL — persists until manually deleted or Redis eviction
      await client.set(key, value);
    }

    return true;
  } catch (e) {
    console.warn(`[cache] SET failed for slug "${slug}":`, e);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────
// deleteSlugCache(slug)
//
// Removes a slug from the cache — used when a share is deleted
// or manually invalidated.
//
// Returns true on success, false on failure (non-fatal).
// ─────────────────────────────────────────────────────────────

export async function deleteSlugCache(slug: string): Promise<boolean> {
  const client = getRedis();
  if (!client) return false;

  try {
    await client.del(buildKey(slug));
    return true;
  } catch (e) {
    console.warn(`[cache] DEL failed for slug "${slug}":`, e);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────
// setSlugCacheUntil(slug, value, expiresAt)
//
// Convenience wrapper — computes TTL from an absolute Date
// and calls setSlugCache. Handles null (never-expiring) shares.
// ─────────────────────────────────────────────────────────────

export async function setSlugCacheUntil(
  slug: string,
  value: string,
  expiresAt: Date | null
): Promise<boolean> {
  if (!expiresAt) {
    // Never-expiring share — cache without TTL
    return setSlugCache(slug, value);
  }

  const ttlMs = expiresAt.getTime() - Date.now();
  if (ttlMs <= 0) {
    // Already expired — don't cache
    return false;
  }

  const ttlSeconds = Math.ceil(ttlMs / 1000);
  return setSlugCache(slug, value, ttlSeconds);
}
