"use client";

import type { CSSProperties } from "react";
import { fmtDateTime, fmtN, fmtSignedAed } from "@/lib/portfolio";
import type { ItemTransactionInfo, Purchase } from "@/lib/portfolio";
import type { ThemeVars } from "./theme";

export function TransactionHistoryList({
  V,
  isMobile,
  section,
  sHead,
  unitLabel,
  purchases,
  infoByPurchaseId,
  onEdit,
  onDelete,
}: {
  V: ThemeVars;
  isMobile: boolean;
  section: CSSProperties;
  sHead: CSSProperties;
  unitLabel: string;
  purchases: Purchase[];
  infoByPurchaseId: Map<string, ItemTransactionInfo>;
  onEdit: (p: Purchase) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div style={section}>
      <div style={{ ...sHead, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span>Transaction history ({purchases.length})</span>
      </div>

      {purchases.length === 0 && <div style={{ padding: "24px 16px", textAlign: "center", color: V.faint, fontSize: 13 }}>No transactions yet</div>}

      {purchases.map((p, idx) => {
        const row = infoByPurchaseId.get(p.id);
        const plAed = row?.plAed ?? null;
        const isUpP = plAed !== null && plAed >= 0;

        return (
          <div key={p.id} style={{ padding: "13px 16px", borderBottom: idx < purchases.length - 1 ? `1px solid ${V.border}` : "none" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 4, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: p.transactionType === "buy" ? V.pos : V.neg, border: `1px solid ${p.transactionType === "buy" ? "rgba(22,163,74,0.25)" : "rgba(239,68,68,0.25)"}`, padding: "2px 8px", borderRadius: 999 }}>
                    {p.transactionType}
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 700 }}>
                    #{purchases.length - idx} — {fmtN(p.units, 4)} {unitLabel}
                  </span>
                  {p.source && <span style={{ fontSize: 11, color: V.faint }}>via {p.source}</span>}
                </div>

                <div style={{ fontSize: 12, color: V.muted }}>{fmtDateTime(p.purchasedAt)}</div>

                <div style={{ fontSize: 12, color: V.muted, marginTop: 3 }}>
                  Unit price:{" "}
                  <strong style={{ color: V.text }}>
                    {p.currency} {fmtN(p.unitPrice)}
                  </strong>
                  {p.notes && <span style={{ fontStyle: "italic", marginLeft: 10 }}>{p.notes}</span>}
                </div>
              </div>

              <div style={{ textAlign: isMobile ? "left" : "right", width: isMobile ? "100%" : undefined, display: "flex", flexDirection: "column", gap: 4, alignItems: isMobile ? "flex-start" : "flex-end" }}>
                <div style={{ fontSize: 14, fontWeight: 800 }}>
                  {p.transactionType === "sell" ? "Received" : "Paid"}: {p.currency} {fmtN(p.totalPaid)}
                </div>

                {p.currency !== "AED" && row?.amountAed !== undefined && <div style={{ fontSize: 11, color: V.faint }}>≈ AED {fmtN(row.amountAed)}</div>}

                {plAed !== null && (
                  <div style={{ fontSize: 12, fontWeight: 700, color: isUpP ? V.pos : V.neg, marginTop: 2 }}>
                    {row?.plLabel}: {fmtSignedAed(plAed)}
                  </div>
                )}

                <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                  <button onClick={() => onEdit(p)} style={{ padding: isMobile ? "6px 12px" : "3px 9px", borderRadius: 6, border: `1px solid ${V.border}`, background: V.card, color: V.muted, cursor: "pointer", fontSize: 11 }}>
                    Edit
                  </button>
                  <button onClick={() => onDelete(p.id)} style={{ padding: isMobile ? "6px 12px" : "3px 9px", borderRadius: 6, border: "1px solid rgba(239,68,68,0.3)", background: "transparent", color: V.neg, cursor: "pointer", fontSize: 11 }}>
                    Delete
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
