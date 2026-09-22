import type { CSSProperties } from "react";

export type ThemeVars = {
  bg: string;
  card: string;
  border: string;
  text: string;
  muted: string;
  faint: string;
  input: string;
  accent: string;
  accentSoft: string;
  pos: string;
  posSoft: string;
  neg: string;
  negSoft: string;
  warn: string;
  warnSoft: string;
  gold: string;
  goldSoft: string;
};

// Same red accent + CSS-var palette used across the module before this rebuild —
// per CLAUDE.md this is the one color system in active use, so it's kept as-is.
export function getTheme(isDark: boolean): ThemeVars {
  return {
    bg: "var(--main-bg)",
    card: "var(--card-bg)",
    border: "var(--card-border)",
    text: "var(--text-primary)",
    muted: "var(--text-secondary)",
    faint: "var(--text-muted)",
    input: "var(--main-bg2)",
    accent: "#ef4444",
    accentSoft: isDark ? "rgba(239,68,68,0.16)" : "rgba(239,68,68,0.10)",
    pos: "var(--positive)",
    posSoft: "var(--positive-soft)",
    neg: "var(--negative)",
    negSoft: "var(--negative-soft)",
    warn: "var(--warning)",
    warnSoft: "var(--warning-soft)",
    gold: "var(--gold)",
    goldSoft: "var(--gold-soft)",
  };
}

export function getShadow(isDark: boolean) {
  return isDark
    ? "0 1px 3px rgba(0,0,0,0.45)"
    : "0 1px 2px rgba(16,24,40,0.06), 0 1px 3px rgba(16,24,40,0.04)";
}

export function styleKit(V: ThemeVars, isDark: boolean, isMobile: boolean) {
  const shadow = getShadow(isDark);
  const btn: CSSProperties = {
    padding: isMobile ? "10px 16px" : "8px 14px",
    minHeight: isMobile ? 40 : undefined,
    borderRadius: 10,
    border: `1px solid ${V.border}`,
    background: V.card,
    color: V.text,
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
    boxShadow: shadow,
    transition: "transform 120ms ease, box-shadow 120ms ease, background 120ms ease, opacity 120ms ease",
  };
  const btnP: CSSProperties = {
    ...btn,
    background: V.accent,
    border: "none",
    color: "#fff",
    fontWeight: 700,
    boxShadow: "0 4px 14px rgba(239,68,68,0.30)",
  };
  const btnGhost: CSSProperties = {
    ...btn,
    background: "transparent",
    border: "none",
    boxShadow: "none",
  };
  const inp: CSSProperties = {
    padding: isMobile ? "10px 12px" : "8px 12px",
    minHeight: isMobile ? 40 : undefined,
    borderRadius: 8,
    border: `1px solid ${V.border}`,
    background: V.input,
    color: V.text,
    fontSize: 13,
    outline: "none",
  };
  const card: CSSProperties = {
    background: V.card,
    border: `1px solid ${V.border}`,
    borderRadius: 14,
    boxShadow: shadow,
  };
  const sectionHead: CSSProperties = {
    padding: "11px 16px",
    fontSize: 11,
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    color: V.faint,
    background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
  };
  return { shadow, btn, btnP, btnGhost, inp, card, sectionHead };
}
