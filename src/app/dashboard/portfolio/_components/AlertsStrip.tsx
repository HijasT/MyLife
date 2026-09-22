"use client";

import { fmtN } from "@/lib/portfolio";
import type { PortfolioAlert } from "@/lib/portfolio";
import type { ThemeVars } from "./theme";

export function AlertsStrip({
  V,
  isDark,
  alerts,
  dismissedIds,
  onOpenItem,
  onDismiss,
}: {
  V: ThemeVars;
  isDark: boolean;
  alerts: PortfolioAlert[];
  dismissedIds: string[];
  onOpenItem: (itemId: string) => void;
  onDismiss: (alertId: string) => void;
}) {
  const visible = alerts.filter((a) => !dismissedIds.includes(a.id));
  if (visible.length === 0) return null;

  return (
    <div style={{ padding: "12px 24px 0" }}>
      <div style={{ background: V.card, border: `1px solid ${V.border}`, borderRadius: 12, padding: "10px 14px", boxShadow: V.shadow }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: V.faint, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>🔔 Alerts</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {visible.map((a) => (
            <div
              key={a.id}
              onClick={() => onOpenItem(a.itemId!)}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 10,
                padding: "6px 10px",
                borderRadius: 8,
                cursor: "pointer",
                background: a.triggeredAt ? "rgba(239,68,68,0.08)" : isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
                fontSize: 12,
              }}
            >
              <div>
                <strong style={{ color: V.text }}>
                  {a.itemName} ({a.itemSymbol})
                </strong>{" "}
                <span style={{ color: V.muted }}>
                  {a.alertType === "above" ? "Above" : "Below"} AED {fmtN(a.targetPrice)}
                </span>
                {a.triggeredAt && (
                  <span style={{ color: V.neg, fontWeight: 700, marginLeft: 6 }}>● Triggered</span>
                )}
              </div>
              {a.triggeredAt && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDismiss(a.id);
                  }}
                  style={{ background: "none", border: "none", cursor: "pointer", color: V.faint, fontSize: 11, fontWeight: 700 }}
                >
                  Dismiss
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
