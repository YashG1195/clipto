<div align="center">

<h1>📎 clipto</h1>
<p><strong>Internet shortcut for sharing anything — instantly.</strong></p>
<p>Share text snippets, files up to 100 MB, and short links with a single click. No sign-up required.</p>

[![Next.js](https://img.shields.io/badge/Next.js-14-black?logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3-38bdf8?logo=tailwindcss)](https://tailwindcss.com)
[![Prisma](https://img.shields.io/badge/Prisma-7-2d3748?logo=prisma)](https://prisma.io)
[![Cloudflare R2](https://img.shields.io/badge/Cloudflare-R2-F38020?logo=cloudflare)](https://cloudflare.com)
[![Upstash](https://img.shields.io/badge/Upstash-Redis-00E9A3?logo=redis)](https://upstash.com)

</div>

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 📄 **Text Sharing** | Share code snippets, notes, or any text up to 100,000 characters |
| 📁 **File Sharing** | Upload and share files up to 100 MB — images, docs, archives, video, audio |
| 🔗 **URL Shortener** | Turn any long URL into a clean short link |
| ⏳ **Expiry Control** | Links expire in 1h / 24h / 7d or never |
| 🔒 **Private by Design** | No indexing, hashed IPs, short-lived presigned URLs |
| 📊 **Dashboard** | Manage all your shares — view, copy, delete |
| ⚡ **Edge Rate Limiting** | Upstash Redis sliding window at the CDN edge |
| 🤖 **Auto Cleanup** | Vercel Cron deletes expired shares + R2 objects every hour |
| 📱 **QR Codes** | Every share gets a scannable QR code |
| 🌍 **Global CDN** | Cloudflare R2 + Vercel Edge Network |

---

## 🛠 Tech Stack

### Frontend
| Technology | Version | Purpose |
|------------|---------|---------|
| **Next.js** | 14 (App Router) | Full-stack React framework |
| **TypeScript** | 5 | Type safety across the entire codebase |
| **Tailwind CSS** | 3 | Utility-first styling |
| **react-dropzone** | 15 | Drag-and-drop file upload UI |
| **next-qrcode** | 2 | QR code generation for share links |
| **lucide-react** | latest | Icon library |
| **Geist Font** | — | Typography (Next.js built-in) |

### Backend & API
| Technology | Version | Purpose |
|------------|---------|---------|
| **Next.js Route Handlers** | 14 | REST API endpoints (App Router) |
| **Next.js Middleware** | Edge Runtime | Rate limiting + slug validation at CDN edge |
| **Prisma ORM** | 7 | Type-safe database access + migrations |
| **nanoid** | 5 | Collision-resistant 6-char slug generation |

### Infrastructure & Services
| Service | Purpose |
|---------|---------|
| **Neon PostgreSQL** | Serverless Postgres — stores all share metadata |
| **Cloudflare R2** | S3-compatible object storage — stores uploaded files |
| **Upstash Redis** | Serverless Redis — rate limiting + slug cache (O(1) redirects) |
| **Clerk** | Authentication — sign-in/sign-up, user sessions |
| **Vercel** | Hosting, Edge Functions, Cron Jobs |

### AWS SDK (for R2)
| Package | Purpose |
|---------|---------|
| `@aws-sdk/client-s3` | S3-compatible commands for Cloudflare R2 |
| `@aws-sdk/s3-request-presigner` | Presigned PUT/GET URL generation |

### Upstash SDK
| Package | Purpose |
|---------|---------|
| `@upstash/redis` | Redis client (REST-based, Edge-compatible) |
| `@upstash/ratelimit` | Sliding window rate limiting |

---

## 📁 Project Structure

```
clipto/
├── prisma/
│   └── schema.prisma          # Share model with all fields
├── scripts/
│   └── cleanup.ts             # Local CLI cleanup utility
├── src/
│   ├── app/
│   │   ├── _components/       # Shared UI components
│   │   │   ├── ExpirySelector.tsx
│   │   │   ├── FileTab.tsx
│   │   │   ├── ResultCard.tsx
│   │   │   ├── TextTab.tsx
│   │   │   └── UrlTab.tsx
│   │   ├── [slug]/            # Dynamic share resolution page
│   │   │   ├── page.tsx       # Server component — Redis → DB → render
│   │   │   ├── TextShareView.tsx
│   │   │   ├── FileShareView.tsx
│   │   │   └── ExpiredView.tsx
│   │   ├── api/
│   │   │   ├── share/
│   │   │   │   ├── text/route.ts        # POST — create text share
│   │   │   │   ├── file/route.ts        # POST — request presigned upload URL
│   │   │   │   ├── file/complete/route.ts # POST — confirm R2 upload
│   │   │   │   └── [slug]/route.ts      # DELETE — remove a share
│   │   │   ├── shorten/route.ts         # POST — URL shortener
│   │   │   └── cron/cleanup/route.ts    # GET — hourly expired share cleanup
│   │   ├── dashboard/
│   │   │   ├── page.tsx       # Protected dashboard (Clerk)
│   │   │   └── SharesTable.tsx
│   │   ├── layout.tsx
│   │   └── page.tsx           # Homepage with 3-tab UI
│   ├── lib/
│   │   ├── cache.ts           # Upstash Redis helpers (get/set/delete)
│   │   ├── env.ts             # Startup env var validation
│   │   ├── prisma.ts          # Prisma singleton (hot-reload safe)
│   │   ├── r2.ts              # Cloudflare R2 S3Client singleton
│   │   ├── ratelimit.ts       # Upstash rate limiter + IP hashing
│   │   ├── slug.ts            # generateUniqueSlug() — server-only
│   │   └── utils.ts           # Pure client-safe utilities
│   └── types/
│       └── api.ts             # TypeScript API request/response types
├── middleware.ts              # Edge middleware — rate limiting + slug validation
├── vercel.json                # Vercel Cron config (every hour)
└── .env.example               # Environment variable documentation
```

---

## 🔄 How It Works

### Text Sharing
```
User types text → POST /api/share/text
  → Rate limit (10/hr) → Validate (max 100K chars)
  → Generate slug → Save to Neon DB
  → Return { slug, url }
```

### File Sharing (2-step upload)
```
User drops file → POST /api/share/file
  → Rate limit (5/hr) → Validate (max 100MB, MIME type)
  → Generate slug + storageKey → Create pending DB row
  → Return presigned PUT URL (10 min)
  
Client PUTs file directly to R2 (bypasses our server!)
  
Client → POST /api/share/file/complete
  → HeadObjectCommand verifies file exists in R2
  → Stamp confirmedAt → Share is now live
```

### URL Shortening
```
User pastes URL → POST /api/shorten
  → Rate limit (20/hr) → Validate URL (protocol, private IP, loop check)
  → Generate slug → Save to DB → Cache in Redis (with TTL)
  → Return { slug, shortUrl }

Visitor hits /:slug
  → Redis cache hit? → redirect instantly (O(1))
  → Cache miss? → DB lookup → cache warm-up → redirect
```

---

## 🐛 Problems Solved During Development

### 1. Prisma Browser Bundle Crash
**Error:** `Module not found: Can't resolve '.prisma/client/index-browser'`

**Root cause:** `slug.ts` imported Prisma at module level. Client components (`FileTab.tsx`, `FileShareView.tsx`) imported utility functions from `slug.ts`, accidentally dragging the entire Node.js-only Prisma client into the browser bundle.

**Fix:** Split `slug.ts` into two files:
- `utils.ts` — pure functions with zero server imports (client-safe ✅)
- `slug.ts` — server-only, keeps Prisma import, re-exports from `utils.ts`

---

### 2. Prisma Hot-Reload Connection Exhaustion
**Error:** `Too many Prisma clients` / connection pool exhausted in dev mode

**Root cause:** Next.js hot-reload creates a new module instance on every file save, spawning a new `PrismaClient` each time and exhausting the database connection pool.

**Fix:** Singleton pattern in `lib/prisma.ts` that stores the client on the `global` object — survives hot-reloads without creating duplicate connections.

---

### 3. Fake Upload Confirmation (Security)
**Problem:** Without server-side verification, anyone could call `POST /api/share/file/complete` with any slug and mark a pending upload as confirmed — without ever uploading a file.

**Fix:** The `/complete` route uses `HeadObjectCommand` to verify the file actually exists in R2 before stamping `confirmedAt`. Fake confirmations always fail.

---

### 4. URL Shortener Redirect Loops
**Problem:** Shortening a clipto URL itself would create an infinite redirect loop (e.g. `clipto.io/abc` → `clipto.io/xyz` → `clipto.io/abc` → ...).

**Fix:** The URL validator blocks our own hostnames (`kuick.io`, `clipto.vercel.app`, `localhost`) before creating a short link.

---

### 5. SSRF via Private IP URLs
**Problem:** Malicious users could shorten `http://192.168.1.1/admin` or `http://169.254.169.254/` (AWS metadata endpoint) to probe internal infrastructure.

**Fix:** URL validator blocks all RFC-1918 private ranges, loopback addresses, and link-local IPs using regex patterns before any DB/network operation.

---

### 6. Race Condition in Slug Generation
**Problem:** Two concurrent requests could theoretically generate the same slug and both try to insert it, causing a unique constraint violation.

**Fix:** Collision-retry loop in `generateUniqueSlug()` — checks the DB before returning a slug, retries up to 5 times with increasing length (6→7→8 chars). The Prisma `@unique` constraint on `slug` also acts as a final safety net.

---

### 7. Redis Failure Blocking Requests
**Problem:** If Upstash Redis is down, the rate limiter and cache would throw and crash every request.

**Fix:** Both `cache.ts` and `ratelimit.ts` wrap all Redis calls in try/catch and return graceful fallbacks (`null` / `{ allowed: true }`). Redis failure is always non-fatal — logged but never user-visible.

---

### 8. Stale Expired Shares Being Served
**Problem:** Expired file shares could still be accessed if their presigned URLs were cached or the DB wasn't checked.

**Fix:** 
- Slug resolver (`/[slug]/page.tsx`) checks `expiresAt < now` on every request
- Route is `force-dynamic` with `revalidate = 0` — no caching whatsoever
- Hourly Vercel Cron job physically deletes expired rows from DB + R2 + Redis

---

### 9. Orphaned R2 Objects on Delete Failure
**Problem:** If the DB delete succeeded but the R2 delete failed, the file object would remain in storage forever with no reference.

**Fix:** In both the DELETE route and the cron cleanup, R2 errors are logged but non-blocking — the DB row is always deleted. Orphaned R2 objects are a safe, auditable side-effect (easily swept with a follow-up job).

---

### 10. Git Push Branch Mismatch (master → main)
**Problem:** The local branch was `master` but GitHub repo expected `main`, causing push rejections.

**Fix:** Renamed local branch with `git branch -m master main` and set upstream tracking with `git push -u origin main`.

---

## 🚀 Getting Started

### Prerequisites
- Node.js 20+
- A [Neon](https://neon.tech) PostgreSQL database
- A [Cloudflare R2](https://cloudflare.com) bucket
- An [Upstash](https://upstash.com) Redis database
- A [Clerk](https://clerk.com) application

### Local Setup

```bash
# Clone the repo
git clone https://github.com/YashG1195/clipto.git
cd clipto

# Install dependencies
npm install

# Copy env template
cp .env.example .env.local
# Fill in your real values in .env.local

# Run DB migrations
npx prisma migrate dev

# Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) 🎉

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | Neon pooled connection string |
| `DIRECT_URL` | ✅ | Neon direct URL (for migrations) |
| `CLOUDFLARE_ACCOUNT_ID` | ✅ | Cloudflare account ID |
| `CLOUDFLARE_R2_ACCESS_KEY` | ✅ | R2 API access key |
| `CLOUDFLARE_R2_SECRET_KEY` | ✅ | R2 API secret key |
| `CLOUDFLARE_R2_BUCKET_NAME` | ✅ | R2 bucket name |
| `CLOUDFLARE_R2_PUBLIC_URL` | ❌ | CDN URL if public access enabled |
| `UPSTASH_REDIS_REST_URL` | ✅ | Upstash Redis REST endpoint |
| `UPSTASH_REDIS_REST_TOKEN` | ✅ | Upstash Redis token |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | ✅ | Clerk publishable key |
| `CLERK_SECRET_KEY` | ✅ | Clerk secret key |
| `NEXT_PUBLIC_APP_URL` | ✅ | Your app's public URL |
| `CRON_SECRET` | ✅ | Bearer token for cron endpoint |

### Useful Scripts

```bash
npm run dev          # Start development server
npm run build        # Build for production (runs prisma migrate deploy first)
npm run db:studio    # Open Prisma Studio (DB GUI)
npm run db:migrate   # Create + apply a new migration
npm run cleanup      # Run expired share cleanup locally
npm run cleanup:dry  # Preview cleanup without deleting
```

---

## 📦 API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/share/text` | Create a text share |
| `POST` | `/api/share/file` | Request presigned upload URL |
| `POST` | `/api/share/file/complete` | Confirm file upload |
| `DELETE` | `/api/share/[slug]` | Delete a share (auth required) |
| `POST` | `/api/shorten` | Shorten a URL |
| `GET` | `/api/cron/cleanup` | Delete expired shares (cron) |
| `GET` | `/[slug]` | Resolve a share (redirect/view/download) |

---

## 🔐 Security

- **No raw IPs stored** — all IPs are SHA-256 hashed before DB insertion
- **Presigned URLs** — files are never proxied through our server; clients upload/download directly to R2
- **Short-lived download links** — presigned GET URLs expire in 5 minutes
- **Rate limiting** — sliding window at the edge (Upstash) per IP per endpoint
- **Auth on mutations** — DELETE requires Clerk session; ownership is verified before deletion
- **CORS locked** — R2 bucket only accepts PUT from your Vercel domain

---

## 📄 License

MIT — feel free to fork, learn from, and build on top of clipto.

---

<div align="center">
  Built with ❤️ using Next.js · Cloudflare R2 · Upstash · Neon · Clerk
</div>
