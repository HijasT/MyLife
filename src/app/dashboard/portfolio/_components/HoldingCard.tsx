"use client";

import type { CSSProperties } from "react";
import { ASSET_ICONS, fmtN, fmtSignedAed } from "@/lib/portfolio";
import type { ItemStats, PortfolioItem, Purchase } from "@/lib/portfolio";
import type { ThemeVars } from "./theme";

export function HoldingCard({
  V,
  btn,
  isDark,
  isMobile,
  item,
  stats,
  currentValue,
  pl,
  activeAlertCount,
  isExpanded,
  transactions,
  onOpenDetail,
  onToggleExpand,
  onUpdatePrice,
  onDelete,
}: {
  V: ThemeVars;
  btn: CSSProperties;
  isDark: boolean;
  isMobile: boolean;
  item: PortfolioItem;
  stats: ItemStats;
  currentValue: number | null;
  pl: number | null;
  activeAlertCount: number;
  isExpanded: boolean;
  transactions: Purchase[] | undefined;
  onOpenDetail: () => void;
  onToggleExpand: () => void;
  onUpdatePrice: () => void;
  onDelete: () => void;
}) {
  const plPct = pl !== null && stats.costBasisAed > 0 ? (pl / stats.costBasisAed) * 100 : null;
  const up = pl !== null && pl >= 0;

  return (
    <div
      onClick={onOpenDetail}
      style={{ background: V.card, border: `1px solid ${V.border}`, borderRadius: 14, padding: "16px 18px", cursor: "pointer", transition: "border-color 0.15s" }}
      onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.borderColor = "rgba(235,102,7,0.4)")}
      onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.borderColor = V.border)}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: `${V.accent}15`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>{ASSET_ICONS[item.assetType]}</div>

          <div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 16, fontWeight: 800 }}>{item.name}</span>
              <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "rgba(245,166,35,0.1)", color: V.accent }}>{item.symbol}</span>
              {activeAlertCount > 0 && (
                <span title={`${activeAlertCount} active alert${activeAlertCount > 1 ? "s" : ""}`} style={{ fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 999, background: "rgba(59,130,246,0.14)", color: "#3b82f6", display: "inline-flex", alignItems: "center", gap: 3 }}>
                  🔔 {activeAlertCount}
                </span>
              )}
              {item.livePriceSymbol && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)", color: V.faint }}>{item.livePriceSymbol}</span>}
              {item.assetType === "gold" && (item.goldPurityKarat || item.weightGrams) && (
                <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 999, background: V.goldSoft, color: V.gold, border: "1px solid rgba(255,215,0,0.3)" }}>
                  {item.goldPurityKarat ? `${item.goldPurityKarat}K` : ""}
                  {item.goldPurityKarat && item.weightGrams ? " · " : ""}
                  {item.weightGrams ? `${item.weightGrams}g` : ""}
                </span>
              )}
            </div>

            <div style={{ fontSize: 12, color: V.faint, marginTop: 2 }}>
              {fmtN(stats.totalUnits, 4)} {item.unitLabel} · Avg AED {fmtN(stats.avgUnitPrice)} / {item.unitLabel}
            </div>

            {item.currentPrice && (
              <div style={{ fontSize: 12, color: V.muted, marginTop: 1 }}>
                Price: <strong style={{ color: V.text }}>AED {fmtN(item.currentPrice)}</strong>
                {item.currentPriceUpdatedAt && <span style={{ color: V.faint, marginLeft: 6 }}>{new Date(item.currentPriceUpdatedAt).toLocaleDateString("en-AE")}</span>}
              </div>
            )}
          </div>
        </div>

        <div style={{ textAlign: isMobile ? "left" : "right", width: isMobile ? "100%" : undefined }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: V.text }}>{currentValue !== null ? `AED ${fmtN(currentValue)}` : <span style={{ color: V.faint }}>No price</span>}</div>

          {pl !== null && plPct !== null && (
            <div style={{ fontSize: 13, fontWeight: 700, color: up ? V.pos : V.neg, marginTop: 2 }}>
              {fmtSignedAed(pl)} ({plPct >= 0 ? "+" : ""}
              {plPct.toFixed(2)}%)
            </div>
          )}

          <div style={{ fontSize: 11, color: V.faint, marginTop: 2 }}>Invested: AED {fmtN(stats.costBasisAed)}</div>

          <div style={{ display: "flex", justifyContent: isMobile ? "flex-start" : "flex-end", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpand();
              }}
              style={{ ...btn, padding: "3px 10px", fontSize: 10 }}
            >
              {isExpanded ? "▲ Hide" : "▼ History"}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onUpdatePrice();
              }}
              style={{ ...btn, padding: "3px 10px", fontSize: 10 }}
            >
              Update price
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              style={{ ...btn, padding: isMobile ? "6px 12px" : "3px 10px", minHeight: undefined, fontSize: 10, color: V.neg, borderColor: "rgba(239,68,68,0.3)" }}
            >
              Delete
            </button>
          </div>
        </div>
      </div>

      {isExpanded && (
        <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 14, paddingTop: 14, borderTop: `1px dashed ${V.border}` }}>
          <div style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: V.faint, marginBottom: 8, display: "flex", justifyContent: "space-between" }}>
            <span>Transaction history</span>
            <span>{(transactions ?? []).length} transactions</span>
          </div>
          {!transactions ? (
            <div style={{ fontSize: 12, color: V.faint, padding: "10px 0", textAlign: "center" }}>Loading…</div>
          ) : transactions.length === 0 ? (
            <div style={{ fontSize: 12, color: V.faint, padding: "10px 0", textAlign: "center" }}>No transactions yet</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 260, overflowY: "auto" }}>
              {transactions.map((tx) => {
                const isSell = tx.transactionType === "sell";
                return (
                  <div key={tx.id} style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: isMobile ? 6 : 0, justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "center", padding: "8px 12px", background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)", borderRadius: 8, fontSize: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ padding: "2px 8px", borderRadius: 999, background: isSell ? V.negSoft : V.posSoft, color: isSell ? V.neg : V.pos, fontWeight: 800, fontSize: 10 }}>{isSell ? "SELL" : "BUY"}</span>
                      <div>
                        <div style={{ fontWeight: 600, color: V.text }}>
                          {fmtN(tx.units, 4)} {item.unitLabel} @ {tx.currency} {fmtN(tx.unitPrice)}
                        </div>
                        <div style={{ fontSize: 10, color: V.faint }}>
                          {new Date(tx.purchasedAt).toLocaleDateString("en-AE", { year: "numeric", month: "short", day: "numeric" })}
                          {tx.source ? ` · ${tx.source}` : ""}
                        </div>
                      </div>
                    </div>
                    <div style={{ fontWeight: 700, color: isSell ? V.pos : V.text, marginLeft: isMobile ? 46 : 0 }}>
                      {isSell ? "+" : ""}
                      {tx.currency} {fmtN(tx.totalPaid)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div style={{ marginTop: 10, textAlign: "center" }}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onOpenDetail();
              }}
              style={{ ...btn, padding: "5px 14px", fontSize: 11, color: V.accent, borderColor: V.accent + "44" }}
            >
              View full detail →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
