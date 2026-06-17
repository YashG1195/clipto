"use client";

// =============================================================
// src/app/_components/FileTab.tsx
// File upload tab — react-dropzone, presigned PUT flow
// =============================================================

import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { UploadCloud, X, FileText, Loader2 } from "lucide-react";
import ExpirySelector, { type ExpiresIn } from "./ExpirySelector";
import ResultCard from "./ResultCard";
import { formatFileSize } from "@/lib/utils";

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

interface SelectedFile {
  file: File;
  name: string;
  size: number;
  type: string;
}

type UploadStage =
  | "idle"
  | "requesting"   // POST /api/share/file
  | "uploading"    // PUT to R2
  | "confirming"   // POST /api/share/file/complete
  | "done";

export default function FileTab() {
  const [selected, setSelected]   = useState<SelectedFile | null>(null);
  const [expiresIn, setExpiresIn] = useState<ExpiresIn>("never");
  const [stage, setStage]         = useState<UploadStage>("idle");
  const [progress, setProgress]   = useState(0);
  const [error, setError]         = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  const onDrop = useCallback((accepted: File[], rejected: { errors: { message: string }[] }[]) => {
    setError(null);

    if (rejected.length > 0) {
      const msg = rejected[0]?.errors?.[0]?.message;
      setError(msg ?? "File not accepted. Check size and type.");
      return;
    }

    if (accepted.length === 0) return;

    const f = accepted[0];
    if (f.size > MAX_FILE_SIZE) {
      setError(`File is too large (${formatFileSize(f.size)}). Maximum is 100 MB.`);
      return;
    }

    setSelected({ file: f, name: f.name, size: f.size, type: f.type });
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    maxSize: MAX_FILE_SIZE,
  });

  async function handleUpload() {
    if (!selected) return;

    setError(null);
    setProgress(0);

    // Step 1 — request presigned URL
    setStage("requesting");
    let slug = "";
    let uploadUrl = "";
    let shareUrl = "";

    try {
      const res = await fetch("/api/share/file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName:  selected.name,
          fileSize:  selected.size,
          mimeType:  selected.type || "application/octet-stream",
          expiresIn,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to start upload."); setStage("idle"); return; }

      slug      = data.slug;
      uploadUrl = data.uploadUrl;
      shareUrl  = data.shareUrl;
    } catch {
      setError("Network error while starting upload."); setStage("idle"); return;
    }

    // Step 2 — PUT file directly to R2 using XHR (for progress)
    setStage("uploading");
    try {
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", uploadUrl);
        xhr.setRequestHeader("Content-Type", selected.type || "application/octet-stream");

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            setProgress(Math.round((e.loaded / e.total) * 100));
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`R2 upload failed: ${xhr.status}`));
        };
        xhr.onerror = () => reject(new Error("Upload network error"));
        xhr.send(selected.file);
      });
    } catch (e) {
      setError(`Upload failed: ${(e as Error).message}`); setStage("idle"); return;
    }

    setProgress(100);

    // Step 3 — confirm with backend
    setStage("confirming");
    try {
      const res = await fetch("/api/share/file/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to confirm upload."); setStage("idle"); return; }
    } catch {
      setError("Network error while confirming upload."); setStage("idle"); return;
    }

    setStage("done");
    setResultUrl(shareUrl);
  }

  function reset() {
    setSelected(null); setStage("idle");
    setProgress(0); setError(null); setResultUrl(null);
  }

  if (resultUrl) return <ResultCard url={resultUrl} label="File shared!" onReset={reset} />;

  const isLoading = stage !== "idle" && stage !== "done";

  return (
    <div className="flex flex-col gap-4">
      {/* Drop zone */}
      {!selected ? (
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-2xl p-10 flex flex-col items-center gap-3 cursor-pointer transition-all duration-200 select-none
            ${isDragActive
              ? "border-[#f5956d] bg-orange-50"
              : "border-gray-200 bg-gray-50 hover:border-[#f5956d]/60 hover:bg-orange-50/30"
            }`}
        >
          <input {...getInputProps()} />
          <div className="w-14 h-14 rounded-2xl bg-white border border-gray-100 shadow-sm flex items-center justify-center">
            <UploadCloud size={28} className={isDragActive ? "text-[#f5956d]" : "text-gray-400"} />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-gray-700">
              {isDragActive ? "Drop it here!" : "Drop file here or click to browse"}
            </p>
            <p className="mt-1 text-xs text-gray-400">Max 100 MB · All file types supported</p>
          </div>
        </div>
      ) : (
        /* File preview */
        <div className="flex items-center gap-3 bg-white border border-black/8 rounded-xl px-4 py-3.5">
          <div className="w-9 h-9 rounded-lg bg-orange-50 flex items-center justify-center shrink-0">
            <FileText size={18} className="text-[#f5956d]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-800 truncate">{selected.name}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {formatFileSize(selected.size)}
              {selected.type ? ` · ${selected.type}` : ""}
            </p>
          </div>
          {!isLoading && (
            <button
              onClick={() => setSelected(null)}
              className="text-gray-300 hover:text-gray-500 transition-colors shrink-0"
            >
              <X size={16} />
            </button>
          )}
        </div>
      )}

      {/* Progress bar */}
      {isLoading && (
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between text-xs text-gray-400">
            <span>
              {stage === "requesting"  ? "Preparing upload…"  :
               stage === "uploading"   ? `Uploading… ${progress}%` :
               stage === "confirming"  ? "Confirming…" : ""}
            </span>
            <span>{progress}%</span>
          </div>
          <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#f5956d] rounded-full transition-all duration-200"
              style={{ width: `${stage === "confirming" ? 100 : progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <ExpirySelector value={expiresIn} onChange={setExpiresIn} disabled={isLoading} />
        <button
          onClick={handleUpload}
          disabled={!selected || isLoading}
          className="flex items-center gap-2 bg-[#f5956d] hover:bg-[#e07d56] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-all duration-150 shadow-sm hover:shadow-md active:scale-95"
        >
          {isLoading
            ? <><Loader2 size={14} className="animate-spin" /> Uploading…</>
            : "Upload & Share"
          }
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
