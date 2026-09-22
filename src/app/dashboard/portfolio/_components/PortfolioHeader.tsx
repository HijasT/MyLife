"use client";

import type { CSSProperties } from "react";
import type { ThemeVars } from "./theme";

export function PortfolioHeader({
  V,
  btn,
  btnP,
  activeTab,
  onTabChange,
  liveLoading,
  priceLoading,
  hasItems,
  onUpdatePrices,
  onExportCsv,
  onAddAsset,
  onRefreshSpotPrices,
}: {
  V: ThemeVars;
  btn: CSSProperties;
  btnP: CSSProperties;
  activeTab: "assets" | "prices";
  onTabChange: (tab: "assets" | "prices") => void;
  liveLoading: boolean;
  priceLoading: boolean;
  hasItems: boolean;
  onUpdatePrices: () => void;
  onExportCsv: () => void;
  onAddAsset: () => void;
  onRefreshSpotPrices: () => void;
}) {
  return (
    <div style={{ padding: "22px 24px 0", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
      <div>
        <div style={{ fontSize: 22, fontWeight: 800 }}>
          Port<span style={{ color: V.accent, fontStyle: "italic" }}>folio</span>
        </div>
        <div style={{ fontSize: 13, color: V.faint, marginTop: 2 }}>Stocks · Gold · Metals</div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", borderRadius: 10, overflow: "hidden", border: `1px solid ${V.border}` }}>
          {(["assets", "prices"] as const).map((t) => (
            <button
              key={t}
              onClick={() => onTabChange(t)}
              style={{
                padding: "7px 14px",
                background: activeTab === t ? V.accent : "transparent",
                color: activeTab === t ? "#fff" : V.muted,
                border: "none",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 600,
                textTransform: "capitalize",
              }}
            >
              {t === "prices" ? "📊 Live Prices" : "My Assets"}
            </button>
          ))}
        </div>

        {activeTab === "assets" && (
          <button style={btn} onClick={onUpdatePrices} disabled={liveLoading}>
            {liveLoading ? "Fetching…" : "🔄 Update prices"}
          </button>
        )}
        {activeTab === "assets" && hasItems && (
          <button style={btn} onClick={onExportCsv}>
            ⬇ Export CSV
          </button>
        )}
        {activeTab === "assets" && (
          <button style={btnP} onClick={onAddAsset}>
            + Add asset
          </button>
        )}
        {activeTab === "prices" && (
          <button style={btnP} onClick={onRefreshSpotPrices} disabled={priceLoading}>
            {priceLoading ? "Loading…" : "🔄 Refresh"}
          </button>
        )}
      </div>
    </div>
  );
}
