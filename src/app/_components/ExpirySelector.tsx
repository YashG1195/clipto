"use client";

// =============================================================
// src/app/_components/ExpirySelector.tsx
// Shared expiry dropdown used by all three tabs
// =============================================================

import { Clock } from "lucide-react";

export type ExpiresIn = "1h" | "24h" | "7d" | "never";

const OPTIONS: { value: ExpiresIn; label: string }[] = [
  { value: "1h",    label: "1 hour"    },
  { value: "24h",   label: "24 hours"  },
  { value: "7d",    label: "7 days"    },
  { value: "never", label: "Never"     },
];

interface Props {
  value: ExpiresIn;
  onChange: (v: ExpiresIn) => void;
  disabled?: boolean;
}

export default function ExpirySelector({ value, onChange, disabled }: Props) {
  return (
    <div className="flex items-center gap-2">
      <Clock size={13} className="text-gray-400 shrink-0" />
      <span className="text-xs text-gray-400 shrink-0">Expires in</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as ExpiresIn)}
        disabled={disabled}
        className="text-xs text-gray-600 bg-transparent border-none outline-none cursor-pointer hover:text-gray-900 transition-colors disabled:opacity-50 font-medium"
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}
