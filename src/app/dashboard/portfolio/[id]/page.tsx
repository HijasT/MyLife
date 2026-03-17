"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { nowDubai } from "@/lib/timezone";
import { createClient } from "@/lib/supabase/client";

type Currency = "AED" | "INR" | "USD" | "GBP" | "EUR";
type AssetType = "gold" | "silver" | "stock" | "crypto" | "other";
type TxType = "buy" | "sell";
type AlertType = "above" | "below";

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
};

type Purchase = {
  id: string;
  purchasedAt: string;
  unitPrice: number;
  units: number;
  totalPaid: number;
  currency: Currency;
  source: string;
  notes: string;
  transactionType: TxType;
};

type PortfolioAlert = {
  id: string;
  alertType: AlertType;
  targetPrice: number;
  isActive: boolean;
  triggeredAt: string | null;
  createdAt: string;
};

const FX_TO_AED: Record<string, number> = {
  AED: 1,
  USD: 3.67,
  INR: 0.044,
  GBP: 4.62,
  EUR: 4.0,
};

function toAed(amt: number, cur: Currency) {
  return amt * (FX_TO_AED[cur] ?? 1);
}

function fmtNum(n: number, dec = 2) {
  return n.toLocaleString("en-AE", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  });
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-AE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-AE", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtSignedAed(n: number | null) {
  if (n === null) return "—";
  return `${n >= 0 ? "+" : "-"}AED ${fmtNum(Math.abs(n))}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dbToItem(r: any): PortfolioItem {
  return {
    id: r.id,
    symbol: r.symbol,
    name: r.name,
    assetType: r.asset_type as AssetType,
    unitLabel: r.unit_label ?? "unit",
    mainCurrency: (r.main_currency ?? "AED") as Currency,
    currentPrice: r.current_price ?? null,
    currentPriceUpdatedAt: r.current_price_updated_at ?? null,
    notes: r.notes ?? "",
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dbToPurchase(r: any): Purchase {
  const tx: TxType =
    r.transaction_type ??
    (Number(r.units) < 0 || Number(r.total_paid) < 0 ? "sell" : "buy");

  return {
    id: r.id,
    purchasedAt: r.purchased_at,
    unitPrice: Math.abs(Number(r.unit_price) || 0),
    units: Math.abs(Number(r.units) || 0),
    totalPaid: Math.abs(Number(r.total_paid) || 0),
    currency: (r.currency ?? "AED") as Currency,
    source: r.source ?? "",
    notes: r.notes ?? "",
    transactionType: tx,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dbToAlert(r: any): PortfolioAlert {
  return {
    id: r.id,
    alertType: r.alert_type as AlertType,
    targetPrice: Number(r.target_price) || 0,
    isActive: !!r.is_active,
    triggeredAt: r.triggered_at ?? null,
    createdAt: r.created_at,
  };
}

export default function PortfolioItemPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const router = useRouter();

  const [item, setItem] = useState<PortfolioItem | null>(null);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [alerts, setAlerts] = useState<PortfolioAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editPurchase, setEditPurchase] = useState<Purchase | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [showUpdatePrice, setShowUpdatePrice] = useState(false);
  const [showAddAlert, setShowAddAlert] = useState(false);
  const [newPrice, setNewPrice] = useState("");
  const [toast, setToast] = useState("");
  const [userId, setUserId] = useState<string | null>(null);

  const [alertForm, setAlertForm] = useState({
    alertType: "above" as AlertType,
    targetPrice: "",
  });

  const [af, setAf] = useState({
    transactionType: "buy" as TxType,
    purchasedAt: nowDubai().slice(0, 16),
    unitPrice: "",
    units: "",
    totalPaid: "",
    currency: "AED" as Currency,
    source: "",
    notes: "",
  });

  const isDark =
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark");

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      setUserId(user.id);

      const [itemRes, purRes, alertRes] = await Promise.all([
        supabase.from("portfolio_items").select("*").eq("id", params.id).single(),
        supabase
          .from("portfolio_purchases")
          .select("*")
          .eq("item_id", params.id)
          .order("purchased_at", { ascending: false }),
        supabase
          .from("portfolio_alerts")
          .select("*")
          .eq("item_id", params.id)
          .order("created_at", { ascending: false }),
      ]);

      if (itemRes.data) setItem(dbToItem(itemRes.data));
      if (purRes.data) setPurchases(purRes.data.map(dbToPurchase));
      if (alertRes.data) setAlerts(alertRes.data.map(dbToAlert));

      setLoading(false);
    }

    load();
  }, [params.id, router, supabase]);

  useEffect(() => {
    async function syncAlerts() {
      if (!item?.currentPrice || alerts.length === 0) return;

      const toTrigger = alerts.filter(
        (a) =>
          a.isActive &&
          !a.triggeredAt &&
          ((a.alertType === "above" && item.currentPrice! >= a.targetPrice) ||
            (a.alertType === "below" && item.currentPrice! <= a.targetPrice))
      );

      if (toTrigger.length === 0) return;

      const nowIso = new Date().toISOString();
      const ids = toTrigger.map((a) => a.id);

      await supabase
        .from("portfolio_alerts")
        .update({ triggered_at: nowIso, is_active: false })
        .in("id", ids);

      setAlerts((prev) =>
        prev.map((a) =>
          ids.includes(a.id) ? { ...a, triggeredAt: nowIso, isActive: false } : a
        )
      );

      showToast(
        `${toTrigger.length} alert${toTrigger.length > 1 ? "s" : ""} triggered`
      );
    }

    syncAlerts();
  }, [item?.currentPrice, alerts, supabase]);

  const stats = useMemo(() => {
    const ordered = [...purchases].sort(
      (a, b) => new Date(a.purchasedAt).getTime() - new Date(b.purchasedAt).getTime()
    );

    let totalUnits = 0;
    let costBasisAed = 0;
    let totalBuysAed = 0;
    let totalSellsAed = 0;
    let realizedPlAed = 0;

    for (const p of ordered) {
      const amountAed = toAed(p.totalPaid, p.currency);

      if (p.transactionType === "buy") {
        totalUnits += p.units;
        costBasisAed += amountAed;
        totalBuysAed += amountAed;
      } else {
        const sellUnits = Math.min(p.units, totalUnits);
        const avgCostBeforeSell = totalUnits > 0 ? costBasisAed / totalUnits : 0;
        const costRemoved = avgCostBeforeSell * sellUnits;

        totalUnits = Math.max(0, totalUnits - sellUnits);
        costBasisAed = Math.max(0, costBasisAed - costRemoved);
        totalSellsAed += amountAed;
        realizedPlAed += amountAed - costRemoved;
      }
    }

    const avgUnitPrice = totalUnits > 0 ? costBasisAed / totalUnits : 0;
    const currentValueAed =
      item?.currentPrice !== null && item?.currentPrice !== undefined
        ? item.currentPrice * totalUnits
        : null;
    const pl = currentValueAed !== null ? currentValueAed - costBasisAed : null;
    const plPct = pl !== null && costBasisAed > 0 ? (pl / costBasisAed) * 100 : null;

    return {
      totalUnits,
      costBasisAed,
      totalBuysAed,
      totalSellsAed,
      realizedPlAed,
      avgUnitPrice,
      currentValueAed,
      pl,
      plPct,
    };
  }, [purchases, item]);

  const transactionRows = useMemo(() => {
    const orderedAsc = [...purchases].sort(
      (a, b) => new Date(a.purchasedAt).getTime() - new Date(b.purchasedAt).getTime()
    );

    let runningUnits = 0;
    let runningCostBasisAed = 0;

    const infoMap = new Map<
      string,
      {
        amountAed: number;
        plAed: number | null;
        plLabel: "Unrealized P&L" | "Realized P&L";
      }
    >();

    for (const p of orderedAsc) {
      const amountAed = toAed(p.totalPaid, p.currency);

      if (p.transactionType === "buy") {
        const currentValAed =
          item?.currentPrice !== null && item?.currentPrice !== undefined
            ? item.currentPrice * p.units
            : null;

        infoMap.set(p.id, {
          amountAed,
          plAed: currentValAed !== null ? currentValAed - amountAed : null,
          plLabel: "Unrealized P&L",
        });

        runningUnits += p.units;
        runningCostBasisAed += amountAed;
      } else {
        const sellUnits = Math.min(p.units, runningUnits);
        const avgCostBeforeSell =
          runningUnits > 0 ? runningCostBasisAed / runningUnits : 0;
        const costRemoved = avgCostBeforeSell * sellUnits;
        const realizedPlAed = amountAed - costRemoved;

        infoMap.set(p.id, {
          amountAed,
          plAed: realizedPlAed,
          plLabel: "Realized P&L",
        });

        runningUnits = Math.max(0, runningUnits - sellUnits);
        runningCostBasisAed = Math.max(0, runningCostBasisAed - costRemoved);
      }
    }

    return purchases.map((p) => ({
      purchase: p,
      ...infoMap.get(p.id),
    }));
  }, [purchases, item]);

  function getAvailableUnitsExcluding(editId?: string) {
    const net = purchases.reduce((sum, p) => {
      if (editId && p.id === editId) return sum;
      return sum + (p.transactionType === "buy" ? p.units : -p.units);
    }, 0);

    return Math.max(0, net);
  }

  async function addPurchase() {
    if (!userId || !item) return;

    const unitPrice = parseFloat(af.unitPrice);
    const units = parseFloat(af.units);
    const totalPaid = parseFloat(af.totalPaid) || unitPrice * units;

    if (isNaN(unitPrice) || isNaN(units) || unitPrice <= 0 || units <= 0) {
      showToast("Enter valid price and units");
      return;
    }

    if (af.transactionType === "sell" && units > stats.totalUnits) {
      showToast(`You only have ${fmtNum(stats.totalUnits, 4)} ${item.unitLabel}`);
      return;
    }

    const signedUnits = af.transactionType === "sell" ? -units : units;
    const signedTotalPaid = af.transactionType === "sell" ? -totalPaid : totalPaid;

    const { data } = await supabase
      .from("portfolio_purchases")
      .insert({
        user_id: userId,
        item_id: item.id,
        purchased_at: new Date(af.purchasedAt).toISOString(),
        unit_price: unitPrice,
        units: signedUnits,
        total_paid: signedTotalPaid,
        currency: af.currency,
        source: af.source,
        notes: af.notes,
        transaction_type: af.transactionType,
      })
      .select("*")
      .single();

    if (data) {
      setPurchases((p) => [dbToPurchase(data), ...p]);
      setShowAdd(false);
      resetTxForm();
      showToast(`${af.transactionType === "sell" ? "Sell" : "Buy"} transaction added`);
    }
  }

  async function saveEditPurchase() {
    if (!editPurchase || !userId || !item) return;

    const unitPrice = parseFloat(af.unitPrice) || editPurchase.unitPrice;
    const units = parseFloat(af.units) || editPurchase.units;
    const totalPaid = parseFloat(af.totalPaid) || editPurchase.totalPaid;

    if (unitPrice <= 0 || units <= 0 || totalPaid <= 0) {
      showToast("Enter valid transaction values");
      return;
    }

    const availableUnits = getAvailableUnitsExcluding(editPurchase.id);

    if (af.transactionType === "sell" && units > availableUnits) {
      showToast(`You only have ${fmtNum(availableUnits, 4)} ${item.unitLabel}`);
      return;
    }

    const { data } = await supabase
      .from("portfolio_purchases")
      .update({
        purchased_at: new Date(af.purchasedAt).toISOString(),
        unit_price: unitPrice,
        units: (af.transactionType === "sell" ? -1 : 1) * units,
        total_paid: (af.transactionType === "sell" ? -1 : 1) * totalPaid,
        currency: af.currency,
        source: af.source,
        notes: af.notes,
        transaction_type: af.transactionType,
      })
      .eq("id", editPurchase.id)
      .select("*")
      .single();

    if (data) {
      setPurchases((p) =>
        p.map((x) => (x.id === editPurchase.id ? dbToPurchase(data) : x))
      );
      setEditPurchase(null);
      setShowAdd(false);
      resetTxForm();
      showToast("Transaction updated");
    }
  }

  async function addAlert() {
    if (!userId || !item) return;

    const target = parseFloat(alertForm.targetPrice);
    if (isNaN(target) || target <= 0) {
      showToast("Enter a valid target price");
      return;
    }

    const { data } = await supabase
      .from("portfolio_alerts")
      .insert({
        user_id: userId,
        item_id: item.id,
        alert_type: alertForm.alertType,
        target_price: target,
      })
      .select("*")
      .single();

    if (data) {
      setAlerts((prev) => [dbToAlert(data), ...prev]);
      setAlertForm({ alertType: "above", targetPrice: "" });
      setShowAddAlert(false);
      showToast("Alert added");
    }
  }

  async function deleteAlert(id: string) {
    await supabase.from("portfolio_alerts").delete().eq("id", id);
    setAlerts((prev) => prev.filter((a) => a.id !== id));
    showToast("Alert removed");
  }

  async function updatePrice() {
    if (!item) return;

    const price = parseFloat(newPrice);
    if (isNaN(price) || price <= 0) {
      showToast("Enter a valid price");
      return;
    }

    await supabase
      .from("portfolio_items")
      .update({ current_price: price, current_price_updated_at: nowDubai() })
      .eq("id", item.id);

    setItem((p) =>
      p ? { ...p, currentPrice: price, currentPriceUpdatedAt: nowDubai() } : p
    );
    setShowUpdatePrice(false);
    setNewPrice("");
    showToast("Price updated");
  }

  async function deleteItem() {
    if (!item || !userId) return;
    await supabase.from("portfolio_alerts").delete().eq("item_id", item.id);
    await supabase.from("portfolio_purchases").delete().eq("item_id", item.id);
    await supabase.from("portfolio_items").delete().eq("id", item.id);
    router.push("/dashboard/portfolio");
  }

  async function deletePurchase(id: string) {
    await supabase.from("portfolio_purchases").delete().eq("id", id);
    setPurchases((p) => p.filter((x) => x.id !== id));
    setShowDeleteConfirm(null);
    showToast("Transaction deleted");
  }

  function resetTxForm() {
    setAf({
      transactionType: "buy",
      purchasedAt: nowDubai().slice(0, 16),
      unitPrice: "",
      units: "",
      totalPaid: "",
      currency: "AED",
      source: "",
      notes: "",
    });
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  }

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

  const btnPrimary = {
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
    letterSpacing: "0.06em" as const,
  };

  const section = {
    background: V.card,
    border: `1px solid ${V.border}`,
    borderRadius: 14,
    overflow: "hidden" as const,
    marginBottom: 16,
  };

  const sHead = {
    padding: "11px 16px",
    borderBottom: `1px solid ${V.border}`,
    fontSize: 11,
    fontWeight: 800,
    textTransform: "uppercase" as const,
    letterSpacing: "0.1em",
    color: V.faint,
    background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
  };

  if (loading) {
    return (
      <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", background: V.bg }}>
        <div style={{ width: 28, height: 28, border: `2.5px solid ${V.accent}`, borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  if (!item) {
    return (
      <div style={{ padding: 40, background: V.bg, minHeight: "100vh", color: V.muted }}>
        Not found. <Link href="/dashboard/portfolio" style={{ color: V.accent }}>Back</Link>
      </div>
    );
  }

  const isUp = stats.pl !== null && stats.pl >= 0;
  const plColor = isUp ? "#16a34a" : "#ef4444";

  return (
    <div style={{ minHeight: "100vh", background: V.bg, color: V.text, fontFamily: "system-ui,sans-serif" }}>
      <div style={{ position: "sticky", top: 0, zIndex: 20, background: isDark ? "rgba(13,15,20,0.9)" : "rgba(249,248,245,0.9)", backdropFilter: "blur(12px)", borderBottom: `1px solid ${V.border}`, padding: "12px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <Link href="/dashboard/portfolio" style={{ display: "flex", alignItems: "center", gap: 8, color: V.muted, textDecoration: "none", fontWeight: 600, fontSize: 13 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          Portfolio
        </Link>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={{ ...btn, padding: "6px 12px", fontSize: 12, borderColor: "rgba(239,68,68,0.3)", color: "#ef4444" }} onClick={() => setShowDeleteConfirm("__item__")}>
            Delete asset
          </button>
          <button style={{ ...btn, padding: "6px 12px", fontSize: 12 }} onClick={() => { setNewPrice(item.currentPrice?.toString() ?? ""); setShowUpdatePrice(true); }}>
            Update price
          </button>
          <button style={{ ...btn, padding: "6px 12px", fontSize: 12 }} onClick={() => setShowAddAlert(true)}>
            + Alert
          </button>
          <button
            style={btnPrimary}
            onClick={() => {
              setEditPurchase(null);
              resetTxForm();
              setShowAdd(true);
            }}
          >
            + Add transaction
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 980, margin: "0 auto", padding: "24px 20px" }}>
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 6 }}>
            <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.5px", margin: 0 }}>{item.name}</h1>
            <span style={{ fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 999, background: "rgba(245,166,35,0.12)", color: V.accent }}>
              {item.symbol}
            </span>
          </div>
          {item.notes && <div style={{ fontSize: 13, color: V.muted }}>{item.notes}</div>}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(170px,1fr))", gap: 10, marginBottom: 20 }}>
          {[
            { label: `Total ${item.unitLabel}s`, value: fmtNum(stats.totalUnits, 4), color: V.accent },
            { label: "Invested", value: `AED ${fmtNum(stats.costBasisAed)}`, color: V.text },
            { label: "Bought", value: `AED ${fmtNum(stats.totalBuysAed)}`, color: V.text },
            { label: "Sold", value: `AED ${fmtNum(stats.totalSellsAed)}`, color: V.text },
            { label: "Current value", value: stats.currentValueAed !== null ? `AED ${fmtNum(stats.currentValueAed)}` : "No price", color: V.text },
            { label: "Unrealized P&L", value: stats.pl !== null ? fmtSignedAed(stats.pl) : "—", color: stats.pl !== null ? plColor : V.text },
            { label: "Unrealized P&L %", value: stats.plPct !== null ? `${stats.plPct >= 0 ? "+" : ""}${stats.plPct.toFixed(2)}%` : "—", color: stats.plPct !== null ? plColor : V.text },
            { label: "Realized P&L", value: fmtSignedAed(stats.realizedPlAed), color: stats.realizedPlAed >= 0 ? "#16a34a" : "#ef4444" },
            { label: `Avg cost/${item.unitLabel}`, value: `AED ${fmtNum(stats.avgUnitPrice)}`, color: V.muted },
          ].map((s) => (
            <div key={s.label} style={{ background: V.card, border: `1px solid ${V.border}`, borderRadius: 12, padding: "11px 14px" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: V.faint, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>

        <div style={{ ...section }}>
          <div style={sHead}>Price & alerts</div>
          <div style={{ padding: "14px 16px", display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 16 }}>
            <div>
              {item.currentPrice ? (
                <>
                  <div style={{ fontSize: 20, fontWeight: 800, color: V.accent }}>
                    AED {fmtNum(item.currentPrice)} / {item.unitLabel}
                  </div>
                  {item.currentPriceUpdatedAt && (
                    <div style={{ fontSize: 11, color: V.faint, marginTop: 4 }}>
                      Updated {fmtDate(item.currentPriceUpdatedAt)}
                    </div>
                  )}
                </>
              ) : (
                <span style={{ fontSize: 13, color: V.faint }}>
                  No current price set, click Update price to set it
                </span>
              )}
            </div>

            <div>
              <div style={{ fontSize: 11, fontWeight: 800, color: V.faint, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
                Active alerts
              </div>
              {alerts.length === 0 ? (
                <div style={{ fontSize: 12, color: V.faint }}>No alerts yet</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {alerts.map((a) => (
                    <div key={a.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, border: `1px solid ${V.border}`, borderRadius: 10, padding: "8px 10px" }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>
                          {a.alertType === "above" ? "Above" : "Below"} AED {fmtNum(a.targetPrice)}
                        </div>
                        <div style={{ fontSize: 11, color: a.triggeredAt ? "#ef4444" : V.faint }}>
                          {a.triggeredAt ? `Triggered ${fmtDateTime(a.triggeredAt)}` : a.isActive ? "Active" : "Inactive"}
                        </div>
                      </div>
                      <button onClick={() => deleteAlert(a.id)} style={{ ...btn, padding: "4px 8px", fontSize: 11, color: "#ef4444", borderColor: "rgba(239,68,68,0.3)" }}>
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={section}>
          <div style={{ ...sHead, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>Transaction history ({purchases.length})</span>
          </div>

          {purchases.length === 0 && (
            <div style={{ padding: "24px 16px", textAlign: "center", color: V.faint, fontSize: 13 }}>
              No transactions yet
            </div>
          )}

          {transactionRows.map((row, idx) => {
            const p = row.purchase;
            const plAed = row.plAed ?? null;
            const isUpP = plAed !== null && plAed >= 0;

            return (
              <div key={p.id} style={{ padding: "13px 16px", borderBottom: idx < transactionRows.length - 1 ? `1px solid ${V.border}` : "none" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 4, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: p.transactionType === "buy" ? "#16a34a" : "#ef4444", border: `1px solid ${p.transactionType === "buy" ? "rgba(22,163,74,0.25)" : "rgba(239,68,68,0.25)"}`, padding: "2px 8px", borderRadius: 999 }}>
                        {p.transactionType}
                      </span>
                      <span style={{ fontSize: 14, fontWeight: 700 }}>
                        #{purchases.length - idx} — {fmtNum(p.units, 4)} {item.unitLabel}
                      </span>
                      {p.source && <span style={{ fontSize: 11, color: V.faint }}>via {p.source}</span>}
                    </div>

                    <div style={{ fontSize: 12, color: V.muted }}>{fmtDateTime(p.purchasedAt)}</div>

                    <div style={{ fontSize: 12, color: V.muted, marginTop: 3 }}>
                      Unit price: <strong style={{ color: V.text }}>{p.currency} {fmtNum(p.unitPrice)}</strong>
                      {p.notes && <span style={{ fontStyle: "italic", marginLeft: 10 }}>{p.notes}</span>}
                    </div>
                  </div>

                  <div style={{ textAlign: "right", display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
                    <div style={{ fontSize: 14, fontWeight: 800 }}>
                      {p.transactionType === "sell" ? "Received" : "Paid"}: {p.currency} {fmtNum(p.totalPaid)}
                    </div>

                    {p.currency !== "AED" && row.amountAed !== undefined && (
                      <div style={{ fontSize: 11, color: V.faint }}>
                        ≈ AED {fmtNum(row.amountAed)}
                      </div>
                    )}

                    {plAed !== null && (
                      <div style={{ fontSize: 12, fontWeight: 700, color: isUpP ? "#16a34a" : "#ef4444", marginTop: 2 }}>
                        {row.plLabel}: {fmtSignedAed(plAed)}
                      </div>
                    )}

                    <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                      <button
                        onClick={() => {
                          setEditPurchase(p);
                          setAf({
                            transactionType: p.transactionType,
                            purchasedAt: p.purchasedAt.slice(0, 16),
                            unitPrice: String(p.unitPrice),
                            units: String(p.units),
                            totalPaid: String(p.totalPaid),
                            currency: p.currency,
                            source: p.source,
                            notes: p.notes,
                          });
                          setShowAdd(true);
                        }}
                        style={{ padding: "3px 9px", borderRadius: 6, border: `1px solid ${V.border}`, background: V.card, color: V.muted, cursor: "pointer", fontSize: 11 }}
                      >
                        Edit
                      </button>

                      <button
                        onClick={() => setShowDeleteConfirm(p.id)}
                        style={{ padding: "3px 9px", borderRadius: 6, border: "1px solid rgba(239,68,68,0.3)", background: "transparent", color: "#ef4444", cursor: "pointer", fontSize: 11 }}
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
      </div>

      {showAdd && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 50, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px 24px", overflowY: "auto" }} onClick={() => setShowAdd(false)}>
          <div style={{ background: V.card, border: `1px solid ${V.border}`, borderRadius: 18, width: "min(560px,100%)", maxHeight: "92vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: "18px 20px", borderBottom: `1px solid ${V.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: V.faint, textTransform: "uppercase", letterSpacing: "0.1em" }}>{item.symbol}</div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>{editPurchase ? "Edit transaction" : "Add transaction"}</div>
              </div>
              <button style={btn} onClick={() => setShowAdd(false)}>✕</button>
            </div>

            <div style={{ padding: 20, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <label style={{ ...lbl, gridColumn: "1/-1" }}>
                Type
                <select style={inp} value={af.transactionType} onChange={(e) => setAf((p) => ({ ...p, transactionType: e.target.value as TxType }))}>
                  <option value="buy">Buy</option>
                  <option value="sell">Sell</option>
                </select>
              </label>

              <label style={{ ...lbl, gridColumn: "1/-1" }}>
                Date & time
                <input type="datetime-local" style={inp} value={af.purchasedAt} onChange={(e) => setAf((p) => ({ ...p, purchasedAt: e.target.value }))} />
              </label>

              <label style={lbl}>
                Unit price ({item.mainCurrency} per {item.unitLabel})
                <input type="number" style={inp} value={af.unitPrice} onChange={(e) => setAf((p) => ({ ...p, unitPrice: e.target.value }))} />
              </label>

              <label style={lbl}>
                Units {af.transactionType === "sell" ? "sold" : "purchased"}
                <input
                  type="number"
                  style={inp}
                  value={af.units}
                  onChange={(e) => {
                    setAf((p) => ({
                      ...p,
                      units: e.target.value,
                      totalPaid: p.unitPrice
                        ? String(((parseFloat(p.unitPrice) || 0) * (parseFloat(e.target.value) || 0)).toFixed(2))
                        : p.totalPaid,
                    }));
                  }}
                />
              </label>

              <label style={lbl}>
                Total {af.transactionType === "sell" ? "received" : "paid"}
                <input type="number" style={inp} value={af.totalPaid} onChange={(e) => setAf((p) => ({ ...p, totalPaid: e.target.value }))} />
              </label>

              <label style={lbl}>
                Currency
                <select style={inp} value={af.currency} onChange={(e) => setAf((p) => ({ ...p, currency: e.target.value as Currency }))}>
                  <option>AED</option>
                  <option>USD</option>
                  <option>INR</option>
                  <option>GBP</option>
                  <option>EUR</option>
                </select>
              </label>

              <label style={{ ...lbl, gridColumn: "1/-1" }}>
                Broker / platform
                <input style={inp} value={af.source} onChange={(e) => setAf((p) => ({ ...p, source: e.target.value }))} />
              </label>

              <label style={{ ...lbl, gridColumn: "1/-1" }}>
                Notes (optional)
                <input style={inp} value={af.notes} onChange={(e) => setAf((p) => ({ ...p, notes: e.target.value }))} />
              </label>
            </div>

            <div style={{ padding: "0 20px 20px", display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button style={btn} onClick={() => { setShowAdd(false); setEditPurchase(null); resetTxForm(); }}>
                Cancel
              </button>
              <button style={btnPrimary} onClick={editPurchase ? saveEditPurchase : addPurchase}>
                {editPurchase ? "Update" : `Save ${af.transactionType}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddAlert && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 50, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px 24px", overflowY: "auto" }} onClick={() => setShowAddAlert(false)}>
          <div style={{ background: V.card, border: `1px solid ${V.border}`, borderRadius: 18, width: "min(420px,100%)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: "18px 20px", borderBottom: `1px solid ${V.border}`, fontSize: 18, fontWeight: 800 }}>
              Add alert
            </div>

            <div style={{ padding: 20, display: "grid", gap: 14 }}>
              <label style={lbl}>
                Alert type
                <select style={inp} value={alertForm.alertType} onChange={(e) => setAlertForm((p) => ({ ...p, alertType: e.target.value as AlertType }))}>
                  <option value="above">Above price</option>
                  <option value="below">Below price</option>
                </select>
              </label>

              <label style={lbl}>
                Target price ({item.mainCurrency})
                <input type="number" style={inp} value={alertForm.targetPrice} onChange={(e) => setAlertForm((p) => ({ ...p, targetPrice: e.target.value }))} />
              </label>
            </div>

            <div style={{ padding: "0 20px 20px", display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button style={btn} onClick={() => setShowAddAlert(false)}>Cancel</button>
              <button style={btnPrimary} onClick={addAlert}>Save alert</button>
            </div>
          </div>
        </div>
      )}

      {showUpdatePrice && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => setShowUpdatePrice(false)}>
          <div style={{ background: V.card, border: `1px solid ${V.border}`, borderRadius: 18, width: "min(380px,100%)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: "18px 20px", borderBottom: `1px solid ${V.border}`, fontSize: 18, fontWeight: 800 }}>
              Current price
            </div>

            <div style={{ padding: 20 }}>
              <label style={lbl}>
                {item.mainCurrency} per {item.unitLabel}
                <input type="number" style={inp} value={newPrice} onChange={(e) => setNewPrice(e.target.value)} autoFocus />
              </label>
            </div>

            <div style={{ padding: "0 20px 20px", display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button style={btn} onClick={() => setShowUpdatePrice(false)}>Cancel</button>
              <button style={btnPrimary} onClick={updatePrice}>Update</button>
            </div>
          </div>
        </div>
      )}

      {showDeleteConfirm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => setShowDeleteConfirm(null)}>
          <div style={{ background: V.card, border: `1px solid ${V.border}`, borderRadius: 16, padding: 22, width: "min(380px,100%)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 8 }}>
              {showDeleteConfirm === "__item__" ? `Delete ${item.name}?` : "Delete transaction?"}
            </div>
            <div style={{ fontSize: 13, color: V.muted, marginBottom: 16 }}>
              {showDeleteConfirm === "__item__"
                ? "This will delete the asset, alerts and all transactions."
                : "This cannot be undone."}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button style={btn} onClick={() => setShowDeleteConfirm(null)}>Cancel</button>
              <button
                style={{ ...btn, borderColor: "rgba(239,68,68,0.4)", color: "#ef4444" }}
                onClick={async () => {
                  if (showDeleteConfirm === "__item__") {
                    await deleteItem();
                  } else {
                    await deletePurchase(showDeleteConfirm);
                  }
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div style={{ position: "fixed", bottom: 20, right: 16, background: isDark ? "#1a3a2a" : "#f0fdf4", color: "#16a34a", border: "1px solid rgba(22,163,74,0.3)", padding: "12px 18px", borderRadius: 12, fontSize: 13, fontWeight: 700, boxShadow: "0 8px 24px rgba(0,0,0,0.2)", zIndex: 200 }}>
          {toast}
        </div>
      )}
    </div>
  );
}