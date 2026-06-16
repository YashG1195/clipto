"use client";

// =============================================================
// src/app/[slug]/ExpiredView.tsx — Expired share UI
// =============================================================

import { Clock, ArrowLeft } from "lucide-react";
import Link from "next/link";

interface ExpiredViewProps {
  slug: string;
  type: "TEXT" | "FILE" | "URL";
}

const TYPE_LABELS: Record<string, string> = {
  TEXT: "text snippet",
  FILE: "file",
  URL:  "short link",
};

export default function ExpiredView({ slug, type }: ExpiredViewProps) {
  return (
    <div className="min-h-screen bg-[#f0f1f5] flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-10 flex flex-col items-center gap-5 max-w-sm w-full text-center">
        <div className="w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center">
          <Clock size={32} className="text-amber-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">This share has expired</h1>
          <p className="mt-2 text-sm text-gray-500">
            The {TYPE_LABELS[type] ?? "share"}{" "}
            <span className="font-mono text-gray-700">/{slug}</span> is no longer
            available. The creator set a time limit when sharing it.
          </p>
        </div>
        <Link
          href="/"
          className="flex items-center gap-2 text-sm text-[#f5956d] hover:text-[#e07d56] font-medium transition-colors"
        >
          <ArrowLeft size={14} />
          Create your own share
        </Link>
      </div>
    </div>
  );
}
