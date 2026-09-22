"use client";

import type { CSSProperties } from "react";

export function LoadingSpinner({ bg, accent }: { bg: string; accent: string }) {
  return (
    <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", background: bg }}>
      <div style={{ width: 28, height: 28, border: `2.5px solid ${accent}`, borderTopColor: "transparent", borderRadius: "50%", animation: "portfolio-spin 0.7s linear infinite" }} />
      <style>{`@keyframes portfolio-spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

// Skeleton placeholder for the assets list — mirrors the real layout (stat
// cards + holding cards) so the page doesn't jump around once data lands.
export function ListSkeleton({ card, border, input }: { card: string; border: string; input: string }) {
  const shimmer: CSSProperties = {
    background: `linear-gradient(90deg, ${input} 25%, ${border} 50%, ${input} 75%)`,
    backgroundSize: "200% 100%",
    animation: "portfolio-shimmer 1.4s ease infinite",
    borderRadius: 8,
  };
  return (
    <div style={{ padding: "22px 24px" }}>
      <style>{`@keyframes portfolio-shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
      <div style={{ ...shimmer, height: 22, width: 140, marginBottom: 20 }} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(155px,1fr))", gap: 10, marginBottom: 20 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ background: card, border: `1px solid ${border}`, borderRadius: 12, padding: "14px 16px" }}>
            <div style={{ ...shimmer, height: 10, width: "60%", marginBottom: 10 }} />
            <div style={{ ...shimmer, height: 20, width: "80%" }} />
          </div>
        ))}
      </div>
      {[0, 1, 2].map((r) => (
        <div key={r} style={{ ...shimmer, height: 64, marginBottom: 10, borderRadius: 14 }} />
      ))}
    </div>
  );
}
