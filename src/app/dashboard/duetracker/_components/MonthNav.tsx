"use client";

import type { CSSProperties } from "react";
import type { FilterKey, SortKey } from "../types";
import type { ThemeVars } from "./theme";

export function MonthNav({
  V,
  btn,
  inp,
  monthLabel,
  filter,
  sortBy,
  onPrev,
  onNext,
  onToday,
  onFilterChange,
  onSortChange,
}: {
  V: ThemeVars;
  btn: CSSProperties;
  inp: CSSProperties;
  monthLabel: string;
  filter: FilterKey;
  sortBy: SortKey;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onFilterChange: (filter: FilterKey) => void;
  onSortChange: (sort: SortKey) => void;
}) {
  return (
    <div style={{ padding: "14px 24px 0", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      <button style={btn} onClick={onPrev} aria-label="Previous month">
        ‹
      </button>
      <span style={{ fontSize: 18, fontWeight: 700, minWidth: 180, textAlign: "center" }}>{monthLabel}</span>
      <button style={btn} onClick={onNext} aria-label="Next month">
        ›
      </button>
      <button style={{ ...btn, fontSize: 12, padding: "6px 12px" }} onClick={onToday}>
        Today
      </button>
      <div style={{ flex: 1 }} />
      <select value={filter} onChange={(e) => onFilterChange(e.target.value as FilterKey)} style={{ ...inp, minWidth: 120 }}>
        <option value="all">All</option>
        <option value="pending">Pending</option>
        <option value="paid">Paid</option>
        <option value="waived">Waived</option>
        <option value="overdue">Overdue</option>
        <option value="upcoming">Upcoming</option>
      </select>
      <select value={sortBy} onChange={(e) => onSortChange(e.target.value as SortKey)} style={{ ...inp, minWidth: 130 }}>
        <option value="manual">Manual</option>
        <option value="dueDay">Due day</option>
        <option value="amountDesc">Amount ↓</option>
        <option value="amountAsc">Amount ↑</option>
        <option value="name">Name</option>
        <option value="status">Status</option>
      </select>
    </div>
  );
}
