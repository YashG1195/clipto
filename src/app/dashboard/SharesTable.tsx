"use client";

// =============================================================
// src/app/dashboard/SharesTable.tsx — Client component
// Renders the shares list with optimistic delete
// =============================================================

import { useState } from "react";
import {
  FileText, FolderOpen, Link2,
  Copy, Check, Trash2, ExternalLink,
  Loader2,
} from "lucide-react";
import { formatFileSize } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface ShareRow {
  slug:          string;
  type:          "TEXT" | "FILE" | "URL";
  content:       string | null;
  fileName:      string | null;
  fileSize:      number | null;
  mimeType:      string | null;
  createdAt:     string; // ISO
  expiresAt:     string | null;
  downloadCount: number;
}

interface Props {
  shares:  ShareRow[];
  appUrl:  string;
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);

  if (mins  < 1)   return "just now";
  if (mins  < 60)  return `${mins}m ago`;
  if (hours < 24)  return `${hours}h ago`;
  if (days  < 30)  return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function contentPreview(share: ShareRow): string {
  if (share.type === "FILE") return share.fileName ?? "Unknown file";
  if (share.type === "URL")  return share.content  ?? "";
  // TEXT — first 60 chars
  return (share.content ?? "").slice(0, 60) + ((share.content?.length ?? 0) > 60 ? "…" : "");
}

function TypeIcon({ type }: { type: ShareRow["type"] }) {
  const cls = "shrink-0";
  if (type === "TEXT") return <FileText  size={15} className={`${cls} text-blue-400`}  />;
  if (type === "FILE") return <FolderOpen size={15} className={`${cls} text-amber-400`} />;
  return               <Link2      size={15} className={`${cls} text-green-500`} />;
}

function TypeBadge({ type }: { type: ShareRow["type"] }) {
  const map = {
    TEXT: "bg-blue-50  text-blue-600",
    FILE: "bg-amber-50 text-amber-600",
    URL:  "bg-green-50 text-green-600",
  };
  return (
    <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-md ${map[type]}`}>
      {type}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────
// Row component — memoised to prevent unnecessary re-renders
// ─────────────────────────────────────────────────────────────

function ShareRowItem({
  share,
  appUrl,
  onDelete,
}: {
  share:    ShareRow;
  appUrl:   string;
  onDelete: (slug: string) => void;
}) {
  const [copied,   setCopied]   = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  const shareUrl = `${appUrl}/${share.slug}`;

  async function copyLink() {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleDelete() {
    if (!confirm(`Delete this ${share.type.toLowerCase()} share? This cannot be undone.`)) return;

    setDeleting(true);
    setError(null);

    // Optimistic remove — parent immediately hides the row
    onDelete(share.slug);

    try {
      const res = await fetch(`/api/share/${share.slug}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Delete failed (${res.status})`);
      }
    } catch (e) {
      // Revert optimistic update — handled by parent via error callback
      setError((e as Error).message);
      setDeleting(false);
      // Signal parent to restore row
      onDelete(`__restore__${share.slug}`);
    }
  }

  const isExpired = share.expiresAt && new Date(share.expiresAt) < new Date();

  return (
    <div
      className={`group flex items-center gap-3 px-4 py-3.5 border-b border-black/4 last:border-0 hover:bg-gray-50/60 transition-colors ${
        deleting ? "opacity-40 pointer-events-none" : ""
      }`}
    >
      {/* Type icon + badge */}
      <div className="flex flex-col items-center gap-1 w-10 shrink-0">
        <TypeIcon type={share.type} />
        <TypeBadge type={share.type} />
      </div>

      {/* Short URL */}
      <div className="w-28 shrink-0">
        <a
          href={shareUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs font-mono text-[#f5956d] hover:underline truncate"
        >
          /{share.slug}
          <ExternalLink size={10} className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
        </a>
      </div>

      {/* Content preview */}
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-600 truncate">{contentPreview(share)}</p>
        {share.type === "FILE" && share.fileSize && (
          <p className="text-[10px] text-gray-400 mt-0.5">{formatFileSize(share.fileSize)}</p>
        )}
      </div>

      {/* Created */}
      <div className="w-20 shrink-0 text-xs text-gray-400 hidden sm:block">
        {relativeTime(share.createdAt)}
      </div>

      {/* Expiry */}
      <div className="w-20 shrink-0 hidden md:block">
        {share.expiresAt ? (
          <span className={`text-xs ${isExpired ? "text-red-400" : "text-amber-500"}`}>
            {isExpired ? "Expired" : relativeTime(share.expiresAt)}
          </span>
        ) : (
          <span className="text-xs text-gray-300">Never</span>
        )}
      </div>

      {/* Views */}
      <div className="w-12 shrink-0 text-xs text-gray-400 text-right hidden sm:block">
        {share.downloadCount.toLocaleString()}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={copyLink}
          title="Copy share link"
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all"
        >
          {copied ? <Check size={13} className="text-green-500" /> : <Copy size={13} />}
        </button>
        <button
          onClick={handleDelete}
          title="Delete share"
          className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all"
        >
          {deleting
            ? <Loader2 size={13} className="animate-spin" />
            : <Trash2  size={13} />
          }
        </button>
      </div>

      {/* Inline error (revert notice) */}
      {error && (
        <span className="text-[10px] text-red-500 ml-1">{error}</span>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main table component with optimistic state
// ─────────────────────────────────────────────────────────────

export default function SharesTable({ shares: initial, appUrl }: Props) {
  const [shares, setShares] = useState<ShareRow[]>(initial);
  // Keep a map for revert: slug → original index
  const [removed, setRemoved] = useState<Map<string, { row: ShareRow; index: number }>>(
    new Map()
  );

  function handleDelete(slugOrSignal: string) {
    // Restore signal from error callback
    if (slugOrSignal.startsWith("__restore__")) {
      const slug = slugOrSignal.replace("__restore__", "");
      const entry = removed.get(slug);
      if (entry) {
        setShares((prev) => {
          const next = [...prev];
          next.splice(entry.index, 0, entry.row);
          return next;
        });
        setRemoved((prev) => { const m = new Map(prev); m.delete(slug); return m; });
      }
      return;
    }

    // Optimistic remove
    setShares((prev) => {
      const index = prev.findIndex((s) => s.slug === slugOrSignal);
      if (index === -1) return prev;
      const row = prev[index];
      setRemoved((m) => new Map(m).set(slugOrSignal, { row, index }));
      return prev.filter((_, i) => i !== index);
    });
  }

  if (shares.length === 0) {
    return (
      <div className="py-16 flex flex-col items-center gap-3 text-center">
        <div className="w-14 h-14 rounded-2xl bg-gray-50 border border-black/5 flex items-center justify-center">
          <FileText size={24} className="text-gray-300" />
        </div>
        <p className="text-sm font-medium text-gray-600">No shares yet</p>
        <p className="text-xs text-gray-400">Head to the homepage to create your first share.</p>
        <a
          href="/"
          className="mt-2 text-xs font-medium text-[#f5956d] hover:text-[#e07d56] transition-colors"
        >
          Create a share →
        </a>
      </div>
    );
  }

  return (
    <div>
      {/* Column headers */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-black/5 bg-gray-50/60">
        <div className="w-10 shrink-0" />
        <div className="w-28 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Link</div>
        <div className="flex-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Content</div>
        <div className="w-20 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-gray-400 hidden sm:block">Created</div>
        <div className="w-20 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-gray-400 hidden md:block">Expires</div>
        <div className="w-12 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-gray-400 text-right hidden sm:block">Views</div>
        <div className="w-16 shrink-0" />
      </div>

      {/* Rows */}
      {shares.map((share) => (
        <ShareRowItem
          key={share.slug}
          share={share}
          appUrl={appUrl}
          onDelete={handleDelete}
        />
      ))}
    </div>
  );
}
