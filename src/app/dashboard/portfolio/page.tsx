"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { markSynced } from "@/hooks/useSyncStatus";

type AssetType = "gold" | "silver" | "stock" | "crypto" | "other";
type Currency = "AED" | "INR" | "USD" | "GBP" | "EUR";
type TxType = "buy" | "sell";

type PortfolioItem = {
  id: string;
  symbol: string;
  name: string;
  assetType: AssetType;
  unitLabel: string;
  mainCurrency: Currency;
  currentPrice: number | null;
  currentPriceUpdatedAt: string | null;
  livePriceSymbol: string | null;
  notes: string;
};

type Purchase = {
  id: string;
  itemId: string;
  purchasedAt: string;
  unitPrice: number;
  units: number;
  totalPaid: number;
  currency: Currency;
  source: string;
  itemName?: string;
  itemSymbol?: string;
  transactionType: TxType;
};

type ItemStats = {
  totalUnits: number;
  costBasisAed: number;
  totalBuysAed: number;
  totalSellsAed: number;
  realizedPlAed: number;
  avgUnitPrice: number;
};

type AlertCountMap = Record<string, number>;

const FX: Record<string, number> = {
  AED: 1,
  USD: 3.67,
  INR: 0.044,
  GBP: 4.62,
  EUR: 4.0,
};

const toAed = (a: number, c: Currency) => a * (FX[c] ?? 1);

const fmtN = (n: number, d = 2) =>
  n.toLocaleString("en-AE", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });

const fmtSignedAed = (n: number) =>
  `${n >= 0 ? "+" : "-"}AED ${fmtN(Math.abs(n))}`;

const ASSET_ICONS: Record<AssetType, string> = {
  gold: "🥇",
  silver: "🥈",
  stock: "📊",
  crypto: "₿",
  other: "💼",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dbToItem = (r: any): PortfolioItem => ({
  id: r.id,
  symbol: r.symbol,
  name: r.name,
  assetType: (r.asset_type ?? "other") as AssetType,
  unitLabel: r.unit_label ?? "unit",
  mainCurrency: (r.main_currency ?? "AED") as Currency,
  currentPrice: r.current_price ?? null,
  currentPriceUpdatedAt: r.current_price_updated_at ?? null,
  livePriceSymbol: r.live_price_symbol ?? null,
  notes: r.notes ?? "",
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dbToPurchase = (r: any): Purchase => ({
  id: r.id,
  itemId: r.item_id,
  purchasedAt: r.purchased_at,
  unitPrice: Math.abs(r.unit_price),
  units: Math.abs(r.units),
  totalPaid: Math.abs(r.total_paid),
  currency: (r.currency ?? "AED") as Currency,
  source: r.source ?? "",
  itemName: r.portfolio_items?.name,
  itemSymbol: r.portfolio_items?.symbol,
  transactionType:
    r.transaction_type ??
    (Number(r.units) < 0 || Number(r.total_paid) < 0 ? "sell" : "buy"),
});

export default function PortfolioPage() {
  const supabase = createClient();
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<PortfolioItem[]>([]);
  const [allStats, setAllStats] = useState<Record<string, ItemStats>>({});
  const [recent, setRecent] = useState<Purchase[]>([]);
  const [activeTab, setActiveTab] = useState<"assets" | "prices">("assets");
  const [priceLoading, setPriceLoading] = useState(false);
  const [livePrices, setLivePrices] = useState<Record<string, { bid: number; ask: number; updated: string }>>({});
  const [alertCounts, setAlertCounts] = useState<AlertCountMap>({});
  const [showAddItem, setShowAddItem] = useState(false);
  const [showDeleteItem, setShowDeleteItem] = useState<string | null>(null);
  const [showUpdatePrice, setShowUpdatePrice] = useState<PortfolioItem | null>(null);
  const [newPrice, setNewPrice] = useState("");
  const [toast, setToast] = useState("");
  const [newItem, setNewItem] = useState({
    symbol: "",
    name: "",
    assetType: "other" as AssetType,
    unitLabel: "unit",
    mainCurrency: "AED" as Currency,
    livePriceSymbol: "",
    notes: "",
  });

  const isDark =
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark");

  async function loadStats(itemList: PortfolioItem[]) {
    const results: Record<string, ItemStats> = {};

    await Promise.all(
      itemList.map(async (item) => {
        const { data } = await supabase
          .from("portfolio_purchases")
          .select("units,total_paid,currency,purchased_at,transaction_type")
          .eq("item_id", item.id)
          .order("purchased_at", { ascending: true });

        let totalUnits = 0;
        let costBasisAed = 0;
        let totalBuysAed = 0;
        let totalSellsAed = 0;
        let realizedPlAed = 0;

        for (const row of data ?? []) {
          const txType =
            row.transaction_type ??
            ((Number(row.units) || 0) < 0 || (Number(row.total_paid) || 0) < 0
              ? "sell"
              : "buy");

          const units = Math.abs(Number(row.units) || 0);
          const amountAed = Math.abs(
            toAed(Number(row.total_paid) || 0, row.currency as Currency)
          );

          if (txType === "buy") {
            totalUnits += units;
            costBasisAed += amountAed;
            totalBuysAed += amountAed;
          } else {
            const sellUnits = Math.min(units, totalUnits);
            const avgCostBeforeSell = totalUnits > 0 ? costBasisAed / totalUnits : 0;
            const costRemoved = avgCostBeforeSell * sellUnits;

            totalUnits = Math.max(0, totalUnits - sellUnits);
            costBasisAed = Math.max(0, costBasisAed - costRemoved);
            totalSellsAed += amountAed;
            realizedPlAed += amountAed - costRemoved;
          }
        }

        results[item.id] = {
          totalUnits,
          costBasisAed,
          totalBuysAed,
          totalSellsAed,
          realizedPlAed,
          avgUnitPrice: totalUnits > 0 ? costBasisAed / totalUnits : 0,
        };
      })
    );

    setAllStats(results);
  }

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }

      setUserId(user.id);

      const [ir, pr, ar] = await Promise.all([
        supabase
          .from("portfolio_items")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at"),
        supabase
          .from("portfolio_purchases")
          .select("*,portfolio_items(name,symbol)")
          .eq("user_id", user.id)
          .order("purchased_at", { ascending: false })
          .limit(10),
        supabase
          .from("portfolio_alerts")
          .select("item_id,is_active")
          .eq("user_id", user.id)
          .eq("is_active", true),
      ]);

      const loadedItems = (ir.data ?? []).map(dbToItem);
      setItems(loadedItems);
      setRecent((pr.data ?? []).map((r: any) => dbToPurchase(r)));

      const counts: AlertCountMap = {};
      for (const row of ar.data ?? []) {
        counts[row.item_id] = (counts[row.item_id] ?? 0) + 1;
      }
      setAlertCounts(counts);

      await loadStats(loadedItems);
      markSynced();
      setLoading(false);
    }

    load();
  }, [supabase]);


  async function fetchSpotPrices() {
    setPriceLoading(true);

    try {
      const results: Record<string, { bid: number; ask: number; updated: string }> = {};
      const now = new Date().toLocaleTimeString("en-AE", {
        timeZone: "Asia/Dubai",
        hour: "2-digit",
        minute: "2-digit",
      });
      const proxy = (url: string) =>
        `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;

      let usdToAed = FX["USD"];

      try {
        const fxRes = await fetch(
          "https://api.frankfurter.app/latest?from=USD&to=AED"
        );
        const fxData = await fxRes.json();
        if (fxData?.rates?.AED) usdToAed = fxData.rates.AED;
      } catch {
        // use default
      }

      const getYahooUsd = async (ticker: string): Promise<number | null> => {
        try {
          const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=5d`;
          const r = await fetch(proxy(yahooUrl));
          const wrapper = await r.json();
          const text = wrapper?.contents;
          if (!text) return null;
          const data = JSON.parse(text);
          const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
          if (!price || price <= 0) return null;
          return price;
        } catch {
          return null;
        }
      };

      const OZ_TO_G = 31.1034768;

      const goldUsd = await getYahooUsd("XAUUSD=X");
      if (goldUsd) {
        const ozAed = goldUsd * usdToAed;
        const gAed = ozAed / OZ_TO_G;
        results["XAU_OZ"] = { bid: ozAed * 0.999, ask: ozAed, updated: now };
        results["XAU_G"] = { bid: gAed * 0.999, ask: gAed, updated: now };
      }

      const silverUsd = await getYahooUsd("XAGUSD=X");
      if (silverUsd) {
        const ozAed = silverUsd * usdToAed;
        const gAed = ozAed / OZ_TO_G;
        results["XAG_OZ"] = { bid: ozAed * 0.999, ask: ozAed, updated: now };
        results["XAG_G"] = { bid: gAed * 0.999, ask: gAed, updated: now };
      }

      try {
        const r = await fetch(proxy("https://parkin.ae/stock-price"));
        const wrapper = await r.json();
        const html: string = wrapper?.contents ?? "";
        let parkinPrice = 0;
        const pats = [
          /TickerValueTD_LastPrice[^>]*>([\d.]+)/,
          /TickerValueTD[^>]*LastPrice[^>]*>([\d.]+)/,
          /"lastPrice"\s*:\s*"?([\d.]+)"?/,
          /"last"\s*:\s*([\d.]+)/,
          /PARK[A-Z.]*[^<]{0,30}([\d]{1,3}\.[\d]{1,4})/,
        ];
        for (const pat of pats) {
          const m = html.match(pat);
          if (m) {
            parkinPrice = parseFloat(m[1]);
            if (parkinPrice > 0) break;
          }
        }
        if (parkinPrice > 0) {
          results["PARKIN.DFM"] = {
            bid: parkinPrice * 0.999,
            ask: parkinPrice,
            updated: now,
          };
        }
      } catch {
        // skip
      }

      setLivePrices(results);

      if (Object.keys(results).length > 0) {
        const nowIso = new Date().toISOString();

        await Promise.all(
          items.map(async (item) => {
            if (!item.livePriceSymbol) return;
            const linked = results[item.livePriceSymbol];
            if (!linked) return;

            await supabase
              .from("portfolio_items")
              .update({
                current_price: linked.bid,
                current_price_updated_at: nowIso,
              })
              .eq("id", item.id);

            setItems((prev) =>
              prev.map((x) =>
                x.id === item.id
                  ? {
                      ...x,
                      currentPrice: linked.bid,
                      currentPriceUpdatedAt: nowIso,
                    }
                  : x
              )
            );
          })
        );
      }

      showToast(
        Object.keys(results).length > 0
          ? `Updated ${Object.keys(results).length} live price${Object.keys(results).length > 1 ? "s" : ""}`
          : "No live prices found"
      );
    } finally {
      setPriceLoading(false);
    }
  }

  async function addItem() {
    if (!userId || !newItem.symbol.trim() || !newItem.name.trim()) {
      showToast("Symbol and name required");
      return;
    }

    const { data } = await supabase
      .from("portfolio_items")
      .insert({
        user_id: userId,
        symbol: newItem.symbol.trim().toUpperCase(),
        name: newItem.name.trim(),
        asset_type: newItem.assetType,
        unit_label: newItem.unitLabel,
        main_currency: newItem.mainCurrency,
        live_price_symbol: newItem.livePriceSymbol || null,
        notes: newItem.notes,
      })
      .select("*")
      .single();

    if (data) {
      const added = dbToItem(data);
      setItems((p) => [...p, added]);
      setAllStats((p) => ({
        ...p,
        [added.id]: {
          totalUnits: 0,
          costBasisAed: 0,
          totalBuysAed: 0,
          totalSellsAed: 0,
          realizedPlAed: 0,
          avgUnitPrice: 0,
        },
      }));
      setShowAddItem(false);
      setNewItem({
        symbol: "",
        name: "",
        assetType: "other",
        unitLabel: "unit",
        mainCurrency: "AED",
        livePriceSymbol: "",
        notes: "",
      });
      showToast("Asset added");
    }
  }

  async function deleteItem(id: string) {
    await supabase.from("portfolio_alerts").delete().eq("item_id", id);
    await supabase.from("portfolio_purchases").delete().eq("item_id", id);
    await supabase.from("portfolio_items").delete().eq("id", id);

    setItems((p) => p.filter((x) => x.id !== id));
    setAllStats((p) => {
      const n = { ...p };
      delete n[id];
      return n;
    });
    setShowDeleteItem(null);
    showToast("Asset deleted");
  }

  async function updateCurrentPrice(item: PortfolioItem) {
    const price = parseFloat(newPrice);
    if (isNaN(price) || price <= 0) {
      showToast("Enter a valid price");
      return;
    }

    const nowIso = new Date().toISOString();

    await supabase
      .from("portfolio_items")
      .update({
        current_price: price,
        current_price_updated_at: nowIso,
      })
      .eq("id", item.id);

    setItems((p) =>
      p.map((x) =>
        x.id === item.id
          ? { ...x, currentPrice: price, currentPriceUpdatedAt: nowIso }
          : x
      )
    );
    setShowUpdatePrice(null);
    setNewPrice("");
    showToast("Price updated");
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  }

  const totals = useMemo(() => {
    let cost = 0;
    let current = 0;
    let realized = 0;

    for (const item of items) {
      const s = allStats[item.id];
      if (!s) continue;

      cost += s.costBasisAed;
      realized += s.realizedPlAed;
      current += item.currentPrice ? item.currentPrice * s.totalUnits : s.costBasisAed;
    }

    return {
      cost,
      current,
      realized,
      pl: current - cost,
      plPct: cost > 0 ? ((current - cost) / cost) * 100 : 0,
    };
  }, [items, allStats]);

  const allocation = useMemo(() => {
    const rows = items
      .map((item) => {
        const s = allStats[item.id];
        const value =
          item.currentPrice && s ? item.currentPrice * s.totalUnits : s?.costBasisAed ?? 0;

        return {
          id: item.id,
          name: item.name,
          symbol: item.symbol,
          value,
        };
      })
      .filter((x) => x.value > 0)
      .sort((a, b) => b.value - a.value);

    const total = rows.reduce((sum, r) => sum + r.value, 0);

    return rows.map((r, i) => ({
      ...r,
      pct: total > 0 ? (r.value / total) * 100 : 0,
      color: ["#F5A623", "#3b82f6", "#10b981", "#8b5cf6", "#ef4444", "#06b6d4"][i % 6],
    }));
  }, [items, allStats]);

  const pieGradient = useMemo(() => {
    if (allocation.length === 0) return "conic-gradient(#e5e7eb 0deg 360deg)";
    let currentDeg = 0;
    const parts = allocation.map((a) => {
      const nextDeg = currentDeg + (a.pct / 100) * 360;
      const part = `${a.color} ${currentDeg}deg ${nextDeg}deg`;
      currentDeg = nextDeg;
      return part;
    });
    return `conic-gradient(${parts.join(", ")})`;
  }, [allocation]);

  const V = {
    bg: isDark ? "#0d0f14" : "#f9f8f5",
    card: isDark ? "#16191f" : "#ffffff",
    border: isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)",
    text: isDark ? "#f0ede8" : "#1a1a1a",
    muted: isDark ? "#9ba3b2" : "#6b7280",
    faint: isDark ? "#5c6375" : "#9ca3af",
    input: isDark ? "#1e2130" : "#f9fafb",
    accent: "#F5A623",
  };

  const btn = {
    padding: "8px 14px",
    borderRadius: 10,
    border: `1px solid ${V.border}`,
    background: V.card,
    color: V.text,
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
  } as const;

  const btnP = {
    ...btn,
    background: V.accent,
    border: "none",
    color: "#fff",
    fontWeight: 700,
  } as const;

  const inp = {
    padding: "8px 12px",
    borderRadius: 8,
    border: `1px solid ${V.border}`,
    background: V.input,
    color: V.text,
    fontSize: 13,
    outline: "none",
    width: "100%",
    boxSizing: "border-box" as const,
  };

  const lbl = {
    display: "flex" as const,
    flexDirection: "column" as const,
    gap: 5,
    fontSize: 12,
    fontWeight: 700,
    color: V.muted,
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
  };

  if (loading) {
    return (
      <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", background: V.bg }}>
        <div style={{ width: 28, height: 28, border: `2.5px solid ${V.accent}`, borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  const isUp = totals.pl >= 0;
  const plColor = isUp ? "#16a34a" : "#ef4444";

  return (
    <div style={{ minHeight: "100vh", background: V.bg, color: V.text, fontFamily: "system-ui,sans-serif" }}>
      <div style={{ padding: "22px 24px 0", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>
            Port<span style={{ color: V.accent, fontStyle: "italic" }}>folio</span>
          </div>
          <div style={{ fontSize: 13, color: V.faint, marginTop: 2 }}>
            P&L · Allocation · Alerts
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ display: "flex", borderRadius: 10, overflow: "hidden", border: `1px solid ${V.border}` }}>
            {(["assets", "prices"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  padding: "7px 14px",
                  background: activeTab === tab ? V.accent : "transparent",
                  color: activeTab === tab ? "#fff" : V.muted,
                  border: "none",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 700,
                  textTransform: "capitalize",
                }}
              >
                {tab === "assets" ? "Assets" : "Live prices"}
              </button>
            ))}
          </div>

          {activeTab === "assets" && (
            <button style={btnP} onClick={() => setShowAddItem(true)}>
              + Add asset
            </button>
          )}

          {activeTab === "prices" && (
            <button style={btnP} onClick={fetchSpotPrices} disabled={priceLoading}>
              {priceLoading ? "Refreshing…" : "🔄 Refresh"}
            </button>
          )}
        </div>
      </div>

      {activeTab === "assets" && (
      <>
      <div style={{ padding: "12px 24px 0", display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(155px,1fr))", gap: 10 }}>
        {[
          { label: "Invested", value: `AED ${fmtN(totals.cost)}`, color: V.accent },
          { label: "Current value", value: `AED ${fmtN(totals.current)}`, color: V.text },
          { label: "Unrealized P&L", value: fmtSignedAed(totals.pl), color: plColor },
          { label: "Return", value: `${totals.plPct >= 0 ? "+" : ""}${totals.plPct.toFixed(2)}%`, color: plColor },
          { label: "Realized P&L", value: fmtSignedAed(totals.realized), color: totals.realized >= 0 ? "#16a34a" : "#ef4444" },
        ].map((s) => (
          <div key={s.label} style={{ background: V.card, border: `1px solid ${V.border}`, borderRadius: 12, padding: "12px 14px" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: V.faint, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
              {s.label}
            </div>
            <div style={{ fontSize: 17, fontWeight: 800, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ padding: "14px 24px", display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 14 }}>
        <div style={{ background: V.card, border: `1px solid ${V.border}`, borderRadius: 14, padding: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 14 }}>Assets</div>

          {items.length === 0 ? (
            <div style={{ padding: "40px 0", textAlign: "center", color: V.faint }}>
              No assets yet
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {items.map((item) => {
                const s = allStats[item.id] ?? {
                  totalUnits: 0,
                  costBasisAed: 0,
                  totalBuysAed: 0,
                  totalSellsAed: 0,
                  realizedPlAed: 0,
                  avgUnitPrice: 0,
                };

                const curVal = item.currentPrice ? item.currentPrice * s.totalUnits : null;
                const pl = curVal !== null ? curVal - s.costBasisAed : null;
                const plPct = pl !== null && s.costBasisAed > 0 ? (pl / s.costBasisAed) * 100 : null;
                const up = pl !== null && pl >= 0;
                const activeAlerts = alertCounts[item.id] ?? 0;

                return (
                  <div
                    key={item.id}
                    onClick={() => router.push(`/dashboard/portfolio/${item.id}`)}
                    style={{ background: V.bg, border: `1px solid ${V.border}`, borderRadius: 14, padding: "16px 18px", cursor: "pointer" }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                        <div style={{ width: 44, height: 44, borderRadius: 12, background: `${V.accent}15`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>
                          {ASSET_ICONS[item.assetType]}
                        </div>

                        <div>
                          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                            <span style={{ fontSize: 16, fontWeight: 800 }}>{item.name}</span>
                            <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "rgba(245,166,35,0.1)", color: V.accent }}>
                              {item.symbol}
                            </span>
                            {activeAlerts > 0 && (
                              <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 999, background: "rgba(239,68,68,0.12)", color: "#ef4444" }}>
                                {activeAlerts} alert{activeAlerts > 1 ? "s" : ""}
                              </span>
                            )}
                          </div>

                          <div style={{ fontSize: 12, color: V.faint, marginTop: 2 }}>
                            {fmtN(s.totalUnits, 4)} {item.unitLabel} · Avg AED {fmtN(s.avgUnitPrice)} / {item.unitLabel}
                          </div>

                          {item.currentPrice && (
                            <div style={{ fontSize: 12, color: V.muted, marginTop: 1 }}>
                              Price: <strong style={{ color: V.text }}>AED {fmtN(item.currentPrice)}</strong>
                            </div>
                          )}
                        </div>
                      </div>

                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 16, fontWeight: 800, color: V.text }}>
                          {curVal !== null ? `AED ${fmtN(curVal)}` : <span style={{ color: V.faint }}>No price</span>}
                        </div>

                        {pl !== null && plPct !== null && (
                          <div style={{ fontSize: 13, fontWeight: 700, color: up ? "#16a34a" : "#ef4444", marginTop: 2 }}>
                            {fmtSignedAed(pl)} ({plPct >= 0 ? "+" : ""}{plPct.toFixed(2)}%)
                          </div>
                        )}

                        <div style={{ fontSize: 11, color: V.faint, marginTop: 2 }}>
                          Invested: AED {fmtN(s.costBasisAed)}
                        </div>

                        <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowUpdatePrice(item);
                              setNewPrice(item.currentPrice?.toString() ?? "");
                            }}
                            style={{ ...btn, padding: "3px 10px", fontSize: 10 }}
                          >
                            Update price
                          </button>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowDeleteItem(item.id);
                            }}
                            style={{ ...btn, padding: "3px 10px", fontSize: 10, color: "#ef4444", borderColor: "rgba(239,68,68,0.3)" }}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ background: V.card, border: `1px solid ${V.border}`, borderRadius: 14, padding: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 14 }}>Allocation</div>

            {allocation.length === 0 ? (
              <div style={{ color: V.faint, fontSize: 13 }}>No priced holdings yet</div>
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
                  <div style={{ width: 180, height: 180, borderRadius: "50%", background: pieGradient, position: "relative" }}>
                    <div style={{ position: "absolute", inset: 28, borderRadius: "50%", background: V.card, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 10 }}>
                      <div>
                        <div style={{ fontSize: 10, color: V.faint, textTransform: "uppercase", letterSpacing: "0.08em" }}>Total</div>
                        <div style={{ fontSize: 16, fontWeight: 800 }}>AED {fmtN(totals.current)}</div>
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {allocation.map((a) => (
                    <div key={a.id} style={{ display: "grid", gridTemplateColumns: "14px 1fr auto", gap: 8, alignItems: "center" }}>
                      <div style={{ width: 12, height: 12, borderRadius: 999, background: a.color }} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>{a.name}</div>
                        <div style={{ fontSize: 11, color: V.faint }}>{a.symbol}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 12, fontWeight: 700 }}>AED {fmtN(a.value)}</div>
                        <div style={{ fontSize: 11, color: V.faint }}>{a.pct.toFixed(1)}%</div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {recent.length > 0 && (
            <div style={{ background: V.card, border: `1px solid ${V.border}`, borderRadius: 14, overflow: "hidden" }}>
              <div style={{ padding: "11px 16px", borderBottom: `1px solid ${V.border}`, fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", color: V.faint }}>
                Last 10 transactions
              </div>

              {recent.map((p) => (
                <div key={p.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "10px 16px", borderBottom: `1px solid ${V.border}`, fontSize: 13 }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>
                      {p.itemName} <span style={{ fontSize: 11, color: V.faint }}>({p.itemSymbol})</span>
                    </div>
                    <div style={{ fontSize: 11, color: p.transactionType === "buy" ? "#16a34a" : "#ef4444", fontWeight: 800, textTransform: "uppercase", marginTop: 2 }}>
                      {p.transactionType}
                    </div>
                  </div>

                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 700 }}>
                      {p.currency} {fmtN(p.totalPaid)}
                    </div>
                    <div style={{ fontSize: 11, color: V.faint }}>
                      {new Date(p.purchasedAt).toLocaleDateString("en-AE")}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      </>
      )}

      {activeTab === "prices" && (
        <div style={{ padding: "14px 24px" }}>
          <div style={{ background: V.card, border: `1px solid ${V.border}`, borderRadius: 14, overflow: "hidden" }}>
            <div style={{ padding: "12px 16px", borderBottom: `1px solid ${V.border}`, display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr 0.8fr", gap: 8, fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: V.faint }}>
              <div>Live item</div>
              <div>Buy (Ask)</div>
              <div>Sell (Bid)</div>
              <div>Updated</div>
            </div>

            {[
              { key: "XAU_OZ", label: "24K Gold", sub: "1 oz" },
              { key: "XAU_G", label: "24K Gold", sub: "1 g" },
              { key: "XAG_OZ", label: "999 Silver", sub: "1 oz" },
              { key: "XAG_G", label: "999 Silver", sub: "1 g" },
              { key: "PARKIN.DFM", label: "Parkin", sub: "DFM" },
            ].map((row) => {
              const p = livePrices[row.key];
              return (
                <div key={row.key} style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr 0.8fr", gap: 8, padding: "12px 16px", borderBottom: `1px solid ${V.border}`, alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{row.label}</div>
                    <div style={{ fontSize: 11, color: V.faint }}>{row.sub}</div>
                    <div style={{ fontSize: 10, color: V.faint, marginTop: 2 }}>Pointer: {row.key}</div>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "#16a34a" }}>{p ? `AED ${fmtN(p.ask)}` : "—"}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#ef4444" }}>{p ? `AED ${fmtN(p.bid)}` : "—"}</div>
                  <div style={{ fontSize: 11, color: V.faint }}>{p?.updated ?? "—"}</div>
                </div>
              );
            })}
          </div>

          <div style={{ background: V.card, border: `1px solid ${V.border}`, borderRadius: 14, padding: 16, marginTop: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>How linking works</div>
            <div style={{ fontSize: 12, color: V.muted, lineHeight: 1.6 }}>
              Pick a live price pointer when adding an asset. When you refresh this tab, linked assets will automatically update their current price using the sell (bid) rate.
            </div>
          </div>
        </div>
      )}

      {showAddItem && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => setShowAddItem(false)}>
          <div style={{ background: V.card, border: `1px solid ${V.border}`, borderRadius: 18, width: "min(520px,100%)", maxHeight: "90vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: "18px 20px", borderBottom: `1px solid ${V.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 18, fontWeight: 800 }}>Add asset</div>
              <button style={btn} onClick={() => setShowAddItem(false)}>✕</button>
            </div>

            <div style={{ padding: 20, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <label style={lbl}>Symbol<input style={inp} value={newItem.symbol} onChange={(e) => setNewItem((p) => ({ ...p, symbol: e.target.value }))} /></label>
              <label style={lbl}>Name<input style={inp} value={newItem.name} onChange={(e) => setNewItem((p) => ({ ...p, name: e.target.value }))} /></label>
              <label style={lbl}>
                Type
                <select style={inp} value={newItem.assetType} onChange={(e) => setNewItem((p) => ({ ...p, assetType: e.target.value as AssetType }))}>
                  <option value="gold">Gold</option>
                  <option value="silver">Silver</option>
                  <option value="stock">Stock</option>
                  <option value="crypto">Crypto</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label style={lbl}>Unit<input style={inp} value={newItem.unitLabel} onChange={(e) => setNewItem((p) => ({ ...p, unitLabel: e.target.value }))} /></label>
              <label style={lbl}>
                Currency
                <select style={inp} value={newItem.mainCurrency} onChange={(e) => setNewItem((p) => ({ ...p, mainCurrency: e.target.value as Currency }))}>
                  <option>AED</option>
                  <option>USD</option>
                  <option>INR</option>
                  <option>GBP</option>
                  <option>EUR</option>
                </select>
              </label>
              <label style={{ ...lbl, gridColumn: "1/-1" }}>
                Live price pointer
                <select style={inp} value={newItem.livePriceSymbol} onChange={(e) => setNewItem((p) => ({ ...p, livePriceSymbol: e.target.value }))}>
                  <option value="">None — manual price update</option>
                  <option value="XAU_OZ">24K Gold — 1 oz (AED)</option>
                  <option value="XAU_G">24K Gold — 1 g (AED)</option>
                  <option value="XAG_OZ">999 Silver — 1 oz (AED)</option>
                  <option value="XAG_G">999 Silver — 1 g (AED)</option>
                  <option value="PARKIN.DFM">Parkin (DFM)</option>
                </select>
              </label>
              <label style={{ ...lbl, gridColumn: "1/-1" }}>Notes<input style={inp} value={newItem.notes} onChange={(e) => setNewItem((p) => ({ ...p, notes: e.target.value }))} /></label>
            </div>

            <div style={{ padding: "0 20px 20px", display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button style={btn} onClick={() => setShowAddItem(false)}>Cancel</button>
              <button style={btnP} onClick={addItem}>Add</button>
            </div>
          </div>
        </div>
      )}

      {showUpdatePrice && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => setShowUpdatePrice(null)}>
          <div style={{ background: V.card, border: `1px solid ${V.border}`, borderRadius: 18, width: "min(380px,100%)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: "18px 20px", borderBottom: `1px solid ${V.border}`, fontSize: 18, fontWeight: 800 }}>
              Update price — {showUpdatePrice.name}
            </div>

            <div style={{ padding: 20 }}>
              <label style={lbl}>
                {showUpdatePrice.mainCurrency} per {showUpdatePrice.unitLabel}
                <input type="number" style={inp} value={newPrice} onChange={(e) => setNewPrice(e.target.value)} autoFocus />
              </label>
            </div>

            <div style={{ padding: "0 20px 20px", display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button style={btn} onClick={() => setShowUpdatePrice(null)}>Cancel</button>
              <button style={btnP} onClick={() => updateCurrentPrice(showUpdatePrice)}>Save</button>
            </div>
          </div>
        </div>
      )}

      {showDeleteItem && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => setShowDeleteItem(null)}>
          <div style={{ background: V.card, border: `1px solid ${V.border}`, borderRadius: 16, padding: 22, width: "min(360px,100%)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 8 }}>Delete asset?</div>
            <div style={{ fontSize: 13, color: V.muted, marginBottom: 16 }}>All alerts and transactions for this asset will also be deleted.</div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button style={btn} onClick={() => setShowDeleteItem(null)}>Cancel</button>
              <button style={{ ...btn, borderColor: "rgba(239,68,68,0.4)", color: "#ef4444" }} onClick={() => deleteItem(showDeleteItem)}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div style={{ position: "fixed", bottom: 20, right: 16, background: isDark ? "#1a3a2a" : "#f0fdf4", color: "#16a34a", border: "1px solid rgba(22,163,74,0.3)", padding: "12px 18px", borderRadius: 12, fontSize: 13, fontWeight: 700, boxShadow: "0 8px 24px rgba(0,0,0,0.2)", zIndex: 200 }}>{toast}</div>}
    </div>
  );
}