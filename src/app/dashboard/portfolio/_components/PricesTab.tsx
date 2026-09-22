"use client";

import { useState } from "react";
import type { CSSProperties } from "react";
import { fmtN } from "@/lib/portfolio";
import type { ThemeVars } from "./theme";

type LivePriceRow = { bid: number; ask: number; updated: string };

export function PricesTab({
  V,
  btn,
  btnP,
  inp,
  isMobile,
  isDark,
  goldApiKey,
  livePrices,
  customSymbols,
  onSaveApiKey,
  onRemoveApiKey,
  onAddCustomSymbol,
  onRemoveCustomSymbol,
}: {
  V: ThemeVars;
  btn: CSSProperties;
  btnP: CSSProperties;
  inp: CSSProperties;
  isMobile: boolean;
  isDark: boolean;
  goldApiKey: string;
  livePrices: Record<string, LivePriceRow>;
  customSymbols: string[];
  onSaveApiKey: (key: string) => void;
  onRemoveApiKey: () => void;
  onAddCustomSymbol: (symbol: string) => void;
  onRemoveCustomSymbol: (symbol: string) => void;
}) {
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);
  const [goldApiInput, setGoldApiInput] = useState(goldApiKey);
  const [newSymbol, setNewSymbol] = useState("");

  const rows = [
    { key: "XAU_OZ", label: "24K Gold", sub: "1 oz" },
    { key: "XAU_G", label: "24K Gold", sub: "1 g" },
    { key: "XAG_OZ", label: "999 Silver", sub: "1 oz" },
    { key: "XAG_G", label: "999 Silver", sub: "1 g" },
    ...customSymbols.map((s) => ({ key: s, label: s, sub: "" })),
  ];

  return (
    <div style={{ padding: "14px 24px" }}>
      <div style={{ background: V.card, border: `1px solid ${V.border}`, borderRadius: 14, overflow: "hidden", marginBottom: 16 }}>
        <div style={{ padding: "12px 16px", borderBottom: `1px solid ${V.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)" }}>
          <span style={{ fontSize: 14, fontWeight: 800 }}>Spot Prices — AED</span>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {!goldApiKey && <span style={{ fontSize: 11, color: V.neg, fontWeight: 600 }}>⚠ Add goldapi.io key for reliable prices</span>}
            {goldApiKey && <span style={{ fontSize: 11, color: V.pos, fontWeight: 600 }}>✓ goldapi.io</span>}
            <button
              onClick={() => {
                setGoldApiInput(goldApiKey);
                setShowApiKeyInput((v) => !v);
              }}
              style={{ ...btn, padding: "3px 10px", fontSize: 11, color: V.accent }}
            >
              {goldApiKey ? "Change API key" : "🔑 Add API key"}
            </button>
          </div>
        </div>

        {showApiKeyInput && (
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${V.border}`, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", background: isDark ? "rgba(245,166,35,0.04)" : "rgba(245,166,35,0.02)" }}>
            <div style={{ fontSize: 12, color: V.faint, flex: "0 0 auto" }}>goldapi.io key:</div>
            <input
              style={{ ...inp, flex: 1, minWidth: 200, fontFamily: "monospace", fontSize: 12 }}
              type="password"
              value={goldApiInput}
              onChange={(e) => setGoldApiInput(e.target.value)}
              placeholder="goldapi.io/dashboard → copy your key"
            />
            <button
              style={{ ...btnP, padding: "6px 12px", fontSize: 12 }}
              onClick={() => {
                onSaveApiKey(goldApiInput.trim());
                setShowApiKeyInput(false);
              }}
            >
              Save
            </button>
            <button
              style={{ ...btn, padding: "6px 10px", fontSize: 12 }}
              onClick={() => {
                onRemoveApiKey();
                setGoldApiInput("");
                setShowApiKeyInput(false);
              }}
            >
              Remove
            </button>
            <a href="https://www.goldapi.io/" target="_blank" rel="noreferrer" style={{ fontSize: 11, color: V.accent }}>
              Get key →
            </a>
          </div>
        )}

        {!isMobile && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 0.7fr", gap: 8, padding: "8px 16px", fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: V.faint, borderBottom: `1px solid ${V.border}` }}>
            <div>Asset</div>
            <div>Buy (Ask)</div>
            <div>Sell (Bid)</div>
            <div>Updated</div>
          </div>
        )}

        {rows.map((row) => {
          const p = livePrices[row.key];
          return (
            <div key={row.key} style={{ display: "grid", gridTemplateColumns: isMobile ? "1.3fr 1fr 1fr" : "1fr 1fr 1fr 0.7fr", gap: 8, padding: "11px 16px", borderBottom: `1px solid ${V.border}`, alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{row.label}</div>
                <div style={{ fontSize: 11, color: V.faint }}>
                  {row.sub}
                  {isMobile && row.sub ? " · " : ""}
                  {isMobile && (p?.updated ?? "—")}
                </div>
              </div>
              <div style={{ fontSize: 14, fontWeight: 800, color: V.pos }}>{p ? `AED ${fmtN(p.ask)}` : <span style={{ color: V.faint }}>—</span>}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: V.neg }}>{p ? `AED ${fmtN(p.bid)}` : <span style={{ color: V.faint }}>—</span>}</div>
              {!isMobile && <div style={{ fontSize: 11, color: V.faint }}>{p?.updated ?? "—"}</div>}
            </div>
          );
        })}
      </div>

      <div style={{ background: V.card, border: `1px solid ${V.border}`, borderRadius: 12, padding: "14px 16px" }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Custom symbols</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          {customSymbols.map((s) => (
            <div key={s} style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 999, background: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)", fontSize: 12, fontWeight: 600 }}>
              {s}
              <button onClick={() => onRemoveCustomSymbol(s)} style={{ background: "none", border: "none", cursor: "pointer", color: V.faint, fontSize: 14, lineHeight: 1, padding: 0, marginLeft: 2 }}>
                ×
              </button>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            style={{ ...inp, flex: 1 }}
            value={newSymbol}
            onChange={(e) => setNewSymbol(e.target.value)}
            placeholder="e.g. AAPL, PARKIN.DFM, BTC-USD"
            onKeyDown={(e) => {
              if (e.key === "Enter" && newSymbol.trim()) {
                onAddCustomSymbol(newSymbol);
                setNewSymbol("");
              }
            }}
          />
          <button
            style={btnP}
            onClick={() => {
              if (newSymbol.trim()) {
                onAddCustomSymbol(newSymbol);
                setNewSymbol("");
              }
            }}
          >
            Add
          </button>
        </div>
        <div style={{ fontSize: 11, color: V.faint, marginTop: 8 }}>Yahoo Finance symbols: stocks use ticker (AAPL), DFM stocks add .DFM (PARKIN.DFM), crypto add -USD (BTC-USD)</div>
      </div>
    </div>
  );
}
