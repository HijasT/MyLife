"use client";

import { useState } from "react";
import type { CSSProperties } from "react";
import { PURITY_FACTOR, fmtN, toAed } from "@/lib/portfolio";
import type { PortfolioItem } from "@/lib/portfolio";
import type { ThemeVars } from "./theme";
import { Modal } from "./Modal";

export function UpdatePriceModal({
  V,
  btn,
  btnP,
  inp,
  lbl,
  item,
  onClose,
  onSubmit,
}: {
  V: ThemeVars;
  btn: CSSProperties;
  btnP: CSSProperties;
  inp: CSSProperties;
  lbl: CSSProperties;
  item: PortfolioItem;
  onClose: () => void;
  onSubmit: (price: string, goldPurity: string, goldWeight: string) => void;
}) {
  const [price, setPrice] = useState(item.currentPrice?.toString() ?? "");
  const [goldPurity, setGoldPurity] = useState((item.goldPurityKarat ?? 24).toString());
  const [goldWeight, setGoldWeight] = useState(item.weightGrams?.toString() ?? "");
  const isGold = item.assetType === "gold";

  const preview = (() => {
    if (!isGold || !price || !goldWeight || !goldPurity) return null;
    const factor = PURITY_FACTOR[Number(goldPurity)] ?? 1;
    const computedRaw = Number(price) * Number(goldWeight) * factor;
    return { value: toAed(computedRaw, item.mainCurrency), factor };
  })();

  return (
    <Modal
      V={V}
      btn={btn}
      title={`${isGold ? "Update gold" : "Update price"} — ${item.name}`}
      onClose={onClose}
      width={380}
      footer={
        <>
          <button style={btn} onClick={onClose}>
            Cancel
          </button>
          <button style={btnP} onClick={() => onSubmit(price, goldPurity, goldWeight)}>
            Save
          </button>
        </>
      }
    >
      <label style={lbl}>
        {item.mainCurrency} per {item.unitLabel}
        {isGold && <span style={{ fontSize: 10, color: V.faint, fontWeight: 400, textTransform: "none", marginLeft: 6 }}>(spot price per gram of pure 24K)</span>}
        <input type="text" inputMode="decimal" style={inp} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="e.g. 9500" autoFocus />
      </label>

      {isGold && (
        <>
          <label style={lbl}>
            Purity
            <select style={inp} value={goldPurity} onChange={(e) => setGoldPurity(e.target.value)}>
              <option value="24">24K (99.9%)</option>
              <option value="22">22K (91.6%)</option>
              <option value="21">21K (87.5%)</option>
              <option value="18">18K (75%)</option>
            </select>
          </label>
          <label style={lbl}>
            Weight (grams)
            <input type="text" inputMode="decimal" style={inp} value={goldWeight} onChange={(e) => setGoldWeight(e.target.value)} placeholder="e.g. 10.5" />
          </label>
          {preview && (
            <div style={{ padding: "10px 12px", background: V.goldSoft, borderRadius: 10, border: "1px solid rgba(255,215,0,0.3)", fontSize: 12 }}>
              <div style={{ color: V.muted, marginBottom: 4 }}>Calculated current value:</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: V.gold }}>AED {fmtN(preview.value)}</div>
              <div style={{ color: V.faint, fontSize: 10, marginTop: 4 }}>
                = {goldWeight}g × AED {price}/g × {(preview.factor * 100).toFixed(1)}%
              </div>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
