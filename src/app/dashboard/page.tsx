// =============================================================
// src/app/dashboard/page.tsx — Authenticated Dashboard
// =============================================================
// Server component — protected by Clerk auth().
// Fetches all shares for the current user and renders:
//   - Stats bar: total shares, total views, storage used
//   - SharesTable: sortable list with optimistic delete
// =============================================================

import { auth, currentUser } from "@clerk/nextjs";
import { redirect }          from "next/navigation";
import { BarChart2, Eye, HardDrive, Plus } from "lucide-react";
import { prisma }       from "@/lib/prisma";
import { formatFileSize } from "@/lib/slug";
import SharesTable, { type ShareRow } from "./SharesTable";
import type { Metadata } from "next";

// ─────────────────────────────────────────────────────────────
// Metadata
// ─────────────────────────────────────────────────────────────

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Manage all your clipto shares in one place.",
};

export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────
// Stat card sub-component
// ─────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon:  React.ElementType;
  label: string;
  value: string;
  sub?:  string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-black/5 shadow-sm px-5 py-4 flex items-center gap-4">
      <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center shrink-0">
        <Icon size={18} className="text-[#f5956d]" />
      </div>
      <div>
        <p className="text-xs text-gray-400 font-medium">{label}</p>
        <p className="text-xl font-bold text-gray-900 leading-tight">{value}</p>
        {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────

export default async function DashboardPage() {

  // ── Auth guard ─────────────────────────────────────────────
  const { userId } = auth();
  if (!userId) redirect("/sign-in");

  // ── Fetch current user for display name ───────────────────
  const user = await currentUser();
  const displayName =
    user?.firstName ??
    user?.emailAddresses?.[0]?.emailAddress?.split("@")[0] ??
    "you";

  // ── Fetch all shares for this user ─────────────────────────
  const rawShares = await prisma.share.findMany({
    where:   { userId },
    orderBy: { createdAt: "desc" },
    select: {
      slug:          true,
      type:          true,
      content:       true,
      fileName:      true,
      fileSize:      true,
      mimeType:      true,
      createdAt:     true,
      expiresAt:     true,
      downloadCount: true,
    },
  });

  // ── Compute stats ──────────────────────────────────────────
  const totalShares = rawShares.length;
  const totalViews  = rawShares.reduce((acc, s) => acc + s.downloadCount, 0);
  const totalBytes  = rawShares.reduce((acc, s) => acc + (s.fileSize ?? 0), 0);

  // Type breakdown
  const textCount = rawShares.filter((s) => s.type === "TEXT").length;
  const fileCount = rawShares.filter((s) => s.type === "FILE").length;
  const urlCount  = rawShares.filter((s) => s.type === "URL").length;

  // Serialise dates for client component
  const shares: ShareRow[] = rawShares.map((s) => ({
    ...s,
    type:      s.type as "TEXT" | "FILE" | "URL",
    content:   s.content,
    createdAt: s.createdAt.toISOString(),
    expiresAt: s.expiresAt?.toISOString() ?? null,
  }));

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  // ─────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#f0f1f6]">
      {/* ── Navbar ──────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-black/5 bg-white/80 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-5 h-14 flex items-center justify-between">
          <a href="/" className="flex flex-col leading-none">
            <span className="text-base font-bold text-gray-900 tracking-tight">clipto</span>
            <span className="text-[10px] text-gray-400 -mt-0.5">share anything, instantly</span>
          </a>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500 hidden sm:block">
              Hey, <span className="font-medium text-gray-800">{displayName}</span>
            </span>
            <a
              href="/"
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-[#f5956d] text-white hover:bg-[#e07d56] transition-all shadow-sm"
            >
              <Plus size={12} /> New share
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-5 py-8 flex flex-col gap-8">

        {/* ── Page title ────────────────────────────────────── */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Shares</h1>
          <p className="mt-1 text-sm text-gray-400">
            All your links, files, and snippets in one place.
          </p>
        </div>

        {/* ── Stats bar ─────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard
            icon={BarChart2}
            label="Total shares"
            value={totalShares.toLocaleString()}
            sub={`${textCount} text · ${fileCount} file · ${urlCount} URL`}
          />
          <StatCard
            icon={Eye}
            label="Total views"
            value={totalViews.toLocaleString()}
            sub="across all shares"
          />
          <StatCard
            icon={HardDrive}
            label="Storage used"
            value={totalBytes > 0 ? formatFileSize(totalBytes) : "0 B"}
            sub="from file shares"
          />
        </div>

        {/* ── Shares table ──────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-black/5 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-800">
              {totalShares} share{totalShares !== 1 ? "s" : ""}
            </h2>
            <a
              href="/"
              className="flex items-center gap-1 text-xs text-[#f5956d] hover:text-[#e07d56] font-medium transition-colors"
            >
              <Plus size={12} /> Create new
            </a>
          </div>

          <SharesTable shares={shares} appUrl={appUrl} />
        </div>
      </main>
    </div>
  );
}
