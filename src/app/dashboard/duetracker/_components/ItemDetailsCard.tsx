"use client";

import type { CSSProperties } from "react";
import { type Currency, type DueItem, ordinal } from "@/lib/duetracker";
import type { ThemeVars } from "./theme";

export function ItemDetailsCard({
  V,
  btn,
  btnP,
  inp,
  item,
  editingDates,
  editName,
  editGroup,
  editItemCurrency,
  editIsFixed,
  editStatDay,
  editDueDay,
  onEditingDatesToggle,
  onEditNameChange,
  onEditGroupChange,
  onEditItemCurrencyChange,
  onEditIsFixedChange,
  onEditStatDayChange,
  onEditDueDayChange,
  onSave,
  onDelete,
}: {
  V: ThemeVars;
  btn: CSSProperties;
  btnP: CSSProperties;
  inp: CSSProperties;
  item: DueItem;
  editingDates: boolean;
  editName: string;
  editGroup: string;
  editItemCurrency: Currency;
  editIsFixed: boolean;
  editStatDay: string;
  editDueDay: string;
  onEditingDatesToggle: (next: boolean) => void;
  onEditNameChange: (v: string) => void;
  onEditGroupChange: (v: string) => void;
  onEditItemCurrencyChange: (v: Currency) => void;
  onEditIsFixedChange: (v: boolean) => void;
  onEditStatDayChange: (v: string) => void;
  onEditDueDayChange: (v: string) => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.5px", margin: 0 }}>{item.name}</h1>
        <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999, background: "rgba(239,68,68,0.12)", color: V.accent }}>{item.group}</span>
        {item.isFixed && <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999, background: "rgba(99,102,241,0.1)", color: "#6366f1" }}>Fixed</span>}
        <div style={{ fontSize: 12, color: V.faint, marginTop: 2 }}>When a month is partial or pending, the unpaid amount is carried into the next month on top of the regular monthly due.</div>
      </div>

      <div style={{ background: V.card, border: `1px solid ${V.border}`, borderRadius: 12, padding: "14px 16px", marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: editingDates ? 12 : 0, gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            {!editingDates ? (
              <>
                {item.statementDay ? (
                  <span style={{ fontSize: 13, fontWeight: 700 }}>
                    📋 Statement: <span style={{ color: "#ef4444" }}>{ordinal(item.statementDay)}</span>
                  </span>
                ) : (
                  <span style={{ fontSize: 13, color: V.faint }}>No statement date</span>
                )}
                {item.dueDay ? (
                  <span style={{ fontSize: 13, fontWeight: 700 }}>
                    📅 Due: <span style={{ color: "#ef4444" }}>{ordinal(item.dueDay)}</span>
                  </span>
                ) : (
                  <span style={{ fontSize: 13, color: V.faint }}>No due date</span>
                )}
              </>
            ) : (
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, fontWeight: 600 }}>
                  <span style={{ color: "#ef4444" }}>Name:</span>
                  <input style={{ ...inp, width: 160, padding: "5px 8px" }} value={editName} onChange={(e) => onEditNameChange(e.target.value)} />
                </label>
                <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, fontWeight: 600 }}>
                  <span style={{ color: "#ef4444" }}>Group:</span>
                  <input style={{ ...inp, width: 110, padding: "5px 8px" }} value={editGroup} onChange={(e) => onEditGroupChange(e.target.value)} />
                </label>
                <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, fontWeight: 600 }}>
                  <span style={{ color: "#ef4444" }}>Currency:</span>
                  <select style={{ ...inp, width: 80, padding: "5px 8px" }} value={editItemCurrency} onChange={(e) => onEditItemCurrencyChange(e.target.value as Currency)}>
                    <option>AED</option>
                    <option>INR</option>
                    <option>USD</option>
                  </select>
                </label>
                <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, fontWeight: 600 }}>
                  <input type="checkbox" checked={editIsFixed} onChange={(e) => onEditIsFixedChange(e.target.checked)} />
                  Fixed
                </label>
                <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, fontWeight: 600 }}>
                  <span style={{ color: "#ef4444" }}>Statement day:</span>
                  <input type="number" min="1" max="31" style={{ ...inp, width: 70, padding: "5px 8px" }} value={editStatDay} onChange={(e) => onEditStatDayChange(e.target.value)} />
                </label>
                <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, fontWeight: 600 }}>
                  <span style={{ color: "#ef4444" }}>Due day:</span>
                  <input type="number" min="1" max="31" style={{ ...inp, width: 70, padding: "5px 8px" }} value={editDueDay} onChange={(e) => onEditDueDayChange(e.target.value)} />
                </label>
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {editingDates ? (
              <>
                <button style={btnP} onClick={onSave}>
                  Save
                </button>
                <button style={btn} onClick={() => onEditingDatesToggle(false)}>
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button style={btn} onClick={() => onEditingDatesToggle(true)}>
                  Edit details
                </button>
                <button style={{ ...btn, color: V.neg }} onClick={onDelete}>
                  Delete
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
