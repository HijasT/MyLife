"use client";

import { useState } from "react";
import type { CSSProperties } from "react";
import type { Currency } from "@/lib/duetracker";
import type { ThemeVars } from "./theme";
import { Modal } from "./Modal";

export type NewDueItemInput = {
  name: string;
  group: string;
  statementDay: string;
  dueDay: string;
  defaultCurrency: Currency;
  defaultAmount: string;
  isFixed: boolean;
};

export function AddDueModal({
  V,
  btn,
  btnP,
  inp,
  isMobile,
  groups,
  onClose,
  onSubmit,
}: {
  V: ThemeVars;
  btn: CSSProperties;
  btnP: CSSProperties;
  inp: CSSProperties;
  isMobile: boolean;
  groups: string[];
  onClose: () => void;
  onSubmit: (item: NewDueItemInput) => void;
}) {
  const [item, setItem] = useState<NewDueItemInput>({
    name: "",
    group: groups[0] ?? "UAE",
    statementDay: "",
    dueDay: "",
    defaultCurrency: "AED",
    defaultAmount: "",
    isFixed: false,
  });

  return (
    <Modal
      V={V}
      btn={btn}
      title="Add due item"
      onClose={onClose}
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
        <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12, fontWeight: 700, color: V.muted, textTransform: "uppercase", letterSpacing: "0.06em", gridColumn: "1/-1" }}>
          Name
          <input style={{ ...inp, width: "100%", boxSizing: "border-box" }} value={item.name} onChange={(e) => setItem((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. Rent" />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12, fontWeight: 700, color: V.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Group
          <select style={inp} value={item.group} onChange={(e) => setItem((p) => ({ ...p, group: e.target.value }))}>
            {groups.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12, fontWeight: 700, color: V.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Currency
          <select style={inp} value={item.defaultCurrency} onChange={(e) => setItem((p) => ({ ...p, defaultCurrency: e.target.value as Currency }))}>
            <option>AED</option>
            <option>INR</option>
            <option>USD</option>
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12, fontWeight: 700, color: V.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Statement day
          <input style={inp} type="number" min="1" max="31" value={item.statementDay} onChange={(e) => setItem((p) => ({ ...p, statementDay: e.target.value }))} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12, fontWeight: 700, color: V.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Due day
          <input style={inp} type="number" min="1" max="31" value={item.dueDay} onChange={(e) => setItem((p) => ({ ...p, dueDay: e.target.value }))} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12, fontWeight: 700, color: V.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Default amount
          <input style={inp} type="text" inputMode="decimal" value={item.defaultAmount} onChange={(e) => setItem((p) => ({ ...p, defaultAmount: e.target.value }))} />
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, fontWeight: 600, color: V.text, cursor: "pointer" }}>
          <input type="checkbox" checked={item.isFixed} onChange={(e) => setItem((p) => ({ ...p, isFixed: e.target.checked }))} />
          Fixed (repeats each month)
        </label>
      </div>
    </Modal>
  );
}
