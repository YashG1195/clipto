// =============================================================
// src/lib/env.ts — Environment Variable Validation
// =============================================================
// Validates all required env vars at app startup.
// Throws a clear, descriptive error immediately if anything
// is missing — far better than a cryptic "undefined" crash
// deep inside a route handler.
//
// Usage: import { env } from "@/lib/env"
//        env.DATABASE_URL  ← fully typed, never undefined
// =============================================================

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(
      `\n\n❌  Missing required environment variable: "${name}"\n` +
        `    → Check your .env.local file and make sure "${name}" is set.\n` +
        `    → See .env.example for documentation on where to get this value.\n`
    );
  }
  return value;
}

function optionalEnv(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

// =============================================================
// Validated environment — import this object everywhere
// instead of accessing process.env directly
// =============================================================

export const env = {
  // ── Database ──────────────────────────────────────────────
  DATABASE_URL: requireEnv("DATABASE_URL"),
  DIRECT_URL: optionalEnv("DIRECT_URL"),         // Optional: Neon direct URL for migrations

  // ── Cloudflare R2 Storage ─────────────────────────────────
  CLOUDFLARE_ACCOUNT_ID: requireEnv("CLOUDFLARE_ACCOUNT_ID"),
  CLOUDFLARE_R2_ACCESS_KEY: requireEnv("CLOUDFLARE_R2_ACCESS_KEY"),
  CLOUDFLARE_R2_SECRET_KEY: requireEnv("CLOUDFLARE_R2_SECRET_KEY"),
  CLOUDFLARE_R2_BUCKET_NAME: requireEnv("CLOUDFLARE_R2_BUCKET_NAME"),
  CLOUDFLARE_R2_PUBLIC_URL: optionalEnv("CLOUDFLARE_R2_PUBLIC_URL"), // Optional CDN URL

  // ── Redis / Upstash ───────────────────────────────────────
  UPSTASH_REDIS_REST_URL: requireEnv("UPSTASH_REDIS_REST_URL"),
  UPSTASH_REDIS_REST_TOKEN: requireEnv("UPSTASH_REDIS_REST_TOKEN"),

  // ── Clerk Auth ────────────────────────────────────────────
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: requireEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"),
  CLERK_SECRET_KEY: requireEnv("CLERK_SECRET_KEY"),

  // ── App ───────────────────────────────────────────────────
  NEXT_PUBLIC_APP_URL: optionalEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000"),

  // ── Rate Limiting ─────────────────────────────────────────
  RATE_LIMIT_MAX: parseInt(optionalEnv("RATE_LIMIT_MAX", "10"), 10),
  RATE_LIMIT_WINDOW_SECONDS: parseInt(optionalEnv("RATE_LIMIT_WINDOW", "60"), 10),
} as const;

// =============================================================
// Type export — useful for typed function signatures
// =============================================================
export type Env = typeof env;
