"use client";

export function Toast({ message, isDark, pos }: { message: string; isDark: boolean; pos: string }) {
  if (!message) return null;
  return (
    <div
      style={{
        position: "fixed",
        bottom: 20,
        right: 16,
        left: 16,
        maxWidth: 380,
        marginLeft: "auto",
        background: isDark ? "#1a3a2a" : "#f0fdf4",
        color: pos,
        border: "1px solid rgba(22,163,74,0.3)",
        padding: "12px 18px",
        borderRadius: 12,
        fontSize: 13,
        fontWeight: 700,
        boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
        zIndex: 200,
        animation: "portfolio-toast-in 180ms ease",
      }}
    >
      {message}
      <style>{`@keyframes portfolio-toast-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </div>
  );
}
