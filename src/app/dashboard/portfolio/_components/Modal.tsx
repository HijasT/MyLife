"use client";

import type { CSSProperties, ReactNode } from "react";
import type { ThemeVars } from "./theme";

export function Modal({
  V,
  btn,
  title,
  subtitle,
  onClose,
  width = 520,
  align = "flex-start",
  children,
  footer,
}: {
  V: ThemeVars;
  btn: CSSProperties;
  title: ReactNode;
  subtitle?: string;
  onClose: () => void;
  width?: number;
  align?: "center" | "flex-start";
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 50, display: "flex", alignItems: align, justifyContent: "center", padding: align === "center" ? 16 : "40px 16px 24px", overflowY: "auto" }}
      onClick={onClose}
    >
      <div
        style={{
          background: V.card,
          border: `1px solid ${V.border}`,
          borderRadius: 18,
          width: `min(${width}px,100%)`,
          maxHeight: "92vh",
          overflow: "auto",
          animation: "portfolio-modal-in 160ms ease",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <style>{`@keyframes portfolio-modal-in{from{opacity:0;transform:translateY(8px) scale(0.98)}to{opacity:1;transform:translateY(0) scale(1)}}`}</style>
        <div style={{ padding: "18px 20px", borderBottom: `1px solid ${V.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div>
            {subtitle && <div style={{ fontSize: 11, fontWeight: 700, color: V.faint, textTransform: "uppercase", letterSpacing: "0.1em" }}>{subtitle}</div>}
            <div style={{ fontSize: 18, fontWeight: 800 }}>{title}</div>
          </div>
          <button style={btn} onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div style={{ padding: 20, display: "grid", gridTemplateColumns: "1fr", gap: 14 }}>{children}</div>
        {footer && <div style={{ padding: "0 20px 20px", display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>{footer}</div>}
      </div>
    </div>
  );
}

export function DeleteConfirmModal({
  V,
  btn,
  title,
  message,
  onCancel,
  onConfirm,
}: {
  V: ThemeVars;
  btn: CSSProperties;
  title: string;
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onCancel}>
      <div style={{ background: V.card, border: `1px solid ${V.border}`, borderRadius: 16, padding: 22, width: "min(380px,100%)" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 8 }}>{title}</div>
        <div style={{ fontSize: 13, color: V.muted, marginBottom: 16 }}>{message}</div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button style={btn} onClick={onCancel}>
            Cancel
          </button>
          <button style={{ ...btn, borderColor: "rgba(239,68,68,0.4)", color: V.neg }} onClick={onConfirm}>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
