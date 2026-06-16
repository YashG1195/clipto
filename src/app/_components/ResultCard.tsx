"use client";

// =============================================================
// src/app/_components/ResultCard.tsx
// Shown after any successful share — copy link + QR code
// =============================================================

import { useState } from "react";
import { Copy, Check, RotateCcw, ExternalLink } from "lucide-react";
import { useQRCode } from "next-qrcode";

interface ResultCardProps {
  url: string;
  label?: string;
  onReset: () => void;
}

export default function ResultCard({ url, label, onReset }: ResultCardProps) {
  const [copied, setCopied] = useState(false);
  const { Canvas } = useQRCode();

  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <div className="mt-5 rounded-2xl border border-green-200 bg-green-50/60 p-5 flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Header */}
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
        <p className="text-sm font-semibold text-green-800">
          {label ?? "Your link is ready!"}
        </p>
      </div>

      {/* URL display + copy */}
      <div className="flex items-center gap-2 bg-white rounded-xl border border-green-200 px-3 py-2.5">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 text-sm font-mono text-[#f5956d] truncate hover:underline"
        >
          {url}
        </a>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-gray-400 hover:text-gray-600 transition-colors shrink-0"
        >
          <ExternalLink size={14} />
        </a>
        <button
          onClick={copy}
          className="shrink-0 flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-[#f5956d] text-white hover:bg-[#e07d56] transition-all duration-150 active:scale-95"
        >
          {copied ? <><Check size={12} /> Copied!</> : <><Copy size={12} /> Copy</>}
        </button>
      </div>

      {/* QR Code */}
      <div className="flex flex-col items-center gap-2">
        <p className="text-xs text-gray-400">Scan to open</p>
        <div className="bg-white p-2 rounded-xl border border-gray-100 shadow-sm">
          <Canvas
            text={url}
            options={{
              width: 128,
              margin: 1,
              color: { dark: "#1a1a2e", light: "#ffffff" },
            }}
          />
        </div>
      </div>

      {/* Reset */}
      <button
        onClick={onReset}
        className="flex items-center justify-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors font-medium"
      >
        <RotateCcw size={13} />
        Share another
      </button>
    </div>
  );
}
