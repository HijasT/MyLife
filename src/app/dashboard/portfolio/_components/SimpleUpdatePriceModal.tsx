"use client";

import { useState } from "react";
import type { CSSProperties } from "react";
import type { PortfolioItem } from "@/lib/portfolio";
import type { ThemeVars } from "./theme";
import { Modal } from "./Modal";

export function SimpleUpdatePriceModal({
  V,
  btn,
  btnPrimary,
  inp,
  lbl,
  item,
  onClose,
  onSubmit,
}: {
  V: ThemeVars;
  btn: CSSProperties;
  btnPrimary: CSSProperties;
  inp: CSSProperties;
  lbl: CSSProperties;
  item: PortfolioItem;
  onClose: () => void;
  onSubmit: (price: string) => void;
}) {
  const [price, setPrice] = useState(item.currentPrice?.toString() ?? "");

  return (
    <Modal
      V={V}
      btn={btn}
      title="Current price"
      onClose={onClose}
      align="center"
      width={380}
      footer={
        <>
          <button style={btn} onClick={onClose}>
            Cancel
          </button>
          <button style={btnPrimary} onClick={() => onSubmit(price)}>
            Update
          </button>
        </>
      }
    >
      <label style={lbl}>
        {item.mainCurrency} per {item.unitLabel}
        <input type="text" inputMode="decimal" style={inp} value={price} onChange={(e) => setPrice(e.target.value)} autoFocus />
      </label>
    </Modal>
  );
}
