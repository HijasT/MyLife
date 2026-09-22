"use client";

import type { CSSProperties } from "react";
import type { Currency, PortfolioItem, TxType } from "@/lib/portfolio";
import type { ThemeVars } from "./theme";
import { Modal } from "./Modal";

export type TransactionFormState = {
  transactionType: TxType;
  purchasedAt: string;
  unitPrice: string;
  units: string;
  totalPaid: string;
  currency: Currency;
  source: string;
  notes: string;
};

export function AddEditTransactionModal({
  V,
  btn,
  btnPrimary,
  inp,
  lbl,
  isMobile,
  item,
  isEditing,
  form,
  onChange,
  onClose,
  onSubmit,
}: {
  V: ThemeVars;
  btn: CSSProperties;
  btnPrimary: CSSProperties;
  inp: CSSProperties;
  lbl: CSSProperties;
  isMobile: boolean;
  item: PortfolioItem;
  isEditing: boolean;
  form: TransactionFormState;
  onChange: (next: TransactionFormState) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <Modal
      V={V}
      btn={btn}
      title={isEditing ? "Edit transaction" : "Add transaction"}
      subtitle={item.symbol}
      onClose={onClose}
      width={560}
      footer={
        <>
          <button style={btn} onClick={onClose}>
            Cancel
          </button>
          <button style={btnPrimary} onClick={onSubmit}>
            {isEditing ? "Update" : `Save ${form.transactionType}`}
          </button>
        </>
      }
    >
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 14 }}>
        <label style={{ ...lbl, gridColumn: "1/-1" }}>
          Type
          <select style={inp} value={form.transactionType} onChange={(e) => onChange({ ...form, transactionType: e.target.value as TxType })}>
            <option value="buy">Buy</option>
            <option value="sell">Sell</option>
          </select>
        </label>

        <label style={{ ...lbl, gridColumn: "1/-1" }}>
          Date &amp; time
          <input type="datetime-local" style={inp} value={form.purchasedAt} onChange={(e) => onChange({ ...form, purchasedAt: e.target.value })} />
        </label>

        <label style={lbl}>
          Unit price ({item.mainCurrency} per {item.unitLabel})
          <input
            type="text"
            inputMode="decimal"
            style={inp}
            value={form.unitPrice}
            onChange={(e) => {
              const unitPrice = e.target.value;
              onChange({
                ...form,
                unitPrice,
                totalPaid: form.units ? String(((parseFloat(unitPrice) || 0) * (parseFloat(form.units) || 0)).toFixed(2)) : form.totalPaid,
              });
            }}
          />
        </label>

        <label style={lbl}>
          Units {form.transactionType === "sell" ? "sold" : "purchased"}
          <input
            type="text"
            inputMode="decimal"
            style={inp}
            value={form.units}
            onChange={(e) => {
              const units = e.target.value;
              onChange({
                ...form,
                units,
                totalPaid: form.unitPrice ? String(((parseFloat(form.unitPrice) || 0) * (parseFloat(units) || 0)).toFixed(2)) : form.totalPaid,
              });
            }}
          />
        </label>

        <label style={lbl}>
          Total {form.transactionType === "sell" ? "received" : "paid"}
          <input type="text" inputMode="decimal" style={inp} value={form.totalPaid} onChange={(e) => onChange({ ...form, totalPaid: e.target.value })} />
        </label>

        <label style={lbl}>
          Currency
          <select style={inp} value={form.currency} onChange={(e) => onChange({ ...form, currency: e.target.value as Currency })}>
            <option>AED</option>
            <option>USD</option>
            <option>INR</option>
            <option>GBP</option>
            <option>EUR</option>
          </select>
        </label>

        <label style={{ ...lbl, gridColumn: "1/-1" }}>
          Broker / platform
          <input style={inp} value={form.source} onChange={(e) => onChange({ ...form, source: e.target.value })} />
        </label>

        <label style={{ ...lbl, gridColumn: "1/-1" }}>
          Notes (optional)
          <input style={inp} value={form.notes} onChange={(e) => onChange({ ...form, notes: e.target.value })} />
        </label>
      </div>
    </Modal>
  );
}
