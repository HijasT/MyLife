"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { markSynced } from "@/hooks/useSyncStatus";
import { getUserTimezone, APP_TZ } from "@/lib/timezone";
import {
  type AssetType,
  type BrokerStat,
  type Currency,
  type ItemStats,
  type PortfolioAlert,
  type PortfolioItem,
  type Purchase,
  EMPTY_ITEM_STATS,
  alertsToTrigger,
  calcCurrentValue,
  computeItemCostBasis,
  dbToAlert,
  dbToItem,
  dbToPurchase,
  fetchAllSpotPrices,
  fetchLivePrice,
  fetchPriceForLiveLink,
  fmtN,
  fmtSignedAed,
} from "@/lib/portfolio";
import { useIsMobile } from "@/hooks/useIsMobile";
import { getTheme, styleKit } from "./_components/theme";
import { Toast } from "./_components/Toast";
import { LoadingSpinner } from "./_components/LoadingSpinner";
import { PortfolioHeader } from "./_components/PortfolioHeader";
import { PricesTab } from "./_components/PricesTab";
import { AlertsStrip } from "./_components/AlertsStrip";
import { AllocationAndFilters } from "./_components/AllocationAndFilters";
import { BrokerTable } from "./_components/BrokerTable";
import { HoldingCard } from "./_components/HoldingCard";
import { RecentTransactionsTable } from "./_components/RecentTransactionsTable";
import { AddItemModal, type NewItemInput } from "./_components/AddItemModal";
import { UpdatePriceModal } from "./_components/UpdatePriceModal";
import { DeleteConfirmModal } from "./_components/Modal";

type LivePriceRow = { bid: number; ask: number; updated: string };

const RECENT_PAGE_SIZE = 10;

export default function PortfolioPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);
  const [timezone, setTimezone] = useState(APP_TZ);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<PortfolioItem[]>([]);
  const [allStats, setAllStats] = useState<Record<string, ItemStats>>({});
  const [brokerStats, setBrokerStats] = useState<Record<string, BrokerStat>>({});
  const [recent, setRecent] = useState<Purchase[]>([]);
  const [liveLoading, setLiveLoading] = useState(false);

  const [activeTab, setActiveTab] = useState<"assets" | "prices">("assets");
  const [livePrices, setLivePrices] = useState<Record<string, LivePriceRow>>({});
  const [priceLoading, setPriceLoading] = useState(false);

  const [goldApiKey, setGoldApiKey] = useState("");
  const [customSymbols, setCustomSymbols] = useState<string[]>(["PARKIN.DFM"]);

  const [showAddItem, setShowAddItem] = useState(false);
  const [showDeleteItem, setShowDeleteItem] = useState<string | null>(null);
  const [showUpdatePrice, setShowUpdatePrice] = useState<PortfolioItem | null>(null);
  const [toast, setToast] = useState("");

  const [typeFilter, setTypeFilter] = useState<AssetType | "all">("all");
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [itemPurchases, setItemPurchases] = useState<Record<string, Purchase[]>>({});

  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"value" | "pl" | "name">("value");

  const [allAlerts, setAllAlerts] = useState<PortfolioAlert[]>([]);
  const [dismissedAlertIds, setDismissedAlertIds] = useState<string[]>([]);

  const [recentOffset, setRecentOffset] = useState(0);
  const [recentHasMore, setRecentHasMore] = useState(true);
  const [loadingMoreRecent, setLoadingMoreRecent] = useState(false);

  const [isDark, setIsDark] = useState(typeof document !== "undefined" && document.documentElement.classList.contains("dark"));
  const isMobile = useIsMobile();

  useEffect(() => {
    const root = document.documentElement;
    const update = () => setIsDark(root.classList.contains("dark"));
    update();
    const observer = new MutationObserver(update);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  const loadStats = useCallback(
    async (itemList: PortfolioItem[]) => {
      const results: Record<string, ItemStats> = {};
      const brokerAcc: Record<string, BrokerStat> = {};

      await Promise.all(
        itemList.map(async (item) => {
          const { data } = await supabase.from("portfolio_purchases").select("units,total_paid,currency,purchased_at,source").eq("item_id", item.id).order("purchased_at", { ascending: true });

          if (!data) {
            results[item.id] = EMPTY_ITEM_STATS;
            return;
          }

          const { stats, brokerContributions } = computeItemCostBasis(data, item);
          results[item.id] = stats;

          for (const [src, b] of Object.entries(brokerContributions)) {
            const acc =
              brokerAcc[src] ??
              (brokerAcc[src] = {
                label: b.label,
                totalBoughtAed: 0,
                totalSoldAed: 0,
                remainingCostBasisAed: 0,
                currentValueAed: 0,
                realizedPlAed: 0,
                hasUnknownPrice: false,
              });
            acc.totalBoughtAed += b.totalBoughtAed;
            acc.totalSoldAed += b.totalSoldAed;
            acc.remainingCostBasisAed += b.remainingCostBasisAed;
            acc.realizedPlAed += b.realizedPlAed;
            if (b.currentValueAed !== null) acc.currentValueAed += b.currentValueAed;
            else acc.hasUnknownPrice = true;
          }
        }),
      );

      setAllStats(results);
      setBrokerStats(brokerAcc);
    },
    [supabase],
  );

  const loadAllAlerts = useCallback(
    async (uid: string) => {
      const { data } = await supabase.from("portfolio_alerts").select("*,portfolio_items(name,symbol)").eq("user_id", uid).or("is_active.eq.true,triggered_at.not.is.null").order("created_at", { ascending: false });
      setAllAlerts((data ?? []).map(dbToAlert));
    },
    [supabase],
  );

  // Checks portfolio_alerts for any items whose price just changed and
  // batch-triggers the ones that crossed their target — this is what makes
  // alerts fire from a list-page price refresh instead of only firing when
  // the user happens to open that specific item's detail page afterward.
  const checkAndTriggerAlerts = useCallback(
    async (updated: Array<{ id: string; currentPrice: number | null }>) => {
      if (!userId) return;

      const priceByItem = new Map(updated.filter((u) => u.currentPrice != null).map((u) => [u.id, u.currentPrice as number]));
      if (priceByItem.size === 0) return;

      const { data: alertRows } = await supabase
        .from("portfolio_alerts")
        .select("id,item_id,alert_type,target_price,is_active,triggered_at")
        .eq("user_id", userId)
        .eq("is_active", true)
        .is("triggered_at", null)
        .in("item_id", Array.from(priceByItem.keys()));

      if (!alertRows || alertRows.length === 0) return;

      const byItem = new Map<string, typeof alertRows>();
      for (const row of alertRows) {
        const list = byItem.get(row.item_id) ?? [];
        list.push(row);
        byItem.set(row.item_id, list);
      }

      const idsToTrigger: string[] = [];
      for (const [itemId, rows] of byItem) {
        const price = priceByItem.get(itemId);
        if (price == null) continue;
        idsToTrigger.push(...alertsToTrigger(rows, price));
      }

      if (idsToTrigger.length === 0) return;

      const nowIso = new Date().toISOString();
      await supabase.from("portfolio_alerts").update({ triggered_at: nowIso, is_active: false }).in("id", idsToTrigger);

      showToast(`${idsToTrigger.length} price alert${idsToTrigger.length > 1 ? "s" : ""} triggered`);
      await loadAllAlerts(userId);
    },
    [userId, supabase, loadAllAlerts],
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
      setTimezone(await getUserTimezone(supabase, user.id));

      const [ir, pr, profileRes] = await Promise.all([
        supabase.from("portfolio_items").select("*").eq("user_id", user.id).order("created_at"),
        supabase.from("portfolio_purchases").select("*,portfolio_items(name,symbol)").eq("user_id", user.id).order("purchased_at", { ascending: false }).limit(RECENT_PAGE_SIZE),
        supabase.from("profiles").select("goldapi_key, metal_prices").eq("id", user.id).single(),
      ]);

      const loadedItems = (ir.data ?? []).map(dbToItem);
      setItems(loadedItems);

      const recentRows = (pr.data ?? []).map(dbToPurchase);
      setRecent(recentRows);
      setRecentOffset(recentRows.length);
      setRecentHasMore(recentRows.length === RECENT_PAGE_SIZE);

      await loadStats(loadedItems);
      await loadAllAlerts(user.id);
      markSynced();

      const envGoldKey = process.env.NEXT_PUBLIC_GOLDAPI_KEY ?? "";
      const dbGoldKey = profileRes.data?.goldapi_key ?? "";
      setGoldApiKey(dbGoldKey || envGoldKey);

      if (profileRes.data?.metal_prices) {
        const rawMetalPrices = profileRes.data.metal_prices as Record<string, unknown>;
        // __custom_symbols is a reserved key smuggled into this JSONB column
        // (same pattern as Due Tracker's __remittance_group/__remittance_status
        // in cash_in) to persist the custom symbol list without a schema
        // migration — it must be kept out of the price-row map below.
        const storedCustomSymbols = Array.isArray(rawMetalPrices.__custom_symbols) ? (rawMetalPrices.__custom_symbols as string[]) : ["PARKIN.DFM"];
        setCustomSymbols(storedCustomSymbols);

        const priceRows: Record<string, LivePriceRow> = {};
        for (const [k, v] of Object.entries(rawMetalPrices)) {
          if (k !== "__custom_symbols") priceRows[k] = v as LivePriceRow;
        }
        setLivePrices(priceRows);
      }

      setLoading(false);
    }

    load();
  }, [loadStats, loadAllAlerts, supabase]);

  async function fetchAllLivePrices() {
    setLiveLoading(true);

    const updatable = items.filter((i) => i.livePriceSymbol || ["gold", "silver", "stock", "crypto"].includes(i.assetType));
    const updates: PortfolioItem[] = [...items];

    await Promise.all(
      updatable.map(async (item) => {
        const price = item.livePriceSymbol ? await fetchPriceForLiveLink(item.livePriceSymbol) : await fetchLivePrice(item.symbol);
        if (price && price > 0) {
          const nowIso = new Date().toISOString();
          await supabase.from("portfolio_items").update({ current_price: price, current_price_updated_at: nowIso }).eq("id", item.id);
          const idx = updates.findIndex((x) => x.id === item.id);
          if (idx >= 0) updates[idx] = { ...updates[idx], currentPrice: price, currentPriceUpdatedAt: nowIso };
        }
      }),
    );

    setItems([...updates]);
    setLiveLoading(false);
    showToast("Live prices updated");
    await checkAndTriggerAlerts(
      updatable.map((i) => {
        const u = updates.find((x) => x.id === i.id);
        return { id: i.id, currentPrice: u?.currentPrice ?? null };
      }),
    );
  }

  async function fetchSpotPrices() {
    setPriceLoading(true);

    const nowLabel = new Date().toLocaleTimeString("en-AE", { timeZone: timezone });
    const results = await fetchAllSpotPrices(customSymbols, goldApiKey, nowLabel);
    setLivePrices(results);

    if (userId && Object.keys(results).length > 0) {
      // Merge with __custom_symbols rather than overwriting metal_prices
      // wholesale — otherwise this refresh would silently wipe out the
      // persisted custom symbol list.
      const merged: Record<string, unknown> = { ...results, __custom_symbols: customSymbols };
      await supabase.from("profiles").update({ metal_prices: merged }).eq("id", userId);
    }

    if (userId && Object.keys(results).length > 0) {
      const { data: allItems } = await supabase.from("portfolio_items").select("id,live_price_symbol,current_price").eq("user_id", userId);
      const nowIso = new Date().toISOString();

      for (const item of allItems ?? []) {
        const link = item.live_price_symbol ?? "";
        const lp = results[link];
        if (lp && Math.abs(lp.bid - (item.current_price ?? 0)) > 0.001) {
          await supabase.from("portfolio_items").update({ current_price: lp.bid, current_price_updated_at: nowIso }).eq("id", item.id);
        }
      }

      const { data: updated } = await supabase.from("portfolio_items").select("*").eq("user_id", userId).order("created_at");
      if (updated) {
        setItems(updated.map(dbToItem));
        await checkAndTriggerAlerts(updated.map((u) => ({ id: u.id, currentPrice: u.current_price ?? null })));
      }
    }

    setPriceLoading(false);

    if (Object.keys(results).length > 0) {
      showToast(`Updated ${Object.keys(results).length} price${Object.keys(results).length > 1 ? "s" : ""}`);
    } else {
      showToast("No prices found. Check API key or try again in 30s");
    }
  }

  async function addItem(newItem: NewItemInput) {
    if (!userId || !newItem.symbol.trim() || !newItem.name.trim()) {
      showToast("Symbol and name required");
      return;
    }

    const { data, error } = await supabase
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
        gold_purity_karat: newItem.assetType === "gold" && newItem.goldPurityKarat ? Number(newItem.goldPurityKarat) : null,
        weight_grams: newItem.assetType === "gold" && newItem.weightGrams ? Number(newItem.weightGrams) : null,
      })
      .select("*")
      .single();

    if (error) {
      showToast("Failed to add asset");
      return;
    }

    if (data) {
      const added = dbToItem(data);
      setItems((p) => [...p, added]);
      setAllStats((p) => ({ ...p, [added.id]: EMPTY_ITEM_STATS }));
      setShowAddItem(false);
      showToast("Asset added");
    }
  }

  async function deleteItem(id: string) {
    if (!userId) return;
    const { error: purErr } = await supabase.from("portfolio_purchases").delete().eq("item_id", id).eq("user_id", userId);
    if (purErr) {
      showToast("Failed to delete asset");
      return;
    }
    const { error: itemErr } = await supabase.from("portfolio_items").delete().eq("id", id).eq("user_id", userId);
    if (itemErr) {
      showToast("Failed to delete asset");
      return;
    }

    setItems((p) => p.filter((x) => x.id !== id));
    setAllStats((p) => {
      const n = { ...p };
      delete n[id];
      return n;
    });
    setShowDeleteItem(null);
    showToast("Asset deleted");
  }

  async function updateCurrentPrice(item: PortfolioItem, priceInput: string, goldPurityInput: string, goldWeightInput: string) {
    const price = parseFloat(priceInput);
    if (isNaN(price) || price <= 0) {
      showToast("Enter a valid price");
      return;
    }

    const nowIso = new Date().toISOString();
    const updatePayload: Record<string, unknown> = { current_price: price, current_price_updated_at: nowIso };

    if (item.assetType === "gold") {
      updatePayload.gold_purity_karat = goldPurityInput ? Number(goldPurityInput) : null;
      updatePayload.weight_grams = goldWeightInput ? Number(goldWeightInput) : null;
    }

    const { error } = await supabase.from("portfolio_items").update(updatePayload).eq("id", item.id);
    if (error) {
      showToast("Failed to update price");
      return;
    }

    setItems((p) =>
      p.map((x) =>
        x.id === item.id
          ? {
              ...x,
              currentPrice: price,
              currentPriceUpdatedAt: nowIso,
              goldPurityKarat: item.assetType === "gold" ? (goldPurityInput ? Number(goldPurityInput) : null) : x.goldPurityKarat,
              weightGrams: item.assetType === "gold" ? (goldWeightInput ? Number(goldWeightInput) : null) : x.weightGrams,
            }
          : x,
      ),
    );
    setShowUpdatePrice(null);
    showToast(item.assetType === "gold" ? "Gold details updated" : "Price updated");
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  }

  // Persist the custom-symbol list into profiles.metal_prices.__custom_symbols
  // (reserved key, merged alongside the real price rows keyed by symbol) so it
  // survives a reload — previously customSymbols only ever lived in useState.
  async function persistCustomSymbols(next: string[]) {
    setCustomSymbols(next);
    if (!userId) return;
    const merged: Record<string, unknown> = { ...livePrices, __custom_symbols: next };
    await supabase.from("profiles").update({ metal_prices: merged }).eq("id", userId);
  }

  function addCustomSymbol(sym: string) {
    const trimmed = sym.trim().toUpperCase();
    if (!trimmed || customSymbols.includes(trimmed)) return;
    void persistCustomSymbols([...customSymbols, trimmed]);
  }

  function removeCustomSymbol(sym: string) {
    void persistCustomSymbols(customSymbols.filter((x) => x !== sym));
  }

  async function saveApiKey(key: string) {
    setGoldApiKey(key);
    if (userId) {
      await supabase.from("profiles").update({ goldapi_key: key || null }).eq("id", userId);
    }
    showToast(key ? "API key saved" : "API key removed");
  }

  async function removeApiKey() {
    if (userId) {
      await supabase.from("profiles").update({ goldapi_key: null }).eq("id", userId);
    }
    setGoldApiKey("");
    showToast("API key removed");
  }

  async function loadMoreRecent() {
    if (!userId || loadingMoreRecent || !recentHasMore) return;
    setLoadingMoreRecent(true);

    const { data } = await supabase
      .from("portfolio_purchases")
      .select("*,portfolio_items(name,symbol)")
      .eq("user_id", userId)
      .order("purchased_at", { ascending: false })
      .range(recentOffset, recentOffset + RECENT_PAGE_SIZE - 1);

    const rows = (data ?? []).map(dbToPurchase);
    setRecent((p) => [...p, ...rows]);
    setRecentOffset((o) => o + rows.length);
    setRecentHasMore(rows.length === RECENT_PAGE_SIZE);
    setLoadingMoreRecent(false);
  }

  async function toggleTransactionDrawer(itemId: string) {
    if (expandedItemId === itemId) {
      setExpandedItemId(null);
      return;
    }
    setExpandedItemId(itemId);
    if (!itemPurchases[itemId]) {
      const { data } = await supabase.from("portfolio_purchases").select("*").eq("item_id", itemId).order("purchased_at", { ascending: false }).limit(15);
      setItemPurchases((p) => ({ ...p, [itemId]: (data ?? []).map(dbToPurchase) }));
    }
  }

  function downloadCsv(filename: string, rows: string[][]) {
    const csv = rows.map((row) => row.map((cell) => (/[",\n]/.test(String(cell ?? "")) ? `"${String(cell ?? "").replace(/"/g, '""')}"` : String(cell ?? ""))).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function exportAssetsCsv() {
    const header = ["Symbol", "Name", "Type", "Total units", "Avg cost (AED)", "Current value (AED)", "Invested (AED)", "P&L (AED)", "P&L %"];
    const rows = items.map((item) => {
      const s = allStats[item.id] ?? EMPTY_ITEM_STATS;
      const cv = calcCurrentValue(item, s.totalUnits);
      const pl = cv !== null ? cv - s.costBasisAed : null;
      const plPct = pl !== null && s.costBasisAed > 0 ? (pl / s.costBasisAed) * 100 : null;
      return [item.symbol, item.name, item.assetType, s.totalUnits.toFixed(4), s.avgUnitPrice.toFixed(2), cv !== null ? cv.toFixed(2) : "", s.costBasisAed.toFixed(2), pl !== null ? pl.toFixed(2) : "", plPct !== null ? plPct.toFixed(2) : ""];
    });
    downloadCsv(`portfolio-assets-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...rows]);
  }

  const totals = useMemo(() => {
    let invested = 0;
    let current = 0;
    for (const item of items) {
      const s = allStats[item.id];
      if (!s) continue;
      invested += s.costBasisAed;
      const cv = calcCurrentValue(item, s.totalUnits);
      current += cv !== null ? cv : s.costBasisAed;
    }
    return { invested, current, pl: current - invested, plPct: invested > 0 ? ((current - invested) / invested) * 100 : 0 };
  }, [items, allStats]);

  // Search + sort compose with the existing type-filter tabs: filter by
  // type AND search text, then sort.
  const visibleItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = items.filter((item) => {
      if (typeFilter !== "all" && item.assetType !== typeFilter) return false;
      if (!q) return true;
      return item.name.toLowerCase().includes(q) || item.symbol.toLowerCase().includes(q);
    });

    const withDerived = filtered.map((item) => {
      const s = allStats[item.id] ?? EMPTY_ITEM_STATS;
      const curVal = calcCurrentValue(item, s.totalUnits);
      const pl = curVal !== null ? curVal - s.costBasisAed : null;
      return { item, s, curVal, pl };
    });

    withDerived.sort((a, b) => {
      if (sortBy === "name") return a.item.name.localeCompare(b.item.name);
      if (sortBy === "pl") return (b.pl ?? -Infinity) - (a.pl ?? -Infinity);
      return (b.curVal ?? -Infinity) - (a.curVal ?? -Infinity);
    });

    return withDerived;
  }, [items, allStats, typeFilter, searchQuery, sortBy]);

  const typeBreakdown = useMemo(() => {
    const breakdown: Record<AssetType, number> = { gold: 0, silver: 0, stock: 0, crypto: 0, other: 0 };
    for (const item of items) {
      const s = allStats[item.id];
      if (!s) continue;
      const cv = calcCurrentValue(item, s.totalUnits);
      const valueAed = cv !== null ? cv : s.costBasisAed || 0;
      breakdown[item.assetType] = (breakdown[item.assetType] ?? 0) + Math.max(0, valueAed);
    }
    return breakdown;
  }, [items, allStats]);

  const itemCounts = useMemo(() => {
    const counts: Record<string, number> = { all: items.length };
    for (const it of items) counts[it.assetType] = (counts[it.assetType] ?? 0) + 1;
    return counts;
  }, [items]);

  const V = getTheme(isDark);
  const { btn, btnP, inp, lbl } = styleKit(V, isMobile, isDark);

  if (loading) return <LoadingSpinner bg={V.bg} accent={V.accent} />;

  const isUp = totals.pl >= 0;
  const plColor = isUp ? V.pos : V.neg;

  return (
    <div style={{ minHeight: "100vh", background: V.bg, color: V.text, fontFamily: "system-ui,sans-serif" }}>
      <PortfolioHeader
        V={V}
        btn={btn}
        btnP={btnP}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        liveLoading={liveLoading}
        priceLoading={priceLoading}
        hasItems={items.length > 0}
        onUpdatePrices={() => void fetchAllLivePrices()}
        onExportCsv={exportAssetsCsv}
        onAddAsset={() => setShowAddItem(true)}
        onRefreshSpotPrices={() => void fetchSpotPrices()}
      />

      {activeTab === "prices" && (
        <PricesTab
          V={V}
          btn={btn}
          btnP={btnP}
          inp={inp}
          isMobile={isMobile}
          isDark={isDark}
          goldApiKey={goldApiKey}
          livePrices={livePrices}
          customSymbols={customSymbols}
          onSaveApiKey={(key) => void saveApiKey(key)}
          onRemoveApiKey={() => void removeApiKey()}
          onAddCustomSymbol={addCustomSymbol}
          onRemoveCustomSymbol={removeCustomSymbol}
        />
      )}

      {activeTab === "assets" && (
        <>
          <div style={{ padding: "12px 24px 0" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(155px,1fr))", gap: 10 }}>
              {[
                { label: "Total invested", value: `AED ${fmtN(totals.invested)}`, color: V.accent },
                { label: "Current value", value: `AED ${fmtN(totals.current)}`, color: V.text },
                { label: "P&L", value: fmtSignedAed(totals.pl), color: plColor },
                { label: "Return", value: `${totals.plPct >= 0 ? "+" : ""}${totals.plPct.toFixed(2)}%`, color: plColor },
              ].map((s) => (
                <div key={s.label} style={{ background: V.card, border: `1px solid ${V.border}`, borderRadius: 12, padding: "14px 16px", boxShadow: V.shadow }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: V.faint, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>{s.label}</div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: s.color }}>{s.value}</div>
                </div>
              ))}
            </div>
          </div>

          <AlertsStrip V={V} isDark={isDark} alerts={allAlerts} dismissedIds={dismissedAlertIds} onOpenItem={(itemId) => router.push(`/dashboard/portfolio/${itemId}`)} onDismiss={(id) => setDismissedAlertIds((p) => [...p, id])} />

          {items.length > 0 && (
            <AllocationAndFilters
              V={V}
              isDark={isDark}
              inp={inp}
              typeBreakdown={typeBreakdown}
              itemCounts={itemCounts}
              typeFilter={typeFilter}
              onTypeFilterChange={setTypeFilter}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              sortBy={sortBy}
              onSortChange={setSortBy}
            />
          )}

          <BrokerTable V={V} isDark={isDark} isMobile={isMobile} brokerStats={brokerStats} />

          <div style={{ padding: "14px 24px" }}>
            {items.length === 0 ? (
              <div style={{ padding: "60px 0", textAlign: "center" }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📈</div>
                <div style={{ fontSize: 16, fontWeight: 600, color: V.muted }}>No assets yet</div>
                <div style={{ fontSize: 13, color: V.faint, marginTop: 6 }}>Click + Add asset to start</div>
              </div>
            ) : visibleItems.length === 0 ? (
              <div style={{ padding: "40px 0", textAlign: "center" }}>
                <div style={{ fontSize: 13, color: V.faint }}>No assets match your search/filter</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {visibleItems.map(({ item, s, curVal, pl }) => (
                  <HoldingCard
                    key={item.id}
                    V={V}
                    btn={btn}
                    isDark={isDark}
                    isMobile={isMobile}
                    item={item}
                    stats={s}
                    currentValue={curVal}
                    pl={pl}
                    activeAlertCount={allAlerts.filter((a) => a.itemId === item.id && a.isActive && !a.triggeredAt).length}
                    isExpanded={expandedItemId === item.id}
                    transactions={itemPurchases[item.id]}
                    onOpenDetail={() => router.push(`/dashboard/portfolio/${item.id}`)}
                    onToggleExpand={() => void toggleTransactionDrawer(item.id)}
                    onUpdatePrice={() => setShowUpdatePrice(item)}
                    onDelete={() => setShowDeleteItem(item.id)}
                  />
                ))}
              </div>
            )}
          </div>

          <RecentTransactionsTable V={V} btn={btn} isDark={isDark} isMobile={isMobile} recent={recent} hasMore={recentHasMore} loadingMore={loadingMoreRecent} onLoadMore={() => void loadMoreRecent()} />
        </>
      )}

      {showAddItem && <AddItemModal V={V} btn={btn} btnP={btnP} inp={inp} lbl={lbl} isMobile={isMobile} customSymbols={customSymbols} onClose={() => setShowAddItem(false)} onSubmit={(item) => void addItem(item)} />}

      {showUpdatePrice && (
        <UpdatePriceModal V={V} btn={btn} btnP={btnP} inp={inp} lbl={lbl} item={showUpdatePrice} onClose={() => setShowUpdatePrice(null)} onSubmit={(price, purity, weight) => void updateCurrentPrice(showUpdatePrice, price, purity, weight)} />
      )}

      {showDeleteItem && <DeleteConfirmModal V={V} btn={btn} title="Delete asset?" message="All purchases for this asset will also be deleted." onCancel={() => setShowDeleteItem(null)} onConfirm={() => void deleteItem(showDeleteItem)} />}

      <Toast message={toast} isDark={isDark} pos={V.pos} />
    </div>
  );
}
