// Shown instantly on every dashboard sub-route navigation while the next
// segment loads, so clicks feel immediate instead of hanging on the old page.
export default function DashboardLoading() {
  const bar = (w: string) => (
    <div
      className="skeleton-pulse"
      style={{ height: 14, width: w, borderRadius: 6, background: "var(--main-bg2)" }}
    />
  );
  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {bar("40%")}
        {bar("22%")}
      </div>
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="skeleton-pulse"
          style={{
            height: 72,
            borderRadius: 12,
            border: "1px solid var(--card-border)",
            background: "var(--card-bg)",
          }}
        />
      ))}
    </div>
  );
}
