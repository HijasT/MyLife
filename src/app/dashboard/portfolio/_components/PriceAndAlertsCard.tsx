"use client";

import type { CSSProperties } from "react";
import { fmtDate, fmtDateTime, fmtN } from "@/lib/portfolio";
import type { PortfolioAlert, PortfolioItem } from "@/lib/portfolio";
import type { ThemeVars } from "./theme";

const LIVE_PRICE_OPTIONS = [
  { value: "", label: "None — manual price update" },
  { value: "XAU_OZ", label: "24K Gold — 1 oz (AED)" },
  { value: "XAU_G", label: "24K Gold — 1 g (AED)" },
  { value: "XAG_OZ", label: "999 Silver — 1 oz (AED)" },
  { value: "XAG_G", label: "999 Silver — 1 g (AED)" },
  { value: "PARKIN.DFM", label: "Parkin (DFM)" },
];

export function PriceAndAlertsCard({
  V,
  btn,
  btnPrimary,
  inp,
  section,
  sHead,
  isMobile,
  item,
  alerts,
  livePriceSymbolInput,
  savingLiveLink,
  fetchingLinkedPrice,
  onLivePriceSymbolChange,
  onSaveLiveLink,
  onFetchLinkedPrice,
  onDeleteAlert,
}: {
  V: ThemeVars;
  btn: CSSProperties;
  btnPrimary: CSSProperties;
  inp: CSSProperties;
  section: CSSProperties;
  sHead: CSSProperties;
  isMobile: boolean;
  item: PortfolioItem;
  alerts: PortfolioAlert[];
  livePriceSymbolInput: string;
  savingLiveLink: boolean;
  fetchingLinkedPrice: boolean;
  onLivePriceSymbolChange: (value: string) => void;
  onSaveLiveLink: () => void;
  onFetchLinkedPrice: () => void;
  onDeleteAlert: (id: string) => void;
}) {
  const busy = savingLiveLink || fetchingLinkedPrice;

  return (
    <div style={section}>
      <div style={sHead}>Price &amp; alerts</div>
      <div style={{ padding: "14px 16px", display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.2fr 1fr", gap: 16 }}>
        <div>
          {item.currentPrice ? (
            <>
              <div style={{ fontSize: 20, fontWeight: 800, color: V.accent }}>
                AED {fmtN(item.currentPrice)} / {item.unitLabel}
              </div>
              {item.currentPriceUpdatedAt && <div style={{ fontSize: 11, color: V.faint, marginTop: 4 }}>Updated {fmtDate(item.currentPriceUpdatedAt)}</div>}
            </>
          ) : (
            <span style={{ fontSize: 13, color: V.faint }}>No current price set, click Update price to set it</span>
          )}

          <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: V.faint, textTransform: "uppercase", letterSpacing: "0.08em" }}>Live price link</div>
            <select style={inp} value={livePriceSymbolInput} onChange={(e) => onLivePriceSymbolChange(e.target.value)}>
              {LIVE_PRICE_OPTIONS.map((opt) => (
                <option key={opt.value || "none"} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" disabled={busy} style={{ ...btn, padding: "6px 12px", fontSize: 12, opacity: busy ? 0.65 : 1, cursor: busy ? "not-allowed" : "pointer" }} onClick={onSaveLiveLink}>
                {savingLiveLink ? "Saving..." : "Save link"}
              </button>
              <button type="button" disabled={busy} style={{ ...btnPrimary, padding: "6px 12px", fontSize: 12, opacity: busy ? 0.65 : 1, cursor: busy ? "not-allowed" : "pointer" }} onClick={onFetchLinkedPrice}>
                {fetchingLinkedPrice ? "Fetching..." : "Fetch linked price"}
              </button>
            </div>
            {(item.livePriceSymbol || livePriceSymbolInput) && <div style={{ fontSize: 11, color: V.faint }}>Current link: {livePriceSymbolInput || item.livePriceSymbol}</div>}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: V.faint, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Active alerts</div>
          {alerts.length === 0 ? (
            <div style={{ fontSize: 12, color: V.faint }}>No alerts yet</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {alerts.map((a) => (
                <div key={a.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, border: `1px solid ${V.border}`, borderRadius: 10, padding: "8px 10px" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>
                      {a.alertType === "above" ? "Above" : "Below"} AED {fmtN(a.targetPrice)}
                    </div>
                    <div style={{ fontSize: 11, color: a.triggeredAt ? V.neg : V.faint }}>{a.triggeredAt ? `Triggered ${fmtDateTime(a.triggeredAt)}` : a.isActive ? "Active" : "Inactive"}</div>
                  </div>
                  <button onClick={() => onDeleteAlert(a.id)} style={{ ...btn, minHeight: undefined, padding: "4px 8px", fontSize: 11, color: V.neg, borderColor: "rgba(239,68,68,0.3)" }}>
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
