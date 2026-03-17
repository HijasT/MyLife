"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { markSynced } from "@/hooks/useSyncStatus";

type AssetType = "gold" | "silver" | "stock" | "crypto" | "other";
type Currency = "AED" | "INR" | "USD" | "GBP" | "EUR";

type PortfolioItem = {
  id: string;
  symbol: string;
  name: string;
  assetType: AssetType;
  unitLabel: string;
  mainCurrency: Currency;
  currentPrice: number | null;
  currentPriceUpdatedAt: string | null;
  notes: string;
  livePriceSymbol?: string | null;
};

type TxType = "buy" | "sell";

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

type LivePriceRow = {
  bid: number;
  ask: number;
  updated: string;
};

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

const LIVE_PRICE_OPTIONS = [
  { value: "", label: "None — manual price update" },
  { value: "XAU_OZ", label: "24K Gold — 1 oz (AED)" },
  { value: "XAU_G", label: "24K Gold — 1 g (AED)" },
  { value: "XAG_OZ", label: "999 Silver — 1 oz (AED)" },
  { value: "XAG_G", label: "999 Silver — 1 g (AED)" },
  { value: "PARKIN.DFM", label: "Parkin (DFM)" },
];

async function fetchLivePrice(symbol: string): Promise<number | null> {
  const sym = symbol.toUpperCase();
  const proxy = (url: string) =>
    `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;

  try {
    let usdToAed = FX.USD;

    try {
      const fxRes = await fetch(
        "https://api.frankfurter.app/latest?from=USD&to=AED"
      );
      const fxData = await fxRes.json();
      if (fxData?.rates?.AED) usdToAed = fxData.rates.AED;
    } catch {
      // fallback to static FX
    }

    const tickerMap: Record<string, string> = {
      XAU: "XAUUSD=X",
      XAG: "XAGUSD=X",
      BTC: "BTC-USD",
      ETH: "ETH-USD",
    };

    const ticker = tickerMap[sym] ?? sym;
    const r = await fetch(
      proxy(
        `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=5d`
      )
    );
    const wrapper = await r.json();
    const data = JSON.parse(wrapper?.contents ?? "{}");
    const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
    const currency = data?.chart?.result?.[0]?.meta?.currency ?? "USD";

    if (!price || price <= 0) return null;
    return currency === "USD" ? price * usdToAed : price;
  } catch {
    return null;
  }
}

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
  notes: r.notes ?? "",
  livePriceSymbol: r.live_price_symbol ?? null,
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
    Number(r.units) < 0 || Number(r.total_paid) < 0 ? "sell" : "buy",
});

export default function PortfolioPage() {
  const supabase = createClient();
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<PortfolioItem[]>([]);
  const [allStats, setAllStats] = useState<Record<string, ItemStats>>({});
  const [recent, setRecent] = useState<Purchase[]>([]);
  const [liveLoading, setLiveLoading] = useState(false);

  const [activeTab, setActiveTab] = useState<"assets" | "prices">("assets");
  const [livePrices, setLivePrices] = useState<Record<string, LivePriceRow>>({});
  const [priceLoading, setPriceLoading] = useState(false);

  const [goldApiKey, setGoldApiKey] = useState("");
  const [goldApiInput, setGoldApiInput] = useState("");
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);

  const [customSymbols, setCustomSymbols] = useState<string[]>(["PARKIN.DFM"]);
  const [newSymbol, setNewSymbol] = useState("");

  const [showAddItem, setShowAddItem] = useState(false);
  const [showDeleteItem, setShowDeleteItem] = useState<string | null>(null);
  const [showUpdatePrice, setShowUpdatePrice] = useState<PortfolioItem | null>(
    null
  );
  const [newPrice, setNewPrice] = useState("");
  const [toast, setToast] = useState("");

  const [newItem, setNewItem] = useState({
    symbol: "",
    name: "",
    assetType: "other" as AssetType,
    unitLabel: "unit",
    mainCurrency: "AED" as Currency,
    notes: "",
    livePriceSymbol: "",
  });

  const isDark =
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark");

  const loadStats = useCallback(
    async (itemList: PortfolioItem[]) => {
      const results: Record<string, ItemStats> = {};

      await Promise.all(
        itemList.map(async (item) => {
          const { data } = await supabase
            .from("portfolio_purchases")
            .select("units,total_paid,currency,purchased_at")
            .eq("item_id", item.id)
            .order("purchased_at", { ascending: true });

          if (!data) {
            results[item.id] = {
              totalUnits: 0,
              costBasisAed: 0,
              totalBuysAed: 0,
              totalSellsAed: 0,
              realizedPlAed: 0,
              avgUnitPrice: 0,
            };
            return;
          }

          let totalUnits = 0;
          let costBasisAed = 0;
          let totalBuysAed = 0;
          let totalSellsAed = 0;
          let realizedPlAed = 0;

          for (const row of data as Array<{
            units: number;
            total_paid: number;
            currency: string;
            purchased_at: string;
          }>) {
            const units = Number(row.units) || 0;
            const amountAed = Math.abs(
              toAed(Number(row.total_paid) || 0, row.currency as Currency)
            );

            if (units >= 0) {
              totalUnits += units;
              costBasisAed += amountAed;
              totalBuysAed += amountAed;
            } else {
              const sellUnits = Math.min(Math.abs(units), totalUnits);
              const avgCostBeforeSell =
                totalUnits > 0 ? costBasisAed / totalUnits : 0;
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
    },
    [supabase]
  );

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

      const [ir, pr, profileRes] = await Promise.all([
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
          .from("profiles")
          .select("goldapi_key, metal_prices")
          .eq("id", user.id)
          .single(),
      ]);

      const loadedItems = (ir.data ?? []).map(dbToItem);
      setItems(loadedItems);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setRecent((pr.data ?? []).map((r: any) => dbToPurchase(r)));

      await loadStats(loadedItems);
      markSynced();

      const envGoldKey = process.env.NEXT_PUBLIC_GOLDAPI_KEY ?? "";
      const dbGoldKey = profileRes.data?.goldapi_key ?? "";

      setGoldApiKey(dbGoldKey || envGoldKey);
      setGoldApiInput(dbGoldKey || envGoldKey);

      if (profileRes.data?.metal_prices) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setLivePrices(profileRes.data.metal_prices as any);
      }

      setLoading(false);
    }

    load();
  }, [loadStats, supabase]);

  async function fetchAllLivePrices() {
    setLiveLoading(true);

    const updatable = items.filter((i) =>
      ["gold", "silver", "stock", "crypto"].includes(i.assetType)
    );

    const updates: PortfolioItem[] = [...items];

    await Promise.all(
      updatable.map(async (item) => {
        const price = await fetchLivePrice(item.symbol);
        if (price && price > 0) {
          const nowIso = new Date().toISOString();

          await supabase
            .from("portfolio_items")
            .update({
              current_price: price,
              current_price_updated_at: nowIso,
            })
            .eq("id", item.id);

          const idx = updates.findIndex((x) => x.id === item.id);
          if (idx >= 0) {
            updates[idx] = {
              ...updates[idx],
              currentPrice: price,
              currentPriceUpdatedAt: nowIso,
            };
          }
        }
      })
    );

    setItems([...updates]);
    setLiveLoading(false);
    showToast("Live prices updated");
  }

  async function fetchSpotPrices() {
    setPriceLoading(true);

    const results: Record<string, LivePriceRow> = {};
    const now = new Date().toLocaleTimeString("en-AE", {
      timeZone: "Asia/Dubai",
    });
    const proxy = (url: string) =>
      `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;

    let usdToAed = FX.USD;

    try {
      const fxRes = await fetch(
        "https://api.frankfurter.app/latest?from=USD&to=AED"
      );
      const fxData = await fxRes.json();
      if (fxData?.rates?.AED) usdToAed = fxData.rates.AED;
    } catch {
      // fallback
    }

    const getYahooAed = async (ticker: string): Promise<number | null> => {
      try {
        const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=5d`;
        const r = await fetch(proxy(yahooUrl));
        const wrapper = await r.json();
        const text = wrapper?.contents;
        if (!text) return null;

        const data = JSON.parse(text);
        const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
        const currency = data?.chart?.result?.[0]?.meta?.currency ?? "USD";

        if (!price || price <= 0) return null;
        return currency === "USD" ? price * usdToAed : price;
      } catch {
        return null;
      }
    };

    const OZ_TO_G = 31.1034768;
    const keyToUse = goldApiKey || process.env.NEXT_PUBLIC_GOLDAPI_KEY || "";

    if (keyToUse) {
      try {
        const [goldRes, silverRes] = await Promise.all([
          fetch("https://www.goldapi.io/api/XAU/AED", {
            headers: {
              "x-access-token": keyToUse,
              "Content-Type": "application/json",
            },
          }),
          fetch("https://www.goldapi.io/api/XAG/AED", {
            headers: {
              "x-access-token": keyToUse,
              "Content-Type": "application/json",
            },
          }),
        ]);

        if (goldRes.ok) {
          const gold = await goldRes.json();
          if (gold?.price > 0) {
            const ozAed = gold.price;
            const gAed = ozAed / OZ_TO_G;
            results.XAU_OZ = {
              bid: gold.prev_close_price ?? ozAed * 0.999,
              ask: ozAed,
              updated: now,
            };
            results.XAU_G = {
              bid: (gold.prev_close_price ?? ozAed * 0.999) / OZ_TO_G,
              ask: gAed,
              updated: now,
            };
          }
        }

        if (silverRes.ok) {
          const silver = await silverRes.json();
          if (silver?.price > 0) {
            const ozAed = silver.price;
            const gAed = ozAed / OZ_TO_G;
            results.XAG_OZ = {
              bid: silver.prev_close_price ?? ozAed * 0.999,
              ask: ozAed,
              updated: now,
            };
            results.XAG_G = {
              bid: (silver.prev_close_price ?? ozAed * 0.999) / OZ_TO_G,
              ask: gAed,
              updated: now,
            };
          }
        }
      } catch {
        // fallback below
      }
    }

    if (!results.XAU_OZ || !results.XAG_OZ) {
      try {
        const r = await fetch(
          proxy(
            "https://query1.finance.yahoo.com/v8/finance/chart/XAUUSD=X?interval=1d&range=5d"
          )
        );
        const w = await r.json();
        const p =
          JSON.parse(w?.contents ?? "{}")?.chart?.result?.[0]?.meta
            ?.regularMarketPrice ?? 0;

        if (p > 0) {
          const ozAed = p * usdToAed;
          const gAed = ozAed / OZ_TO_G;
          results.XAU_OZ = {
            bid: ozAed * 0.999,
            ask: ozAed,
            updated: now,
          };
          results.XAU_G = {
            bid: gAed * 0.999,
            ask: gAed,
            updated: now,
          };
        }
      } catch {
        // skip
      }

      try {
        const r = await fetch(
          proxy(
            "https://query1.finance.yahoo.com/v8/finance/chart/XAGUSD=X?interval=1d&range=5d"
          )
        );
        const w = await r.json();
        const p =
          JSON.parse(w?.contents ?? "{}")?.chart?.result?.[0]?.meta
            ?.regularMarketPrice ?? 0;

        if (p > 0) {
          const ozAed = p * usdToAed;
          const gAed = ozAed / OZ_TO_G;
          results.XAG_OZ = {
            bid: ozAed * 0.999,
            ask: ozAed,
            updated: now,
          };
          results.XAG_G = {
            bid: gAed * 0.999,
            ask: gAed,
            updated: now,
          };
        }
      } catch {
        // skip
      }
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

    for (const sym of customSymbols.filter((s) => s !== "PARKIN.DFM")) {
      const price = await getYahooAed(sym);
      if (price && price > 0) {
        results[sym] = {
          bid: price * 0.999,
          ask: price,
          updated: now,
        };
      }
    }

    setLivePrices(results);

    if (userId && Object.keys(results).length > 0) {
      await supabase
        .from("profiles")
        .update({ metal_prices: results })
        .eq("id", userId);
    }

    if (userId && Object.keys(results).length > 0) {
      const { data: allItems } = await supabase
        .from("portfolio_items")
        .select("id,live_price_symbol,current_price")
        .eq("user_id", userId);

      const nowIso = new Date().toISOString();

      for (const item of allItems ?? []) {
        const link = item.live_price_symbol ?? "";
        const lp = results[link];

        if (lp && Math.abs(lp.bid - (item.current_price ?? 0)) > 0.001) {
          await supabase
            .from("portfolio_items")
            .update({
              current_price: lp.bid,
              current_price_updated_at: nowIso,
            })
            .eq("id", item.id);
        }
      }

      const { data: updated } = await supabase
        .from("portfolio_items")
        .select("*")
        .eq("user_id", userId)
        .order("created_at");

      if (updated) setItems(updated.map(dbToItem));
    }

    setPriceLoading(false);

    if (Object.keys(results).length > 0) {
      showToast(
        `Updated ${Object.keys(results).length} price${
          Object.keys(results).length > 1 ? "s" : ""
        }`
      );
    } else {
      showToast("No prices found. Check API key or try again in 30s");
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
        notes: newItem.notes,
        live_price_symbol: newItem.livePriceSymbol || null,
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
        notes: "",
        livePriceSymbol: "",
      });
      showToast("Asset added");
    }
  }

  async function deleteItem(id: string) {
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
    let invested = 0;
    let current = 0;

    for (const item of items) {
      const s = allStats[item.id];
      if (!s) continue;

      invested += s.costBasisAed;
      current += item.currentPrice
        ? item.currentPrice * s.totalUnits
        : s.costBasisAed;
    }

    return {
      invested,
      current,
      pl: current - invested,
      plPct: invested > 0 ? ((current - invested) / invested) * 100 : 0,
    };
  }, [items, allStats]);

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
      <div
        style={{
          minHeight: "60vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: V.bg,
        }}
      >
        <div
          style={{
            width: 28,
            height: 28,
            border: `2.5px solid ${V.accent}`,
            borderTopColor: "transparent",
            borderRadius: "50%",
            animation: "spin 0.7s linear infinite",
          }}
        />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  const isUp = totals.pl >= 0;
  const plColor = isUp ? "#16a34a" : "#ef4444";

  return (
    <div
      style={{
        minHeight: "100vh",
        background: V.bg,
        color: V.text,
        fontFamily: "system-ui,sans-serif",
      }}
    >
      <div
        style={{
          padding: "22px 24px 0",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>
            Port<span style={{ color: V.accent, fontStyle: "italic" }}>folio</span>
          </div>
          <div style={{ fontSize: 13, color: V.faint, marginTop: 2 }}>
            Stocks · Gold · Metals
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <div
            style={{
              display: "flex",
              borderRadius: 10,
              overflow: "hidden",
              border: `1px solid ${V.border}`,
            }}
          >
            {(["assets", "prices"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setActiveTab(t)}
                style={{
                  padding: "7px 14px",
                  background: activeTab === t ? V.accent : "transparent",
                  color: activeTab === t ? "#fff" : V.muted,
                  border: "none",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 600,
                  textTransform: "capitalize",
                }}
              >
                {t === "prices" ? "📊 Live Prices" : "My Assets"}
              </button>
            ))}
          </div>

          {activeTab === "assets" && (
            <button style={btn} onClick={fetchAllLivePrices} disabled={liveLoading}>
              {liveLoading ? "Fetching…" : "🔄 Update prices"}
            </button>
          )}

          {activeTab === "assets" && (
            <button style={btnP} onClick={() => setShowAddItem(true)}>
              + Add asset
            </button>
          )}

          {activeTab === "prices" && (
            <button style={btnP} onClick={fetchSpotPrices} disabled={priceLoading}>
              {priceLoading ? "Loading…" : "🔄 Refresh"}
            </button>
          )}
        </div>
      </div>

      {activeTab === "prices" && (
        <div style={{ padding: "14px 24px" }}>
          <div
            style={{
              background: V.card,
              border: `1px solid ${V.border}`,
              borderRadius: 14,
              overflow: "hidden",
              marginBottom: 16,
            }}
          >
            <div
              style={{
                padding: "12px 16px",
                borderBottom: `1px solid ${V.border}`,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 8,
                background: isDark
                  ? "rgba(255,255,255,0.03)"
                  : "rgba(0,0,0,0.02)",
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 800 }}>
                Spot Prices — AED
              </span>

              <div
                style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}
              >
                {!goldApiKey && (
                  <span style={{ fontSize: 11, color: "#ef4444", fontWeight: 600 }}>
                    ⚠ Add goldapi.io key for reliable prices
                  </span>
                )}

                {goldApiKey && (
                  <span style={{ fontSize: 11, color: "#16a34a", fontWeight: 600 }}>
                    ✓ goldapi.io
                  </span>
                )}

                <button
                  onClick={() => {
                    setGoldApiInput(goldApiKey);
                    setShowApiKeyInput((v) => !v);
                  }}
                  style={{ ...btn, padding: "3px 10px", fontSize: 11, color: V.accent }}
                >
                  {goldApiKey ? "Change API key" : "🔑 Add API key"}
                </button>
              </div>
            </div>

            {showApiKeyInput && (
              <div
                style={{
                  padding: "12px 16px",
                  borderBottom: `1px solid ${V.border}`,
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  flexWrap: "wrap",
                  background: isDark
                    ? "rgba(245,166,35,0.04)"
                    : "rgba(245,166,35,0.02)",
                }}
              >
                <div style={{ fontSize: 12, color: V.faint, flex: "0 0 auto" }}>
                  goldapi.io key:
                </div>
                <input
                  style={{
                    ...inp,
                    flex: 1,
                    minWidth: 200,
                    fontFamily: "monospace",
                    fontSize: 12,
                  }}
                  type="password"
                  value={goldApiInput}
                  onChange={(e) => setGoldApiInput(e.target.value)}
                  placeholder="goldapi.io/dashboard → copy your key"
                />
                <button
                  style={{ ...btnP, padding: "6px 12px", fontSize: 12 }}
                  onClick={async () => {
                    const val = goldApiInput.trim();
                    if (userId) {
                      setGoldApiKey(val);
                      await supabase
                        .from("profiles")
                        .update({ goldapi_key: val || null })
                        .eq("id", userId);
                    }
                    setShowApiKeyInput(false);
                    showToast(val ? "API key saved" : "API key removed");
                  }}
                >
                  Save
                </button>
                <button
                  style={{ ...btn, padding: "6px 10px", fontSize: 12 }}
                  onClick={async () => {
                    if (userId) {
                      await supabase
                        .from("profiles")
                        .update({ goldapi_key: null })
                        .eq("id", userId);
                    }
                    setGoldApiKey("");
                    setGoldApiInput("");
                    setShowApiKeyInput(false);
                    showToast("API key removed");
                  }}
                >
                  Remove
                </button>
                <a
                  href="https://www.goldapi.io/"
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontSize: 11, color: V.accent }}
                >
                  Get key →
                </a>
              </div>
            )}

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr 0.7fr",
                gap: 8,
                padding: "8px 16px",
                fontSize: 10,
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: V.faint,
                borderBottom: `1px solid ${V.border}`,
              }}
            >
              <div>Asset</div>
              <div>Buy (Ask)</div>
              <div>Sell (Bid)</div>
              <div>Updated</div>
            </div>

            {[
              { key: "XAU_OZ", label: "24K Gold", sub: "1 oz" },
              { key: "XAU_G", label: "24K Gold", sub: "1 g" },
              { key: "XAG_OZ", label: "999 Silver", sub: "1 oz" },
              { key: "XAG_G", label: "999 Silver", sub: "1 g" },
              ...customSymbols.map((s) => ({ key: s, label: s, sub: "" })),
            ].map((row) => {
              const p = livePrices[row.key];
              return (
                <div
                  key={row.key}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 1fr 0.7fr",
                    gap: 8,
                    padding: "11px 16px",
                    borderBottom: `1px solid ${V.border}`,
                    alignItems: "center",
                  }}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{row.label}</div>
                    <div style={{ fontSize: 11, color: V.faint }}>{row.sub}</div>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "#16a34a" }}>
                    {p ? `AED ${fmtN(p.ask)}` : <span style={{ color: V.faint }}>—</span>}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#ef4444" }}>
                    {p ? `AED ${fmtN(p.bid)}` : <span style={{ color: V.faint }}>—</span>}
                  </div>
                  <div style={{ fontSize: 11, color: V.faint }}>{p?.updated ?? "—"}</div>
                </div>
              );
            })}
          </div>

          <div
            style={{
              background: V.card,
              border: `1px solid ${V.border}`,
              borderRadius: 12,
              padding: "14px 16px",
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>
              Custom symbols
            </div>

            <div
              style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}
            >
              {customSymbols.map((s) => (
                <div
                  key={s}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "4px 10px",
                    borderRadius: 999,
                    background: isDark
                      ? "rgba(255,255,255,0.08)"
                      : "rgba(0,0,0,0.06)",
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  {s}
                  <button
                    onClick={() => setCustomSymbols((p) => p.filter((x) => x !== s))}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: V.faint,
                      fontSize: 14,
                      lineHeight: 1,
                      padding: 0,
                      marginLeft: 2,
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <input
                style={{ ...inp, flex: 1 }}
                value={newSymbol}
                onChange={(e) => setNewSymbol(e.target.value)}
                placeholder="e.g. AAPL, PARKIN.DFM, BTC-USD"
                onKeyDown={(e) => {
                  const trimmed = newSymbol.trim().toUpperCase();
                  if (e.key === "Enter" && trimmed && !customSymbols.includes(trimmed)) {
                    setCustomSymbols((p) => [...p, trimmed]);
                    setNewSymbol("");
                  }
                }}
              />
              <button
                style={btnP}
                onClick={() => {
                  const trimmed = newSymbol.trim().toUpperCase();
                  if (trimmed && !customSymbols.includes(trimmed)) {
                    setCustomSymbols((p) => [...p, trimmed]);
                    setNewSymbol("");
                  }
                }}
              >
                Add
              </button>
            </div>

            <div style={{ fontSize: 11, color: V.faint, marginTop: 8 }}>
              Yahoo Finance symbols: stocks use ticker (AAPL), DFM stocks add .DFM
              (PARKIN.DFM), crypto add -USD (BTC-USD)
            </div>
          </div>
        </div>
      )}

      {activeTab === "assets" && (
        <>
          <div
            style={{
              padding: "12px 24px 0",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill,minmax(155px,1fr))",
              gap: 10,
            }}
          >
            {[
              {
                label: "Total invested",
                value: `AED ${fmtN(totals.invested)}`,
                color: V.accent,
              },
              {
                label: "Current value",
                value: `AED ${fmtN(totals.current)}`,
                color: V.text,
              },
              {
                label: "P&L",
                value: fmtSignedAed(totals.pl),
                color: plColor,
              },
              {
                label: "Return",
                value: `${totals.plPct >= 0 ? "+" : ""}${totals.plPct.toFixed(2)}%`,
                color: plColor,
              },
            ].map((s) => (
              <div
                key={s.label}
                style={{
                  background: V.card,
                  border: `1px solid ${V.border}`,
                  borderRadius: 12,
                  padding: "12px 14px",
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: V.faint,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    marginBottom: 4,
                  }}
                >
                  {s.label}
                </div>
                <div style={{ fontSize: 17, fontWeight: 800, color: s.color }}>
                  {s.value}
                </div>
              </div>
            ))}
          </div>

          <div style={{ padding: "14px 24px" }}>
            {items.length === 0 ? (
              <div style={{ padding: "60px 0", textAlign: "center" }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📈</div>
                <div style={{ fontSize: 16, fontWeight: 600, color: V.muted }}>
                  No assets yet
                </div>
                <div style={{ fontSize: 13, color: V.faint, marginTop: 6 }}>
                  Click + Add asset to start
                </div>
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

                  const curVal = item.currentPrice
                    ? item.currentPrice * s.totalUnits
                    : null;
                  const pl = curVal !== null ? curVal - s.costBasisAed : null;
                  const plPct =
                    pl !== null && s.costBasisAed > 0
                      ? (pl / s.costBasisAed) * 100
                      : null;
                  const up = pl !== null && pl >= 0;

                  return (
                    <div
                      key={item.id}
                      onClick={() => router.push(`/dashboard/portfolio/${item.id}`)}
                      style={{
                        background: V.card,
                        border: `1px solid ${V.border}`,
                        borderRadius: 14,
                        padding: "16px 18px",
                        cursor: "pointer",
                        transition: "border-color 0.15s",
                      }}
                      onMouseEnter={(e) =>
                        ((e.currentTarget as HTMLDivElement).style.borderColor =
                          "rgba(245,166,35,0.4)")
                      }
                      onMouseLeave={(e) =>
                        ((e.currentTarget as HTMLDivElement).style.borderColor =
                          V.border)
                      }
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "flex-start",
                          gap: 12,
                          flexWrap: "wrap",
                        }}
                      >
                        <div
                          style={{ display: "flex", gap: 12, alignItems: "center" }}
                        >
                          <div
                            style={{
                              width: 44,
                              height: 44,
                              borderRadius: 12,
                              background: `${V.accent}15`,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 22,
                              flexShrink: 0,
                            }}
                          >
                            {ASSET_ICONS[item.assetType]}
                          </div>

                          <div>
                            <div
                              style={{
                                display: "flex",
                                gap: 8,
                                alignItems: "center",
                                flexWrap: "wrap",
                              }}
                            >
                              <span style={{ fontSize: 16, fontWeight: 800 }}>
                                {item.name}
                              </span>
                              <span
                                style={{
                                  fontSize: 11,
                                  fontWeight: 700,
                                  padding: "2px 8px",
                                  borderRadius: 999,
                                  background: "rgba(245,166,35,0.1)",
                                  color: V.accent,
                                }}
                              >
                                {item.symbol}
                              </span>
                              {item.livePriceSymbol && (
                                <span
                                  style={{
                                    fontSize: 10,
                                    fontWeight: 700,
                                    padding: "2px 8px",
                                    borderRadius: 999,
                                    background: isDark
                                      ? "rgba(255,255,255,0.08)"
                                      : "rgba(0,0,0,0.06)",
                                    color: V.faint,
                                  }}
                                >
                                  {item.livePriceSymbol}
                                </span>
                              )}
                            </div>

                            <div style={{ fontSize: 12, color: V.faint, marginTop: 2 }}>
                              {fmtN(s.totalUnits, 4)} {item.unitLabel} · Avg AED{" "}
                              {fmtN(s.avgUnitPrice)} / {item.unitLabel}
                            </div>

                            {item.currentPrice && (
                              <div style={{ fontSize: 12, color: V.muted, marginTop: 1 }}>
                                Price:{" "}
                                <strong style={{ color: V.text }}>
                                  AED {fmtN(item.currentPrice)}
                                </strong>
                                {item.currentPriceUpdatedAt && (
                                  <span style={{ color: V.faint, marginLeft: 6 }}>
                                    {new Date(
                                      item.currentPriceUpdatedAt
                                    ).toLocaleDateString("en-AE")}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 16, fontWeight: 800, color: V.text }}>
                            {curVal !== null ? (
                              `AED ${fmtN(curVal)}`
                            ) : (
                              <span style={{ color: V.faint }}>No price</span>
                            )}
                          </div>

                          {pl !== null && plPct !== null && (
                            <div
                              style={{
                                fontSize: 13,
                                fontWeight: 700,
                                color: up ? "#16a34a" : "#ef4444",
                                marginTop: 2,
                              }}
                            >
                              {fmtSignedAed(pl)} ({plPct >= 0 ? "+" : ""}
                              {plPct.toFixed(2)}%)
                            </div>
                          )}

                          <div style={{ fontSize: 11, color: V.faint, marginTop: 2 }}>
                            Invested: AED {fmtN(s.costBasisAed)}
                          </div>

                          <div
                            style={{
                              display: "flex",
                              justifyContent: "flex-end",
                              gap: 6,
                              marginTop: 4,
                              flexWrap: "wrap",
                            }}
                          >
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
                              style={{
                                ...btn,
                                padding: "3px 10px",
                                fontSize: 10,
                                color: "#ef4444",
                                borderColor: "rgba(239,68,68,0.3)",
                              }}
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

          {recent.length > 0 && (
            <div
              style={{
                margin: "0 24px 24px",
                background: V.card,
                border: `1px solid ${V.border}`,
                borderRadius: 14,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  padding: "11px 16px",
                  borderBottom: `1px solid ${V.border}`,
                  fontSize: 11,
                  fontWeight: 800,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  color: V.faint,
                  background: isDark
                    ? "rgba(255,255,255,0.03)"
                    : "rgba(0,0,0,0.02)",
                }}
              >
                Last 10 transactions
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 0.6fr 0.7fr 0.8fr 0.8fr",
                  gap: 8,
                  padding: "8px 16px",
                  fontSize: 10,
                  fontWeight: 800,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: V.faint,
                  borderBottom: `1px solid ${V.border}`,
                }}
              >
                <div>Asset</div>
                <div>Type</div>
                <div>Units</div>
                <div>Amount</div>
                <div>Date</div>
              </div>

              {recent.map((p) => (
                <div
                  key={p.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 0.6fr 0.7fr 0.8fr 0.8fr",
                    gap: 8,
                    padding: "10px 16px",
                    borderBottom: `1px solid ${V.border}`,
                    fontSize: 13,
                    alignItems: "center",
                  }}
                >
                  <div style={{ fontWeight: 700 }}>
                    {p.itemName}{" "}
                    <span style={{ fontSize: 11, color: V.faint }}>
                      ({p.itemSymbol})
                    </span>
                  </div>
                  <div>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 800,
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        color:
                          p.transactionType === "buy" ? "#16a34a" : "#ef4444",
                      }}
                    >
                      {p.transactionType}
                    </span>
                  </div>
                  <div style={{ color: V.muted }}>{fmtN(p.units, 4)}</div>
                  <div style={{ fontWeight: 700 }}>
                    {p.transactionType === "sell" ? "Received: " : "Paid: "}
                    {p.currency} {fmtN(p.totalPaid)}
                  </div>
                  <div style={{ fontSize: 11, color: V.faint }}>
                    {new Date(p.purchasedAt).toLocaleDateString("en-AE")}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {showAddItem && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            zIndex: 50,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            padding: 16,
            overflowY: "auto",
          }}
          onClick={() => setShowAddItem(false)}
        >
          <div
            style={{
              background: V.card,
              border: `1px solid ${V.border}`,
              borderRadius: 18,
              width: "min(520px,100%)",
              maxHeight: "90vh",
              overflow: "auto",
              marginTop: 12,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                padding: "18px 20px",
                borderBottom: `1px solid ${V.border}`,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div style={{ fontSize: 18, fontWeight: 800 }}>Add asset</div>
              <button style={btn} onClick={() => setShowAddItem(false)}>
                ✕
              </button>
            </div>

            <div
              style={{
                padding: 20,
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 14,
              }}
            >
              <label style={lbl}>
                Symbol
                <input
                  style={inp}
                  value={newItem.symbol}
                  onChange={(e) =>
                    setNewItem((p) => ({ ...p, symbol: e.target.value }))
                  }
                  placeholder="e.g. XAU"
                />
              </label>

              <label style={lbl}>
                Name
                <input
                  style={inp}
                  value={newItem.name}
                  onChange={(e) =>
                    setNewItem((p) => ({ ...p, name: e.target.value }))
                  }
                  placeholder="e.g. Gold"
                />
              </label>

              <label style={lbl}>
                Type
                <select
                  style={inp}
                  value={newItem.assetType}
                  onChange={(e) =>
                    setNewItem((p) => ({
                      ...p,
                      assetType: e.target.value as AssetType,
                    }))
                  }
                >
                  <option value="gold">Gold</option>
                  <option value="silver">Silver</option>
                  <option value="stock">Stock</option>
                  <option value="crypto">Crypto</option>
                  <option value="other">Other</option>
                </select>
              </label>

              <label style={lbl}>
                Unit
                <input
                  style={inp}
                  value={newItem.unitLabel}
                  onChange={(e) =>
                    setNewItem((p) => ({ ...p, unitLabel: e.target.value }))
                  }
                  placeholder="oz, share…"
                />
              </label>

              <label style={lbl}>
                Currency
                <select
                  style={inp}
                  value={newItem.mainCurrency}
                  onChange={(e) =>
                    setNewItem((p) => ({
                      ...p,
                      mainCurrency: e.target.value as Currency,
                    }))
                  }
                >
                  <option>AED</option>
                  <option>USD</option>
                  <option>INR</option>
                  <option>GBP</option>
                  <option>EUR</option>
                </select>
              </label>

              <label style={{ ...lbl, gridColumn: "1/-1" }}>
                Live price link
                <select
                  style={inp}
                  value={newItem.livePriceSymbol}
                  onChange={(e) =>
                    setNewItem((p) => ({
                      ...p,
                      livePriceSymbol: e.target.value,
                    }))
                  }
                >
                  {[
                    ...LIVE_PRICE_OPTIONS,
                    ...customSymbols
                      .filter(
                        (s) =>
                          !LIVE_PRICE_OPTIONS.some((o) => o.value === s)
                      )
                      .map((s) => ({
                        value: s,
                        label: s,
                      })),
                  ].map((opt) => (
                    <option key={opt.value || "none"} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <span style={{ fontSize: 11, color: V.faint, marginTop: 2 }}>
                  Asset current price will auto-update from Live Prices tab
                  using the Bid/Sell rate.
                </span>
              </label>

              <label style={{ ...lbl, gridColumn: "1/-1" }}>
                Notes
                <input
                  style={inp}
                  value={newItem.notes}
                  onChange={(e) =>
                    setNewItem((p) => ({ ...p, notes: e.target.value }))
                  }
                />
              </label>
            </div>

            <div
              style={{
                padding: "0 20px 20px",
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
              }}
            >
              <button style={btn} onClick={() => setShowAddItem(false)}>
                Cancel
              </button>
              <button style={btnP} onClick={addItem}>
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {showUpdatePrice && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            zIndex: 50,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            padding: 16,
            overflowY: "auto",
          }}
          onClick={() => setShowUpdatePrice(null)}
        >
          <div
            style={{
              background: V.card,
              border: `1px solid ${V.border}`,
              borderRadius: 18,
              width: "min(380px,100%)",
              marginTop: 12,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                padding: "18px 20px",
                borderBottom: `1px solid ${V.border}`,
                fontSize: 18,
                fontWeight: 800,
              }}
            >
              Update price — {showUpdatePrice.name}
            </div>

            <div style={{ padding: 20 }}>
              <label style={lbl}>
                {showUpdatePrice.mainCurrency} per {showUpdatePrice.unitLabel}
                <input
                  type="number"
                  style={inp}
                  value={newPrice}
                  onChange={(e) => setNewPrice(e.target.value)}
                  placeholder="e.g. 9500"
                  autoFocus
                />
              </label>
            </div>

            <div
              style={{
                padding: "0 20px 20px",
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
              }}
            >
              <button style={btn} onClick={() => setShowUpdatePrice(null)}>
                Cancel
              </button>
              <button style={btnP} onClick={() => updateCurrentPrice(showUpdatePrice)}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteItem && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            zIndex: 50,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            padding: 16,
            overflowY: "auto",
          }}
          onClick={() => setShowDeleteItem(null)}
        >
          <div
            style={{
              background: V.card,
              border: `1px solid ${V.border}`,
              borderRadius: 16,
              padding: 22,
              width: "min(360px,100%)",
              marginTop: 12,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 8 }}>
              Delete asset?
            </div>
            <div style={{ fontSize: 13, color: V.muted, marginBottom: 16 }}>
              All purchases for this asset will also be deleted.
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button style={btn} onClick={() => setShowDeleteItem(null)}>
                Cancel
              </button>
              <button
                style={{ ...btn, borderColor: "rgba(239,68,68,0.4)", color: "#ef4444" }}
                onClick={() => deleteItem(showDeleteItem)}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 20,
            right: 16,
            background: isDark ? "#1a3a2a" : "#f0fdf4",
            color: "#16a34a",
            border: "1px solid rgba(22,163,74,0.3)",
            padding: "12px 18px",
            borderRadius: 12,
            fontSize: 13,
            fontWeight: 700,
            boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
            zIndex: 200,
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}