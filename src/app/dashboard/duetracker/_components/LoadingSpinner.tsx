"use client";

import type { CSSProperties } from "react";

export function LoadingSpinner({ bg, accent }: { bg: string; accent: string }) {
  return (
    <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", background: bg }}>
      <div style={{ width: 28, height: 28, border: `2.5px solid ${accent}`, borderTopColor: "transparent", borderRadius: "50%", animation: "duetracker-spin 0.7s linear infinite" }} />
      <style>{`@keyframes duetracker-spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

// Skeleton placeholder for the main due list — mirrors the real layout (stat
// cards + grouped rows) so the page doesn't jump around once data lands.
export function ListSkeleton({ card, border, input }: { card: string; border: string; input: string }) {
  const shimmer: CSSProperties = {
    background: `linear-gradient(90deg, ${input} 25%, ${border} 50%, ${input} 75%)`,
    backgroundSize: "200% 100%",
    animation: "duetracker-shimmer 1.4s ease infinite",
    borderRadius: 8,
  };
  return (
    <div style={{ padding: "22px 24px" }}>
      <style>{`@keyframes duetracker-shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
      <div style={{ ...shimmer, height: 14, width: 120, marginBottom: 10 }} />
      <div style={{ ...shimmer, height: 30, width: 220, marginBottom: 20 }} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 12, marginBottom: 20 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ background: card, border: `1px solid ${border}`, borderRadius: 14, padding: "14px 16px" }}>
            <div style={{ ...shimmer, height: 10, width: "60%", marginBottom: 10 }} />
            <div style={{ ...shimmer, height: 22, width: "80%" }} />
          </div>
        ))}
      </div>
      {[0, 1].map((g) => (
        <div key={g} style={{ background: card, border: `1px solid ${border}`, borderRadius: 14, padding: 16, marginBottom: 14 }}>
          <div style={{ ...shimmer, height: 16, width: 140, marginBottom: 14 }} />
          {[0, 1, 2].map((r) => (
            <div key={r} style={{ ...shimmer, height: 48, marginBottom: 8 }} />
          ))}
        </div>
      ))}
    </div>
  );
}
