"use client";

import type { CSSProperties, ReactNode } from "react";
import type { ThemeVars } from "./theme";

export function Modal({
  V,
  btn,
  title,
  subtitle,
  onClose,
  closeDisabled,
  width = 520,
  zIndex = 50,
  children,
  footer,
}: {
  V: ThemeVars;
  btn: CSSProperties;
  title: string;
  subtitle?: string;
  onClose: () => void;
  closeDisabled?: boolean;
  width?: number;
  zIndex?: number;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, overflow: "auto" }}
      onClick={() => !closeDisabled && onClose()}
    >
      <div
        style={{
          background: V.card,
          border: `1px solid ${V.border}`,
          borderRadius: 18,
          width: `min(${width}px,100%)`,
          maxHeight: "90vh",
          overflow: "auto",
          margin: "auto",
          boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
          animation: "duetracker-modal-in 160ms ease",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <style>{`@keyframes duetracker-modal-in{from{opacity:0;transform:translateY(8px) scale(0.98)}to{opacity:1;transform:translateY(0) scale(1)}}`}</style>
        <div style={{ padding: "18px 20px", borderBottom: `1px solid ${V.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div>
            {subtitle && <div style={{ fontSize: 11, fontWeight: 700, color: V.faint, textTransform: "uppercase", letterSpacing: "0.1em" }}>{subtitle}</div>}
            <div style={{ fontSize: 18, fontWeight: 800 }}>{title}</div>
          </div>
          <button style={{ ...btn, padding: "6px 10px" }} onClick={onClose} disabled={closeDisabled} aria-label="Close">
            ✕
          </button>
        </div>
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>{children}</div>
        {footer && <div style={{ padding: "0 20px 20px", display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>{footer}</div>}
      </div>
    </div>
  );
}
