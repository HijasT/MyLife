"use client";

import { useState } from "react";
import type { CSSProperties } from "react";
import type { AssetType, Currency } from "@/lib/portfolio";
import type { ThemeVars } from "./theme";
import { Modal } from "./Modal";

const LIVE_PRICE_OPTIONS = [
  { value: "", label: "None — manual price update" },
  { value: "XAU_OZ", label: "24K Gold — 1 oz (AED)" },
  { value: "XAU_G", label: "24K Gold — 1 g (AED)" },
  { value: "XAG_OZ", label: "999 Silver — 1 oz (AED)" },
  { value: "XAG_G", label: "999 Silver — 1 g (AED)" },
  { value: "PARKIN.DFM", label: "Parkin (DFM)" },
];

export type NewItemInput = {
  symbol: string;
  name: string;
  assetType: AssetType;
  unitLabel: string;
  mainCurrency: Currency;
  notes: string;
  livePriceSymbol: string;
  goldPurityKarat: string;
  weightGrams: string;
};

export function AddItemModal({
  V,
  btn,
  btnP,
  inp,
  lbl,
  isMobile,
  customSymbols,
  onClose,
  onSubmit,
}: {
  V: ThemeVars;
  btn: CSSProperties;
  btnP: CSSProperties;
  inp: CSSProperties;
  lbl: CSSProperties;
  isMobile: boolean;
  customSymbols: string[];
  onClose: () => void;
  onSubmit: (item: NewItemInput) => void;
}) {
  const [item, setItem] = useState<NewItemInput>({
    symbol: "",
    name: "",
    assetType: "other",
    unitLabel: "unit",
    mainCurrency: "AED",
    notes: "",
    livePriceSymbol: "",
    goldPurityKarat: "24",
    weightGrams: "",
  });

  const liveOptions = [...LIVE_PRICE_OPTIONS, ...customSymbols.filter((s) => !LIVE_PRICE_OPTIONS.some((o) => o.value === s)).map((s) => ({ value: s, label: s }))];

  return (
    <Modal
      V={V}
      btn={btn}
      title="Add asset"
      onClose={onClose}
      align="flex-start"
      footer={
        <>
          <button style={btn} onClick={onClose}>
            Cancel
          </button>
          <button style={btnP} onClick={() => onSubmit(item)}>
            Add
          </button>
        </>
      }
    >
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 14 }}>
        <label style={lbl}>
          Symbol
          <input style={inp} value={item.symbol} onChange={(e) => setItem((p) => ({ ...p, symbol: e.target.value }))} placeholder="e.g. XAU" />
        </label>
        <label style={lbl}>
          Name
          <input style={inp} value={item.name} onChange={(e) => setItem((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. Gold" />
        </label>
        <label style={lbl}>
          Type
          <select style={inp} value={item.assetType} onChange={(e) => setItem((p) => ({ ...p, assetType: e.target.value as AssetType }))}>
            <option value="gold">Gold</option>
            <option value="silver">Silver</option>
            <option value="stock">Stock</option>
            <option value="crypto">Crypto</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label style={lbl}>
          Unit
          <input style={inp} value={item.unitLabel} onChange={(e) => setItem((p) => ({ ...p, unitLabel: e.target.value }))} placeholder="oz, share…" />
        </label>
        <label style={lbl}>
          Currency
          <select style={inp} value={item.mainCurrency} onChange={(e) => setItem((p) => ({ ...p, mainCurrency: e.target.value as Currency }))}>
            <option>AED</option>
            <option>USD</option>
            <option>INR</option>
            <option>GBP</option>
            <option>EUR</option>
          </select>
        </label>
        <label style={{ ...lbl, gridColumn: "1/-1" }}>
          Live price link
          <select style={inp} value={item.livePriceSymbol} onChange={(e) => setItem((p) => ({ ...p, livePriceSymbol: e.target.value }))}>
            {liveOptions.map((opt) => (
              <option key={opt.value || "none"} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <span style={{ fontSize: 11, color: V.faint, marginTop: 2 }}>Asset current price will auto-update from Live Prices tab using the Bid/Sell rate.</span>
        </label>

        {item.assetType === "gold" && (
          <>
            <label style={lbl}>
              Purity
              <select style={inp} value={item.goldPurityKarat} onChange={(e) => setItem((p) => ({ ...p, goldPurityKarat: e.target.value }))}>
                <option value="24">24K (pure, 99.9%)</option>
                <option value="22">22K (91.6%)</option>
                <option value="21">21K (87.5%)</option>
                <option value="18">18K (75%)</option>
              </select>
            </label>
            <label style={lbl}>
              Weight (grams)
              <input type="text" inputMode="decimal" style={inp} value={item.weightGrams} onChange={(e) => setItem((p) => ({ ...p, weightGrams: e.target.value }))} placeholder="e.g. 10.5" />
            </label>
          </>
        )}

        <label style={{ ...lbl, gridColumn: "1/-1" }}>
          Notes
          <input style={inp} value={item.notes} onChange={(e) => setItem((p) => ({ ...p, notes: e.target.value }))} />
        </label>
      </div>
    </Modal>
  );
}
