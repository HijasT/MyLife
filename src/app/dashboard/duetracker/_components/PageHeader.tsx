"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { ThemeVars } from "./theme";

export function PageHeader({
  V,
  isDark,
  title,
  backHref = "/dashboard/duetracker",
  backLabel = "Due Tracker",
  right,
}: {
  V: ThemeVars;
  isDark: boolean;
  title: string;
  backHref?: string;
  backLabel?: string;
  right?: ReactNode;
}) {
  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 20,
        background: isDark ? "rgba(13,15,20,0.9)" : "rgba(249,248,245,0.9)",
        backdropFilter: "blur(12px)",
        borderBottom: `1px solid ${V.border}`,
        padding: "12px 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        flexWrap: "wrap",
      }}
    >
      <Link href={backHref} style={{ display: "flex", alignItems: "center", gap: 8, color: V.muted, textDecoration: "none", fontWeight: 600, fontSize: 13 }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        {backLabel}
      </Link>
      <span style={{ fontSize: 16, fontWeight: 800 }}>{title}</span>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>{right ?? <div />}</div>
    </div>
  );
}
