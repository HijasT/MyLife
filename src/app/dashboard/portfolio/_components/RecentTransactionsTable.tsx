"use client";

import type { CSSProperties } from "react";
import { fmtN } from "@/lib/portfolio";
import type { Purchase } from "@/lib/portfolio";
import type { ThemeVars } from "./theme";

export function RecentTransactionsTable({
  V,
  btn,
  isDark,
  isMobile,
  recent,
  hasMore,
  loadingMore,
  onLoadMore,
}: {
  V: ThemeVars;
  btn: CSSProperties;
  isDark: boolean;
  isMobile: boolean;
  recent: Purchase[];
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}) {
  if (recent.length === 0) return null;

  return (
    <div style={{ margin: "0 24px 24px", background: V.card, border: `1px solid ${V.border}`, borderRadius: 14, overflow: "hidden" }}>
      <div style={{ padding: "11px 16px", borderBottom: `1px solid ${V.border}`, fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", color: V.faint, background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)" }}>
        Recent transactions
      </div>

      {!isMobile && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 0.6fr 0.7fr 0.8fr 0.8fr", gap: 8, padding: "8px 16px", fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: V.faint, borderBottom: `1px solid ${V.border}` }}>
          <div>Asset</div>
          <div>Type</div>
          <div>Units</div>
          <div>Amount</div>
          <div>Date</div>
        </div>
      )}

      {recent.map((p) => {
        const typeNode = (
          <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: p.transactionType === "buy" ? V.pos : V.neg }}>{p.transactionType}</span>
        );
        if (isMobile) {
          return (
            <div key={p.id} style={{ padding: "12px 16px", borderBottom: `1px solid ${V.border}`, display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>
                  {p.itemName} <span style={{ fontSize: 11, color: V.faint, fontWeight: 400 }}>({p.itemSymbol})</span>
                </div>
                {typeNode}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, color: V.muted }}>
                <span>{fmtN(p.units, 4)} units</span>
                <span style={{ fontSize: 11, color: V.faint }}>{new Date(p.purchasedAt).toLocaleDateString("en-AE")}</span>
              </div>
              <div style={{ fontWeight: 700, fontSize: 13 }}>
                {p.transactionType === "sell" ? "Received: " : "Paid: "}
                {p.currency} {fmtN(p.totalPaid)}
              </div>
            </div>
          );
        }
        return (
          <div key={p.id} style={{ display: "grid", gridTemplateColumns: "1fr 0.6fr 0.7fr 0.8fr 0.8fr", gap: 8, padding: "10px 16px", borderBottom: `1px solid ${V.border}`, fontSize: 13, alignItems: "center" }}>
            <div style={{ fontWeight: 700 }}>
              {p.itemName} <span style={{ fontSize: 11, color: V.faint }}>({p.itemSymbol})</span>
            </div>
            <div>{typeNode}</div>
            <div style={{ color: V.muted }}>{fmtN(p.units, 4)}</div>
            <div style={{ fontWeight: 700 }}>
              {p.transactionType === "sell" ? "Received: " : "Paid: "}
              {p.currency} {fmtN(p.totalPaid)}
            </div>
            <div style={{ fontSize: 11, color: V.faint }}>{new Date(p.purchasedAt).toLocaleDateString("en-AE")}</div>
          </div>
        );
      })}

      {hasMore && (
        <div style={{ padding: "12px 16px", textAlign: "center" }}>
          <button style={btn} onClick={onLoadMore} disabled={loadingMore}>
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}
