"use client";

import type { ReactNode } from "react";
import type { Status } from "@/lib/duetracker";
import { statusTone } from "@/lib/duetracker";

export function StatusBadge({ status, label }: { status: Status; label?: string }) {
  const tone = statusTone(status);
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        padding: "2px 8px",
        borderRadius: 999,
        background: tone.bg,
        color: tone.fg,
        whiteSpace: "nowrap",
      }}
    >
      {label ?? status}
    </span>
  );
}

export function Pill({ bg, fg, children }: { bg: string; fg: string; children: ReactNode }) {
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: bg, color: fg, whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}
