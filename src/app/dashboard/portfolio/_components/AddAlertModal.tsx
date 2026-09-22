"use client";

import { useState } from "react";
import type { CSSProperties } from "react";
import type { AlertType } from "@/lib/portfolio";
import type { ThemeVars } from "./theme";
import { Modal } from "./Modal";

export function AddAlertModal({
  V,
  btn,
  btnPrimary,
  inp,
  lbl,
  currency,
  onClose,
  onSubmit,
}: {
  V: ThemeVars;
  btn: CSSProperties;
  btnPrimary: CSSProperties;
  inp: CSSProperties;
  lbl: CSSProperties;
  currency: string;
  onClose: () => void;
  onSubmit: (alertType: AlertType, targetPrice: string) => void;
}) {
  const [alertType, setAlertType] = useState<AlertType>("above");
  const [targetPrice, setTargetPrice] = useState("");

  return (
    <Modal
      V={V}
      btn={btn}
      title="Add alert"
      onClose={onClose}
      width={420}
      footer={
        <>
          <button style={btn} onClick={onClose}>
            Cancel
          </button>
          <button style={btnPrimary} onClick={() => onSubmit(alertType, targetPrice)}>
            Save alert
          </button>
        </>
      }
    >
      <label style={lbl}>
        Alert type
        <select style={inp} value={alertType} onChange={(e) => setAlertType(e.target.value as AlertType)}>
          <option value="above">Above price</option>
          <option value="below">Below price</option>
        </select>
      </label>
      <label style={lbl}>
        Target price ({currency})
        <input type="text" inputMode="decimal" style={inp} value={targetPrice} onChange={(e) => setTargetPrice(e.target.value)} />
      </label>
    </Modal>
  );
}
