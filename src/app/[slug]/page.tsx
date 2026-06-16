// =============================================================
// src/app/[slug]/page.tsx — Slug Resolution Server Component
// =============================================================
// Handles all three share types from a single dynamic route.
//
// Resolution order for URL shares:
//   Redis cache (O(1)) → Prisma DB → notFound()
//
// For TEXT and FILE shares Prisma is always the source of truth
// (content can be large; we don't cache it in Redis).
//
// View count is incremented as a fire-and-forget DB update —
// it never blocks the response to the user.
// =============================================================

import { notFound, redirect } from "next/navigation";
import { Metadata } from "next";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { prisma }             from "@/lib/prisma";
import { r2, BUCKET }         from "@/lib/r2";
import { isValidSlug }        from "@/lib/slug";
import { getSlugFromCache, setSlugCacheUntil } from "@/lib/cache";
import { formatFileSize }     from "@/lib/slug";

import TextShareView  from "./TextShareView";
import FileShareView  from "./FileShareView";
import ExpiredView    from "./ExpiredView";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface PageProps {
  params: { slug: string };
}

// Fields we SELECT from Prisma — only what each type needs
type ShareRow = {
  slug:          string;
  type:          "TEXT" | "FILE" | "URL";
  content:       string | null;
  storageKey:    string | null;
  fileName:      string | null;
  fileSize:      number | null;
  mimeType:      string | null;
  confirmedAt:   Date   | null;
  expiresAt:     Date   | null;
  createdAt:     Date;
  downloadCount: number;
};

// ─────────────────────────────────────────────────────────────
// Data fetcher — separated for reuse in generateMetadata
// ─────────────────────────────────────────────────────────────

async function getShare(slug: string): Promise<ShareRow | null> {
  return prisma.share.findUnique({
    where: { slug },
    select: {
      slug:          true,
      type:          true,
      content:       true,
      storageKey:    true,
      fileName:      true,
      fileSize:      true,
      mimeType:      true,
      confirmedAt:   true,
      expiresAt:     true,
      createdAt:     true,
      downloadCount: true,
    },
  });
}

// ─────────────────────────────────────────────────────────────
// Fire-and-forget view count increment
// Never awaited — doesn't block the response
// ─────────────────────────────────────────────────────────────

function incrementViewCount(slug: string): void {
  prisma.share
    .update({
      where: { slug },
      data: { downloadCount: { increment: 1 } },
    })
    .catch((e) => console.warn("[slug] view count increment failed:", e));
}

// ─────────────────────────────────────────────────────────────
// generateMetadata — OG tags for link previews
// ─────────────────────────────────────────────────────────────

export async function generateMetadata(
  { params }: PageProps
): Promise<Metadata> {
  const appName = process.env.NEXT_PUBLIC_APP_NAME ?? "clipto";
  const appUrl  = process.env.NEXT_PUBLIC_APP_URL  ?? "http://localhost:3000";

  if (!isValidSlug(params.slug)) {
    return { title: `Not found · ${appName}` };
  }

  const share = await getShare(params.slug);
  if (!share) {
    return { title: `Not found · ${appName}` };
  }

  // Check expiry
  const expired = share.expiresAt && share.expiresAt < new Date();
  if (expired) {
    return { title: `Expired share · ${appName}` };
  }

  // Build type-specific metadata
  let title = appName;
  let description = "Shared via clipto — Internet shortcut for sharing anything.";

  switch (share.type) {
    case "TEXT":
      title = `Text share · ${appName}`;
      description = share.content
        ? share.content.slice(0, 160) + (share.content.length > 160 ? "…" : "")
        : description;
      break;

    case "FILE":
      title = share.fileName
        ? `${share.fileName} · ${appName}`
        : `File share · ${appName}`;
      description = share.fileName && share.fileSize
        ? `Download ${share.fileName} (${formatFileSize(share.fileSize)}) via ${appName}.`
        : description;
      break;

    case "URL":
      title = `Short link · ${appName}`;
      description = share.content
        ? `Short link → ${share.content}`
        : description;
      break;
  }

  const shareUrl = `${appUrl}/${share.slug}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: shareUrl,
      siteName: appName,
      type: "website",
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
    alternates: { canonical: shareUrl },
  };
}

// ─────────────────────────────────────────────────────────────
// Page — Server Component
// ─────────────────────────────────────────────────────────────

export default async function SlugPage({ params }: PageProps) {
  const { slug } = params;

  // ── Guard: validate slug format ────────────────────────────
  if (!isValidSlug(slug)) notFound();

  // ─────────────────────────────────────────────────────────
  // URL shares: try Redis cache first → fast redirect path
  // ─────────────────────────────────────────────────────────
  const cached = await getSlugFromCache(slug);
  if (cached) {
    // Cache hit — fire-and-forget view count, then redirect
    incrementViewCount(slug);
    // Cached URL shares are treated as permanent (301)
    redirect(cached);
  }

  // ── Fetch from DB ──────────────────────────────────────────
  const share = await getShare(slug);
  if (!share) notFound();

  // ── Check expiry ───────────────────────────────────────────
  const isExpired = share.expiresAt !== null && share.expiresAt < new Date();
  if (isExpired) {
    return <ExpiredView slug={slug} type={share.type} />;
  }

  // ── Increment view count (fire-and-forget) ─────────────────
  incrementViewCount(slug);

  // ─────────────────────────────────────────────────────────
  // Branch by share type
  // ─────────────────────────────────────────────────────────

  // ── URL ────────────────────────────────────────────────────
  if (share.type === "URL") {
    if (!share.content) notFound();

    // Warm up cache for future requests
    await setSlugCacheUntil(slug, share.content, share.expiresAt);

    // 301 for permanent (never-expiring), 302 for time-limited
    if (share.expiresAt === null) {
      redirect(share.content); // Next.js redirect = 307 by default; we use permanent below
    }
    // For expiring URLs, use a soft redirect rendered server-side
    // (Next.js redirect() always sends 307 — for true 301/302 use NextResponse)
    redirect(share.content);
  }

  // ── TEXT ───────────────────────────────────────────────────
  if (share.type === "TEXT") {
    if (!share.content) notFound();

    return (
      <TextShareView
        slug={slug}
        content={share.content}
        createdAt={share.createdAt.toISOString()}
        expiresAt={share.expiresAt?.toISOString() ?? null}
        downloadCount={share.downloadCount}
      />
    );
  }

  // ── FILE ───────────────────────────────────────────────────
  if (share.type === "FILE") {
    // A FILE share must be confirmed before it's publicly accessible
    if (!share.confirmedAt) {
      // Upload never completed — treat as not found
      notFound();
    }
    if (!share.storageKey) notFound();

    // Generate a short-lived presigned GET URL (5 minutes)
    let downloadUrl: string;
    try {
      const command = new GetObjectCommand({
        Bucket: BUCKET,
        Key:    share.storageKey,
        // ResponseContentDisposition forces browser to download, not preview
        ResponseContentDisposition: `attachment; filename="${encodeURIComponent(share.fileName ?? "file")}"`,
      });
      downloadUrl = await getSignedUrl(r2, command, { expiresIn: 300 });
    } catch (e) {
      console.error("[slug] R2 presign error:", e);
      // Don't 500 — show the file card without a working download link
      downloadUrl = "";
    }

    return (
      <FileShareView
        slug={slug}
        fileName={share.fileName ?? "Unknown file"}
        fileSize={share.fileSize ?? 0}
        mimeType={share.mimeType ?? "application/octet-stream"}
        downloadUrl={downloadUrl}
        createdAt={share.createdAt.toISOString()}
        expiresAt={share.expiresAt?.toISOString() ?? null}
        downloadCount={share.downloadCount}
      />
    );
  }

  // Fallback (should never reach here)
  notFound();
}

// ─────────────────────────────────────────────────────────────
// Route segment config
// - dynamic = "force-dynamic" so every request is fresh
//   (no stale redirects or cached expired content)
// ─────────────────────────────────────────────────────────────

export const dynamic = "force-dynamic";
export const revalidate = 0;
