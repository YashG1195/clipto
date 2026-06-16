"use client";

// =============================================================
// src/app/page.tsx — clipto Homepage
// =============================================================
// Clean, minimal homepage with three tabs: Text | File | URL
// Matches kuick.io aesthetics: warm orange accent, light gray
// background, centered card layout, minimal nav.
// =============================================================

import { useState } from "react";
import { FileText, FolderOpen, Link2 } from "lucide-react";
import TextTab from "./_components/TextTab";
import FileTab from "./_components/FileTab";
import UrlTab  from "./_components/UrlTab";

// ─────────────────────────────────────────────────────────────
// Tab definitions
// ─────────────────────────────────────────────────────────────

type Tab = "text" | "file" | "url";

const TABS: { id: Tab; label: string; Icon: React.ElementType; desc: string }[] = [
  { id: "text", label: "Text",  Icon: FileText,  desc: "Share a snippet, note, or code block" },
  { id: "file", label: "File",  Icon: FolderOpen, desc: "Upload and share any file up to 100 MB"  },
  { id: "url",  label: "URL",   Icon: Link2,      desc: "Turn any long link into a short one" },
];

// ─────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<Tab>("text");

  const currentTab = TABS.find((t) => t.id === activeTab)!;

  return (
    <div className="min-h-screen bg-[#f0f1f6] flex flex-col">
      {/* ── Navbar ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-black/5 bg-white/80 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-5 h-14 flex items-center justify-between">
          {/* Logo */}
          <a href="/" className="flex flex-col leading-none">
            <span className="text-base font-bold text-gray-900 tracking-tight">clipto</span>
            <span className="text-[10px] text-gray-400 font-medium -mt-0.5">share anything, instantly</span>
          </a>

          {/* Nav links */}
          <nav className="hidden sm:flex items-center gap-5 text-sm text-gray-500">
            <a href="#faq"   className="hover:text-gray-800 transition-colors">FAQ</a>
            <a href="/sharings" className="hover:text-gray-800 transition-colors">My Shares</a>
          </nav>
        </div>
      </header>

      {/* ── Hero ───────────────────────────────────────────── */}
      <section className="pt-16 pb-10 px-5 text-center">
        <h1 className="text-4xl sm:text-5xl font-extrabold text-gray-900 tracking-tight leading-[1.1]">
          Internet shortcut for<br />
          <span className="text-[#f5956d]">sharing anything.</span>
        </h1>
        <p className="mt-4 text-base text-gray-500 max-w-sm mx-auto">
          Share text, files &amp; links instantly — no sign-up required.
        </p>
      </section>

      {/* ── Main card ──────────────────────────────────────── */}
      <main className="flex-1 px-5 pb-20 max-w-2xl mx-auto w-full">
        <div className="bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden">

          {/* Tab bar */}
          <div className="flex border-b border-black/5">
            {TABS.map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex-1 flex items-center justify-center gap-2 py-3.5 text-sm font-medium transition-all duration-150 border-b-2
                  ${activeTab === id
                    ? "border-[#f5956d] text-[#f5956d] bg-orange-50/40"
                    : "border-transparent text-gray-400 hover:text-gray-700 hover:bg-gray-50"
                  }`}
              >
                <Icon size={15} />
                {label}
              </button>
            ))}
          </div>

          {/* Tab description */}
          <div className="px-5 pt-4 pb-1">
            <p className="text-xs text-gray-400">{currentTab.desc}</p>
          </div>

          {/* Tab content */}
          <div className="px-5 pt-3 pb-6">
            {activeTab === "text" && <TextTab />}
            {activeTab === "file" && <FileTab />}
            {activeTab === "url"  && <UrlTab  />}
          </div>
        </div>

        {/* ── Feature cards ─────────────────────────────────── */}
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { emoji: "⚡",  title: "Instant",    body: "No accounts. No friction. Just paste and share." },
            { emoji: "🔒",  title: "Private",    body: "Links expire. IPs are hashed. No raw data stored." },
            { emoji: "🌍",  title: "Fast",       body: "Edge-cached globally via Cloudflare CDN." },
          ].map(({ emoji, title, body }) => (
            <div
              key={title}
              className="bg-white rounded-2xl border border-black/5 p-5 shadow-sm"
            >
              <div className="w-9 h-9 rounded-xl bg-orange-50 flex items-center justify-center text-lg mb-3">
                {emoji}
              </div>
              <p className="text-sm font-semibold text-gray-800">{title}</p>
              <p className="mt-1 text-xs text-gray-400 leading-relaxed">{body}</p>
            </div>
          ))}
        </div>

        {/* ── FAQ ───────────────────────────────────────────── */}
        <section id="faq" className="mt-14">
          <h2 className="text-2xl font-bold text-gray-900 text-center mb-6">
            Frequently asked questions
          </h2>
          <FaqList />
        </section>
      </main>

      {/* ── Footer ─────────────────────────────────────────── */}
      <footer className="border-t border-black/5 py-8 px-5 text-center">
        <p className="text-sm font-semibold text-gray-800">clipto</p>
        <p className="mt-1 text-xs text-gray-400">Internet shortcut for sharing anything.</p>
        <p className="mt-3 text-[11px] text-gray-300">
          © {new Date().getFullYear()} clipto. Built with Next.js · Cloudflare R2 · Upstash
        </p>
      </footer>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// FAQ accordion
// ─────────────────────────────────────────────────────────────

const FAQS = [
  { q: "What is clipto?",                    a: "clipto is a free, no-signup tool for sharing text snippets, files (up to 100 MB), and short links — all with a single click." },
  { q: "Is clipto free to use?",             a: "Yes, completely free. No accounts, no paywalls. Just share." },
  { q: "Are my uploads private?",            a: "Shares are accessible to anyone with the link but not indexed publicly. Use expiry to ensure links stop working after a set time." },
  { q: "Is there a size limit for files?",   a: "Files up to 100 MB are supported. For larger files, consider splitting or compressing them first." },
  { q: "Who is responsible for uploads?",    a: "You are. Don't share illegal, copyrighted, or harmful content. We reserve the right to remove content that violates our policies." },
  { q: "How secure is clipto?",              a: "Files are stored in Cloudflare R2 with access controlled by short-lived presigned URLs. IPs are one-way hashed. We don't store raw personal data." },
];

function FaqList() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <div className="flex flex-col gap-2">
      {FAQS.map(({ q, a }, i) => (
        <div
          key={i}
          className="bg-white border border-black/5 rounded-xl overflow-hidden shadow-sm"
        >
          <button
            onClick={() => setOpen(open === i ? null : i)}
            className="w-full flex items-center justify-between px-5 py-4 text-left text-sm font-medium text-gray-800 hover:bg-gray-50 transition-colors"
          >
            {q}
            <span
              className={`text-gray-400 text-lg transition-transform duration-200 ${
                open === i ? "rotate-45" : ""
              }`}
            >
              +
            </span>
          </button>
          {open === i && (
            <div className="px-5 pb-4 text-sm text-gray-500 leading-relaxed border-t border-black/5 pt-3">
              {a}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
