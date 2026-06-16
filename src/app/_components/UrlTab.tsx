"use client";

// =============================================================
// src/app/_components/UrlTab.tsx
// URL shortener tab — input, validate, shorten
// =============================================================

import { useState } from "react";
import { Link2, Loader2, AlertCircle } from "lucide-react";
import ExpirySelector, { type ExpiresIn } from "./ExpirySelector";
import ResultCard from "./ResultCard";

export default function UrlTab() {
  const [url, setUrl]             = useState("");
  const [expiresIn, setExpiresIn] = useState<ExpiresIn>("never");
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  function validateUrl(raw: string): string | null {
    if (!raw.trim()) return "Please enter a URL.";
    try {
      const parsed = new URL(raw.trim());
      if (!["http:", "https:"].includes(parsed.protocol)) {
        return "Only http:// and https:// URLs are supported.";
      }
    } catch {
      return "Please enter a valid URL (include https://).";
    }
    return null; // valid
  }

  async function handleShorten() {
    const validationError = validateUrl(url);
    if (validationError) { setError(validationError); return; }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/shorten", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), expiresIn }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }

      setResultUrl(data.shortUrl);
    } catch {
      setError("Network error. Please check your connection.");
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setUrl(""); setResultUrl(null); setError(null);
  }

  if (resultUrl) return <ResultCard url={resultUrl} label="Short link ready!" onReset={reset} />;

  const hasError = !!error;

  return (
    <div className="flex flex-col gap-4">
      {/* URL input */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none">
          <Link2 size={15} className="text-gray-300" />
        </div>
        <input
          type="url"
          value={url}
          onChange={(e) => { setUrl(e.target.value); setError(null); }}
          onKeyDown={(e) => e.key === "Enter" && handleShorten()}
          placeholder="https://your-very-long-link.com/some/deeply/nested/path?with=params"
          disabled={loading}
          className={`w-full pl-10 pr-4 py-3.5 text-sm bg-white border rounded-xl outline-none transition-all duration-150 disabled:opacity-60
            ${hasError
              ? "border-red-300 focus:ring-2 focus:ring-red-200"
              : "border-black/8 focus:ring-2 focus:ring-[#f5956d]/30 focus:border-[#f5956d]/60"
            }`}
        />
      </div>

      {/* Helper text */}
      {!hasError && (
        <p className="text-xs text-gray-400 -mt-2">
          Paste any URL — we'll turn it into a clean short link you can share anywhere.
        </p>
      )}

      {/* Error */}
      {error && (
        <p className="flex items-center gap-1.5 text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2 -mt-2">
          <AlertCircle size={12} className="shrink-0" />
          {error}
        </p>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <ExpirySelector value={expiresIn} onChange={setExpiresIn} disabled={loading} />

        <button
          onClick={handleShorten}
          disabled={loading || !url.trim()}
          className="flex items-center gap-2 bg-[#f5956d] hover:bg-[#e07d56] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-all duration-150 shadow-sm hover:shadow-md active:scale-95"
        >
          {loading
            ? <><Loader2 size={14} className="animate-spin" /> Shortening…</>
            : <><Link2 size={14} /> Shorten URL</>
          }
        </button>
      </div>
    </div>
  );
}
