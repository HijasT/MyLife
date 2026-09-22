"use client";

import type { CSSProperties } from "react";
import { ASSET_ICONS, fmtN } from "@/lib/portfolio";
import type { AssetType } from "@/lib/portfolio";
import type { ThemeVars } from "./theme";

const TYPE_COLORS: Record<AssetType, string> = {
  gold: "#FFD700",
  silver: "#C0C0C0",
  stock: "#3b82f6",
  crypto: "#f59e0b",
  other: "#94a3b8",
};

const TYPE_TABS: Array<{ key: AssetType | "all"; label: string; emoji: string }> = [
  { key: "all", label: "All", emoji: "📊" },
  { key: "gold", label: "Gold", emoji: "🥇" },
  { key: "silver", label: "Silver", emoji: "🥈" },
  { key: "stock", label: "Stocks", emoji: "📈" },
  { key: "crypto", label: "Crypto", emoji: "₿" },
  { key: "other", label: "Other", emoji: "📌" },
];

export function AllocationAndFilters({
  V,
  isDark,
  inp,
  typeBreakdown,
  itemCounts,
  typeFilter,
  onTypeFilterChange,
  searchQuery,
  onSearchChange,
  sortBy,
  onSortChange,
}: {
  V: ThemeVars;
  isDark: boolean;
  inp: CSSProperties;
  typeBreakdown: Record<AssetType, number>;
  itemCounts: Record<string, number>;
  typeFilter: AssetType | "all";
  onTypeFilterChange: (type: AssetType | "all") => void;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  sortBy: "value" | "pl" | "name";
  onSortChange: (value: "value" | "pl" | "name") => void;
}) {
  const totalVal = Object.values(typeBreakdown).reduce((a, b) => a + b, 0);
  const sortedTypes = (Object.entries(typeBreakdown) as [AssetType, number][]).filter(([, v]) => v > 0).sort(([, a], [, b]) => b - a);

  return (
    <div style={{ padding: "16px 24px 0" }}>
      {totalVal > 0 && sortedTypes.length > 1 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: V.faint, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6, display: "flex", justifyContent: "space-between" }}>
            <span>Allocation breakdown</span>
            <span>
              {sortedTypes.length} asset type{sortedTypes.length > 1 ? "s" : ""}
            </span>
          </div>
          <div style={{ display: "flex", height: 10, borderRadius: 999, overflow: "hidden", background: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)" }}>
            {sortedTypes.map(([type, val]) => (
              <div key={type} title={`${type}: AED ${fmtN(val)} (${((val / totalVal) * 100).toFixed(1)}%)`} style={{ width: `${(val / totalVal) * 100}%`, background: TYPE_COLORS[type], transition: "width 0.3s" }} />
            ))}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 8 }}>
            {sortedTypes.map(([type, val]) => (
              <div key={type} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: TYPE_COLORS[type] }} />
                <span style={{ color: V.muted, textTransform: "capitalize", fontWeight: 700 }}>
                  {ASSET_ICONS[type]} {type}
                </span>
                <span style={{ color: V.faint }}>{((val / totalVal) * 100).toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", borderBottom: `1px solid ${V.border}`, paddingBottom: 0 }}>
        {TYPE_TABS.filter((t) => t.key === "all" || (itemCounts[t.key] ?? 0) > 0).map((t) => {
          const isActive = typeFilter === t.key;
          return (
            <button
              key={t.key}
              onClick={() => onTypeFilterChange(t.key)}
              style={{
                padding: "7px 14px",
                borderRadius: "8px 8px 0 0",
                border: `1px solid ${isActive ? V.border : "transparent"}`,
                borderBottom: isActive ? `1px solid ${V.card}` : "1px solid transparent",
                background: isActive ? V.card : "transparent",
                color: isActive ? V.text : V.muted,
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 700,
                marginBottom: -1,
                position: "relative",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span>{t.emoji}</span>
              <span>{t.label}</span>
              <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 999, background: isActive ? V.accent + "22" : isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)", color: isActive ? V.accent : V.faint, fontWeight: 800 }}>
                {itemCounts[t.key] ?? 0}
              </span>
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 12 }}>
        <input style={{ ...inp, flex: "1 1 220px", minWidth: 160, width: "auto" }} value={searchQuery} onChange={(e) => onSearchChange(e.target.value)} placeholder="🔎 Search by name or symbol…" />
        <select style={{ ...inp, width: "auto", minWidth: 170 }} value={sortBy} onChange={(e) => onSortChange(e.target.value as "value" | "pl" | "name")}>
          <option value="value">Sort: Current value ↓</option>
          <option value="pl">Sort: P&amp;L ↓</option>
          <option value="name">Sort: Name A–Z</option>
        </select>
      </div>
    </div>
  );
}
