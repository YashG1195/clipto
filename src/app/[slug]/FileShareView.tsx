"use client";

// =============================================================
// src/app/[slug]/FileShareView.tsx — Client component
// Renders file metadata + presigned download button
// =============================================================

import { useState } from "react";
import {
  Download, Copy, Check, Clock, Eye,
  FileText, FileImage, FileVideo, FileAudio,
  FileArchive, FileCode, File,
} from "lucide-react";
import { formatFileSize, getMimeTypeCategory } from "@/lib/utils";

interface FileShareViewProps {
  slug: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  downloadUrl: string;   // presigned R2 URL — valid 5 min
  createdAt: string;
  expiresAt: string | null;
  downloadCount: number;
}

// Map mime category → lucide icon
function FileIcon({ mimeType, size = 48 }: { mimeType: string; size?: number }) {
  const category = getMimeTypeCategory(mimeType);
  const cls = `text-[#f5956d]`;

  switch (category) {
    case "image":   return <FileImage   size={size} className={cls} />;
    case "video":   return <FileVideo   size={size} className={cls} />;
    case "audio":   return <FileAudio   size={size} className={cls} />;
    case "pdf":     return <FileText    size={size} className={cls} />;
    case "code":    return <FileCode    size={size} className={cls} />;
    case "archive": return <FileArchive size={size} className={cls} />;
    default:        return <File        size={size} className={cls} />;
  }
}

// Extension badge from file name
function getExtension(name: string): string {
  const parts = name.split(".");
  return parts.length > 1 ? parts.at(-1)!.toUpperCase() : "FILE";
}

export default function FileShareView({
  slug,
  fileName,
  fileSize,
  mimeType,
  downloadUrl,
  createdAt,
  expiresAt,
  downloadCount,
}: FileShareViewProps) {
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const shareUrl =
    typeof window !== "undefined"
      ? window.location.href
      : `${process.env.NEXT_PUBLIC_APP_URL}/${slug}`;

  async function copyLink() {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleDownload() {
    setDownloading(true);
    // Anchor click triggers browser download
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => setDownloading(false), 2000);
  }

  const created = new Date(createdAt);
  const expires = expiresAt ? new Date(expiresAt) : null;
  const ext = getExtension(fileName);

  return (
    <div className="min-h-screen bg-[#f0f1f5] flex flex-col">
      {/* ── Header ──────────────────────────────────── */}
      <header className="border-b border-black/5 bg-white/70 backdrop-blur-md px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500 font-medium">📁 File Share</span>
          <span className="text-xs text-gray-400 font-mono bg-gray-100 px-2 py-0.5 rounded-md">
            /{slug}
          </span>
        </div>
        <button
          onClick={copyLink}
          className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-[#f5956d] text-white hover:bg-[#e07d56] transition-all font-medium shadow-sm"
        >
          {copied ? <><Check size={14} /> Copied!</> : <><Copy size={14} /> Copy link</>}
        </button>
      </header>

      {/* ── Meta strip ──────────────────────────────── */}
      <div className="px-6 py-2 bg-white/40 border-b border-black/5 flex items-center gap-4 text-xs text-gray-400">
        <span className="flex items-center gap-1">
          <Clock size={11} />
          {created.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
        </span>
        <span className="flex items-center gap-1">
          <Eye size={11} /> {downloadCount.toLocaleString()} download{downloadCount !== 1 ? "s" : ""}
        </span>
        {expires && (
          <span className="text-amber-500">
            Expires {expires.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </span>
        )}
      </div>

      {/* ── File card ───────────────────────────────── */}
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-10 flex flex-col items-center gap-6 max-w-md w-full">
          {/* Icon + extension badge */}
          <div className="relative">
            <FileIcon mimeType={mimeType} size={64} />
            <span className="absolute -bottom-1 -right-3 text-[10px] font-bold bg-[#f5956d] text-white px-1.5 py-0.5 rounded-md">
              {ext}
            </span>
          </div>

          {/* File name */}
          <div className="text-center">
            <p className="text-lg font-semibold text-gray-900 break-all leading-snug">
              {fileName}
            </p>
            <p className="mt-1 text-sm text-gray-400">{formatFileSize(fileSize)}</p>
          </div>

          {/* Presigned URL warning */}
          {expires === null && (
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-center">
              ⏱ Download link expires in ~5 minutes. Refresh the page to get a new one.
            </p>
          )}

          {/* Download button */}
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="w-full flex items-center justify-center gap-2 bg-[#f5956d] hover:bg-[#e07d56] disabled:opacity-70 text-white font-semibold py-3 px-6 rounded-xl transition-all duration-150 shadow-md hover:shadow-lg active:scale-[0.98] text-sm"
          >
            <Download size={18} />
            {downloading ? "Starting download…" : "Download file"}
          </button>

          {/* Copy link secondary */}
          <button
            onClick={copyLink}
            className="text-sm text-gray-400 hover:text-gray-600 flex items-center gap-1 transition-colors"
          >
            {copied ? <><Check size={13} /> Link copied</> : <><Copy size={13} /> Copy share link</>}
          </button>
        </div>
      </main>
    </div>
  );
}
