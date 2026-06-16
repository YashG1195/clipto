"use client";

// =============================================================
// src/app/_components/TextTab.tsx
// Text sharing tab — textarea, char count, expiry, submit
// =============================================================

import { useState, useRef, useCallback } from "react";
import ExpirySelector, { type ExpiresIn } from "./ExpirySelector";
import ResultCard from "./ResultCard";
import { Loader2 } from "lucide-react";

const MAX_CHARS = 100_000;

export default function TextTab() {
  const [content, setContent]     = useState("");
  const [expiresIn, setExpiresIn] = useState<ExpiresIn>("never");
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const textareaRef               = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
    setError(null);
    // Auto-resize
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  async function handleShare() {
    if (!content.trim()) {
      setError("Please enter some text to share.");
      textareaRef.current?.focus();
      return;
    }
    if (content.length > MAX_CHARS) {
      setError(`Text exceeds ${MAX_CHARS.toLocaleString()} character limit.`);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/share/text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, expiresIn }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }

      setResultUrl(data.url);
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setContent("");
    setResultUrl(null);
    setError(null);
    setTimeout(() => textareaRef.current?.focus(), 100);
  }

  const charPct = Math.min((content.length / MAX_CHARS) * 100, 100);
  const charColor =
    charPct > 90 ? "text-red-500" :
    charPct > 70 ? "text-amber-500" :
    "text-gray-400";

  if (resultUrl) return <ResultCard url={resultUrl} label="Text shared!" onReset={reset} />;

  return (
    <div className="flex flex-col gap-4">
      {/* Textarea */}
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={handleChange}
          disabled={loading}
          placeholder="Paste or type your text here…"
          rows={8}
          className="w-full min-h-[200px] bg-white border border-black/8 rounded-xl px-4 py-3.5 text-sm font-mono text-gray-800 placeholder-gray-300 resize-none outline-none focus:ring-2 focus:ring-[#f5956d]/30 focus:border-[#f5956d]/60 transition-all duration-150 leading-relaxed disabled:opacity-60"
          style={{ overflow: "hidden" }}
        />
      </div>

      {/* Footer row: char count + expiry + button */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4">
          {/* Char count */}
          <span className={`text-xs tabular-nums font-medium ${charColor}`}>
            {content.length.toLocaleString()} / {MAX_CHARS.toLocaleString()}
          </span>
          {/* Progress bar */}
          <div className="w-20 h-1 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-200 ${
                charPct > 90 ? "bg-red-400" :
                charPct > 70 ? "bg-amber-400" :
                "bg-[#f5956d]"
              }`}
              style={{ width: `${charPct}%` }}
            />
          </div>

          <ExpirySelector value={expiresIn} onChange={setExpiresIn} disabled={loading} />
        </div>

        <button
          onClick={handleShare}
          disabled={loading || content.length === 0}
          className="flex items-center gap-2 bg-[#f5956d] hover:bg-[#e07d56] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-all duration-150 shadow-sm hover:shadow-md active:scale-95"
        >
          {loading ? <><Loader2 size={14} className="animate-spin" /> Sharing…</> : "Share text"}
        </button>
      </div>

      {/* Error */}
      {error && (
        <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {error}
        </p>
      )}
    </div>
  );
}
