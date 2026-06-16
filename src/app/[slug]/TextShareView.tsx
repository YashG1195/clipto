"use client";

// =============================================================
// src/app/[slug]/TextShareView.tsx — Client component
// Renders shared text content with syntax highlighting + copy
// =============================================================

import { useState } from "react";
import { Copy, Check, Clock, Eye } from "lucide-react";

interface TextShareViewProps {
  slug: string;
  content: string;
  createdAt: string;
  expiresAt: string | null;
  downloadCount: number;
}

export default function TextShareView({
  slug,
  content,
  createdAt,
  expiresAt,
  downloadCount,
}: TextShareViewProps) {
  const [copied, setCopied] = useState(false);
  const [copiedContent, setCopiedContent] = useState(false);

  const shareUrl =
    typeof window !== "undefined"
      ? window.location.href
      : `${process.env.NEXT_PUBLIC_APP_URL}/${slug}`;

  async function copyLink() {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function copyContent() {
    await navigator.clipboard.writeText(content);
    setCopiedContent(true);
    setTimeout(() => setCopiedContent(false), 2000);
  }

  const created = new Date(createdAt);
  const expires = expiresAt ? new Date(expiresAt) : null;

  return (
    <div className="min-h-screen bg-[#f0f1f5] flex flex-col">
      {/* ── Header bar ──────────────────────────────── */}
      <header className="border-b border-black/5 bg-white/70 backdrop-blur-md px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500 font-medium">
            📄 Text Share
          </span>
          <span className="text-xs text-gray-400 font-mono bg-gray-100 px-2 py-0.5 rounded-md">
            /{slug}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={copyLink}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-[#f5956d] text-white hover:bg-[#e07d56] transition-all duration-150 font-medium shadow-sm"
          >
            {copied ? (
              <><Check size={14} /> Copied!</>
            ) : (
              <><Copy size={14} /> Copy link</>
            )}
          </button>
        </div>
      </header>

      {/* ── Meta strip ──────────────────────────────── */}
      <div className="px-6 py-2 bg-white/40 border-b border-black/5 flex items-center gap-4 text-xs text-gray-400">
        <span className="flex items-center gap-1">
          <Clock size={11} />
          {created.toLocaleDateString("en-US", {
            month: "short", day: "numeric", year: "numeric",
          })}
        </span>
        <span className="flex items-center gap-1">
          <Eye size={11} />
          {downloadCount.toLocaleString()} view{downloadCount !== 1 ? "s" : ""}
        </span>
        {expires && (
          <span className="text-amber-500">
            Expires {expires.toLocaleDateString("en-US", {
              month: "short", day: "numeric",
            })}
          </span>
        )}
      </div>

      {/* ── Content area ────────────────────────────── */}
      <main className="flex-1 p-6 max-w-4xl mx-auto w-full">
        <div className="relative group bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden">
          {/* Copy content button */}
          <button
            onClick={copyContent}
            className="absolute top-3 right-3 z-10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 font-medium"
          >
            {copiedContent ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy text</>}
          </button>

          <pre className="p-6 text-sm text-gray-800 font-mono whitespace-pre-wrap break-words leading-relaxed overflow-x-auto min-h-[200px]">
            {content}
          </pre>
        </div>

        {/* Character count */}
        <p className="mt-2 text-xs text-gray-400 text-right">
          {content.length.toLocaleString()} characters
        </p>
      </main>
    </div>
  );
}
