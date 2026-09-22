"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { nowDubai, getUserTimezone, APP_TZ } from "@/lib/timezone";
import { createClient } from "@/lib/supabase/client";
import {
  type AlertType,
  type Currency,
  type PortfolioAlert,
  type PortfolioItem,
  type Purchase,
  type TxType,
  alertsToTrigger,
  computeItemPnl,
  dbToAlert,
  dbToItem,
  dbToPurchase,
  fmtN,
  fmtSignedAed,
} from "@/lib/portfolio";
import { useIsMobile } from "@/hooks/useIsMobile";
import { getTheme, styleKit } from "../_components/theme";
import { Toast } from "../_components/Toast";
import { LoadingSpinner } from "../_components/LoadingSpinner";
import { StatGrid } from "../_components/StatGrid";
import { PriceAndAlertsCard } from "../_components/PriceAndAlertsCard";
import { TransactionHistoryList } from "../_components/TransactionHistoryList";
import { AddEditTransactionModal, type TransactionFormState } from "../_components/AddEditTransactionModal";
import { AddAlertModal } from "../_components/AddAlertModal";
import { SimpleUpdatePriceModal } from "../_components/SimpleUpdatePriceModal";
import { DeleteConfirmModal } from "../_components/Modal";

function resetTxForm(tz: string): TransactionFormState {
  return {
    transactionType: "buy",
    purchasedAt: nowDubai(tz).slice(0, 16),
    unitPrice: "",
    units: "",
    totalPaid: "",
    currency: "AED",
    source: "",
    notes: "",
  };
}

export default function PortfolioItemPage() {
  const params = useParams();
  const supabase = useMemo(() => createClient(), []);
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
  const [toast, setToast] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [timezone, setTimezone] = useState(APP_TZ);
  const [livePriceSymbolInput, setLivePriceSymbolInput] = useState("");
  const [savingLiveLink, setSavingLiveLink] = useState(false);
  const [fetchingLinkedPrice, setFetchingLinkedPrice] = useState(false);

  const [af, setAf] = useState<TransactionFormState>(() => resetTxForm(APP_TZ));

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

  useEffect(() => {
    async function load() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          router.push("/login");
          return;
        }

        setUserId(user.id);
        const tz = await getUserTimezone(supabase, user.id);
        setTimezone(tz);
        setAf(resetTxForm(tz));

        const itemId = Array.isArray(params.id) ? params.id[0] : params.id;
        if (!itemId) {
          setLoading(false);
          return;
        }

        const [itemRes, purRes, alertRes] = await Promise.all([
          supabase.from("portfolio_items").select("*").eq("id", itemId).single(),
          supabase.from("portfolio_purchases").select("*").eq("item_id", itemId).order("purchased_at", { ascending: false }),
          supabase.from("portfolio_alerts").select("*").eq("item_id", itemId).order("created_at", { ascending: false }),
        ]);

        if (itemRes.data) {
          const mapped = dbToItem(itemRes.data);
          setItem(mapped);
          setLivePriceSymbolInput(mapped.livePriceSymbol ?? "");
        }
        if (purRes.data) setPurchases(purRes.data.map(dbToPurchase));
        if (alertRes.data) setAlerts(alertRes.data.map(dbToAlert));

        setLoading(false);
      } catch {
        setLoading(false);
      }
    }

    load();
  }, [params, router, supabase]);

  useEffect(() => {
    async function syncAlerts() {
      if (!item?.currentPrice || alerts.length === 0) return;

      const ids = alertsToTrigger(
        alerts.map((a) => ({
          id: a.id,
          alert_type: a.alertType,
          target_price: a.targetPrice,
          is_active: a.isActive,
          triggered_at: a.triggeredAt,
        })),
        item.currentPrice,
      );

      if (ids.length === 0) return;

      const nowIso = new Date().toISOString();
      await supabase.from("portfolio_alerts").update({ triggered_at: nowIso, is_active: false }).in("id", ids);

      setAlerts((prev) => prev.map((a) => (ids.includes(a.id) ? { ...a, triggeredAt: nowIso, isActive: false } : a)));
      showToast(`${ids.length} alert${ids.length > 1 ? "s" : ""} triggered`);
    }

    syncAlerts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.currentPrice, alerts, supabase]);

  const pnl = useMemo(() => computeItemPnl(purchases, item), [purchases, item]);

  function getAvailableUnitsExcluding(editId?: string) {
    const net = purchases.reduce((sum, p) => {
      if (editId && p.id === editId) return sum;
      return sum + (p.transactionType === "buy" ? p.units : -p.units);
    }, 0);
    return Math.max(0, net);
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  }

  async function addPurchase() {
    if (!userId || !item) return;

    const unitPrice = parseFloat(af.unitPrice);
    const units = parseFloat(af.units);
    const totalPaidInput = parseFloat(af.totalPaid);
    const totalPaid = !isNaN(totalPaidInput) ? totalPaidInput : unitPrice * units;

    if (isNaN(unitPrice) || isNaN(units) || unitPrice <= 0 || units <= 0) {
      showToast("Enter valid price and units");
      return;
    }

    if (af.transactionType === "sell" && units > pnl.totalUnits) {
      showToast(`You only have ${fmtN(pnl.totalUnits, 4)} ${item.unitLabel}`);
      return;
    }

    const signedUnits = af.transactionType === "sell" ? -units : units;
    const signedTotalPaid = af.transactionType === "sell" ? -totalPaid : totalPaid;

    const { data, error } = await supabase
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

    if (error) {
      showToast("Failed to add transaction");
      return;
    }

    if (data) {
      setPurchases((p) => [dbToPurchase(data), ...p]);
      setShowAdd(false);
      setAf(resetTxForm(timezone));
      showToast(`${af.transactionType === "sell" ? "Sell" : "Buy"} transaction added`);
    }
  }

  async function saveEditPurchase() {
    if (!editPurchase || !userId || !item) return;

    const unitPriceInput = parseFloat(af.unitPrice);
    const unitsInput = parseFloat(af.units);
    const totalPaidInput = parseFloat(af.totalPaid);
    const unitPrice = !isNaN(unitPriceInput) ? unitPriceInput : editPurchase.unitPrice;
    const units = !isNaN(unitsInput) ? unitsInput : editPurchase.units;
    const totalPaid = !isNaN(totalPaidInput) ? totalPaidInput : editPurchase.totalPaid;

    if (unitPrice <= 0 || units <= 0 || totalPaid <= 0) {
      showToast("Enter valid transaction values");
      return;
    }

    const availableUnits = getAvailableUnitsExcluding(editPurchase.id);
    if (af.transactionType === "sell" && units > availableUnits) {
      showToast(`You only have ${fmtN(availableUnits, 4)} ${item.unitLabel}`);
      return;
    }

    const { data, error } = await supabase
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

    if (error) {
      showToast("Failed to update transaction");
      return;
    }

    if (data) {
      setPurchases((p) => p.map((x) => (x.id === editPurchase.id ? dbToPurchase(data) : x)));
      setEditPurchase(null);
      setShowAdd(false);
      setAf(resetTxForm(timezone));
      showToast("Transaction updated");
    }
  }

  async function addAlert(alertType: AlertType, targetPriceInput: string) {
    if (!userId || !item) return;

    const target = parseFloat(targetPriceInput);
    if (isNaN(target) || target <= 0) {
      showToast("Enter a valid target price");
      return;
    }

    const { data, error } = await supabase
      .from("portfolio_alerts")
      .insert({ user_id: userId, item_id: item.id, alert_type: alertType, target_price: target })
      .select("*")
      .single();

    if (error) {
      showToast("Failed to add alert");
      return;
    }

    if (data) {
      setAlerts((prev) => [dbToAlert(data), ...prev]);
      setShowAddAlert(false);
      showToast("Alert added");
    }
  }

  async function deleteAlert(id: string) {
    if (!userId) return;
    const { error } = await supabase.from("portfolio_alerts").delete().eq("id", id).eq("user_id", userId);
    if (error) {
      showToast("Failed to remove alert");
      return;
    }
    setAlerts((prev) => prev.filter((a) => a.id !== id));
    showToast("Alert removed");
  }

  async function updatePrice(priceInput: string) {
    if (!item) return;
    const price = parseFloat(priceInput);
    if (isNaN(price) || price <= 0) {
      showToast("Enter a valid price");
      return;
    }

    const { error } = await supabase.from("portfolio_items").update({ current_price: price, current_price_updated_at: nowDubai(timezone) }).eq("id", item.id);
    if (error) {
      showToast("Failed to update price");
      return;
    }

    setItem((p) => (p ? { ...p, currentPrice: price, currentPriceUpdatedAt: nowDubai(timezone) } : p));
    setShowUpdatePrice(false);
    showToast("Price updated");
  }

  async function saveLivePriceLink() {
    if (!item) {
      showToast("Asset not loaded yet");
      return;
    }
    try {
      setSavingLiveLink(true);
      const nextLink = livePriceSymbolInput || null;
      const { error } = await supabase.from("portfolio_items").update({ live_price_symbol: nextLink }).eq("id", item.id);
      if (error) {
        showToast(error.message || "Could not save live price link");
        return;
      }
      setItem((p) => (p ? { ...p, livePriceSymbol: nextLink } : p));
      setLivePriceSymbolInput(nextLink ?? "");
      showToast(nextLink ? "Live price link saved" : "Live price link cleared");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not save live price link");
    } finally {
      setSavingLiveLink(false);
    }
  }

  async function fetchLinkedLivePrice() {
    if (!item || !userId) {
      showToast("Asset not loaded yet");
      return;
    }

    const link = (livePriceSymbolInput || item.livePriceSymbol || "").trim();
    if (!link) {
      showToast("Choose a live price link first");
      return;
    }

    try {
      setFetchingLinkedPrice(true);

      const { data: profileRow, error: profileError } = await supabase.from("profiles").select("metal_prices").eq("id", userId).single();
      if (profileError) {
        showToast(profileError.message || "Could not read cached live prices");
        return;
      }

      const priceMap = (profileRow?.metal_prices ?? {}) as Record<string, { bid?: number; ask?: number; updated?: string }>;
      const livePoint = priceMap[link];
      const sellValue = Number(livePoint?.bid ?? 0);
      const updatedAt = String(livePoint?.updated || nowDubai(timezone));

      if (!sellValue || sellValue <= 0) {
        showToast("No cached sell value found for this link. Refresh live prices on the main portfolio page first.");
        return;
      }

      const { error } = await supabase.from("portfolio_items").update({ current_price: sellValue, current_price_updated_at: updatedAt, live_price_symbol: link }).eq("id", item.id).eq("user_id", userId);
      if (error) {
        showToast(error.message || "Could not save linked price");
        return;
      }

      setItem((p) => (p ? { ...p, currentPrice: sellValue, currentPriceUpdatedAt: updatedAt, livePriceSymbol: link } : p));
      setLivePriceSymbolInput(link);
      showToast(`Linked sell price applied: AED ${fmtN(sellValue)}`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not fetch linked live price");
    } finally {
      setFetchingLinkedPrice(false);
    }
  }

  async function deleteItem() {
    if (!item || !userId) return;
    const { error: alertErr } = await supabase.from("portfolio_alerts").delete().eq("item_id", item.id).eq("user_id", userId);
    if (alertErr) {
      showToast("Failed to delete asset");
      return;
    }
    const { error: purErr } = await supabase.from("portfolio_purchases").delete().eq("item_id", item.id).eq("user_id", userId);
    if (purErr) {
      showToast("Failed to delete asset");
      return;
    }
    const { error: itemErr } = await supabase.from("portfolio_items").delete().eq("id", item.id).eq("user_id", userId);
    if (itemErr) {
      showToast("Failed to delete asset");
      return;
    }
    router.push("/dashboard/portfolio");
  }

  async function deletePurchase(id: string) {
    if (!userId) return;
    const { error } = await supabase.from("portfolio_purchases").delete().eq("id", id).eq("user_id", userId);
    if (error) {
      showToast("Failed to delete transaction");
      return;
    }
    setPurchases((p) => p.filter((x) => x.id !== id));
    setShowDeleteConfirm(null);
    showToast("Transaction deleted");
  }

  function exportTransactionsCsv() {
    if (!item) return;
    const escape = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
    const header = ["Date", "Type", "Units", "Unit price", "Currency", "Total paid", "Source", "Notes"];
    const rows = purchases.map((p) => [new Date(p.purchasedAt).toISOString(), p.transactionType, p.units.toFixed(4), p.unitPrice.toFixed(2), p.currency, p.totalPaid.toFixed(2), p.source ?? "", p.notes ?? ""]);
    const csv = [header, ...rows].map((row) => row.map((c) => escape(String(c))).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${item.symbol}-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const V = getTheme(isDark);
  const { btn, inp, lbl, section, sHead } = styleKit(V, isMobile, isDark);
  const btnPrimary = { ...btn, background: V.accent, border: "none", color: "#fff", fontWeight: 700, boxShadow: V.shadowAccent };

  if (loading) return <LoadingSpinner bg={V.bg} accent={V.accent} />;
  if (!item)
    return (
      <div style={{ padding: 40, background: V.bg, minHeight: "100vh", color: V.muted }}>
        Not found.{" "}
        <Link href="/dashboard/portfolio" style={{ color: V.accent }}>
          Back
        </Link>
      </div>
    );

  const isUp = pnl.pl !== null && pnl.pl >= 0;
  const plColor = isUp ? V.pos : V.neg;

  return (
    <div style={{ minHeight: "100vh", background: V.bg, color: V.text, fontFamily: "system-ui,sans-serif" }}>
      <div style={{ position: "sticky", top: 0, zIndex: 20, background: isDark ? "rgba(13,15,20,0.9)" : "rgba(249,248,245,0.9)", backdropFilter: "blur(12px)", borderBottom: `1px solid ${V.border}`, padding: "12px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <Link href="/dashboard/portfolio" style={{ display: "flex", alignItems: "center", gap: 8, color: V.muted, textDecoration: "none", fontWeight: 600, fontSize: 13 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Portfolio
        </Link>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={{ ...btn, padding: "6px 12px", fontSize: 12, borderColor: "rgba(239,68,68,0.3)", color: V.neg }} onClick={() => setShowDeleteConfirm("__item__")}>
            Delete asset
          </button>
          <button style={{ ...btn, padding: "6px 12px", fontSize: 12 }} onClick={() => setShowUpdatePrice(true)}>
            Update price
          </button>
          <button style={{ ...btn, padding: "6px 12px", fontSize: 12 }} onClick={() => setShowAddAlert(true)}>
            + Alert
          </button>
          {purchases.length > 0 && (
            <button style={{ ...btn, padding: "6px 12px", fontSize: 12 }} onClick={exportTransactionsCsv}>
              ⬇ Export CSV
            </button>
          )}
          <button
            style={btnPrimary}
            onClick={() => {
              setEditPurchase(null);
              setAf(resetTxForm(timezone));
              setShowAdd(true);
            }}
          >
            + Add transaction
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 980, margin: "0 auto", padding: "24px 20px" }}>
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
            <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.5px", margin: 0 }}>{item.name}</h1>
            <span style={{ fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 999, background: "rgba(245,166,35,0.12)", color: V.accent }}>{item.symbol}</span>
            {item.assetType === "gold" && (item.goldPurityKarat || item.weightGrams) && (
              <span style={{ fontSize: 12, fontWeight: 800, padding: "3px 10px", borderRadius: 999, background: V.goldSoft, color: V.gold, border: "1px solid rgba(255,215,0,0.4)" }}>
                🥇 {item.goldPurityKarat ? `${item.goldPurityKarat}K` : ""}
                {item.goldPurityKarat && item.weightGrams ? " · " : ""}
                {item.weightGrams ? `${item.weightGrams}g` : ""}
              </span>
            )}
          </div>
          {item.notes && <div style={{ fontSize: 13, color: V.muted }}>{item.notes}</div>}
        </div>

        <div style={{ marginBottom: 20 }}>
          <StatGrid
            V={V}
            minWidth={170}
            cards={[
              { label: `Total ${item.unitLabel}s`, value: fmtN(pnl.totalUnits, 4), color: V.accent },
              { label: "Total Bought", value: `AED ${fmtN(pnl.totalBuysAed)}` },
              { label: "Total Sold", value: `AED ${fmtN(pnl.totalSellsAed)}` },
              { label: "Current Investment", value: `AED ${fmtN(pnl.costBasisAed)}` },
              { label: "Current value", value: pnl.currentValueAed !== null ? `AED ${fmtN(pnl.currentValueAed)}` : "No price" },
              { label: "Unrealized P&L", value: pnl.pl !== null ? fmtSignedAed(pnl.pl) : "—", color: pnl.pl !== null ? plColor : undefined },
              { label: "Unrealized P&L %", value: pnl.plPct !== null ? `${pnl.plPct >= 0 ? "+" : ""}${pnl.plPct.toFixed(2)}%` : "—", color: pnl.plPct !== null ? plColor : undefined },
              { label: "Realized P&L", value: fmtSignedAed(pnl.realizedPlAed), color: pnl.realizedPlAed >= 0 ? V.pos : V.neg },
              { label: `Avg cost/${item.unitLabel}`, value: `AED ${fmtN(pnl.avgUnitPrice)}`, color: V.muted },
            ]}
          />
        </div>

        <PriceAndAlertsCard
          V={V}
          btn={btn}
          btnPrimary={btnPrimary}
          inp={inp}
          section={section}
          sHead={sHead}
          isMobile={isMobile}
          item={item}
          alerts={alerts}
          livePriceSymbolInput={livePriceSymbolInput}
          savingLiveLink={savingLiveLink}
          fetchingLinkedPrice={fetchingLinkedPrice}
          onLivePriceSymbolChange={setLivePriceSymbolInput}
          onSaveLiveLink={() => void saveLivePriceLink()}
          onFetchLinkedPrice={() => void fetchLinkedLivePrice()}
          onDeleteAlert={(id) => void deleteAlert(id)}
        />

        <TransactionHistoryList
          V={V}
          isMobile={isMobile}
          section={section}
          sHead={sHead}
          unitLabel={item.unitLabel}
          purchases={purchases}
          infoByPurchaseId={pnl.infoByPurchaseId}
          onEdit={(p) => {
            setEditPurchase(p);
            setAf({
              transactionType: p.transactionType,
              purchasedAt: p.purchasedAt.slice(0, 16),
              unitPrice: String(p.unitPrice),
              units: String(p.units),
              totalPaid: String(p.totalPaid),
              currency: p.currency,
              source: p.source,
              notes: p.notes ?? "",
            });
            setShowAdd(true);
          }}
          onDelete={(id) => setShowDeleteConfirm(id)}
        />
      </div>

      {showAdd && (
        <AddEditTransactionModal
          V={V}
          btn={btn}
          btnPrimary={btnPrimary}
          inp={inp}
          lbl={lbl}
          isMobile={isMobile}
          item={item}
          isEditing={!!editPurchase}
          form={af}
          onChange={setAf}
          onClose={() => {
            setShowAdd(false);
            setEditPurchase(null);
            setAf(resetTxForm(timezone));
          }}
          onSubmit={() => void (editPurchase ? saveEditPurchase() : addPurchase())}
        />
      )}

      {showAddAlert && <AddAlertModal V={V} btn={btn} btnPrimary={btnPrimary} inp={inp} lbl={lbl} currency={item.mainCurrency} onClose={() => setShowAddAlert(false)} onSubmit={(alertType, targetPrice) => void addAlert(alertType, targetPrice)} />}

      {showUpdatePrice && <SimpleUpdatePriceModal V={V} btn={btn} btnPrimary={btnPrimary} inp={inp} lbl={lbl} item={item} onClose={() => setShowUpdatePrice(false)} onSubmit={(price) => void updatePrice(price)} />}

      {showDeleteConfirm && (
        <DeleteConfirmModal
          V={V}
          btn={btn}
          title={showDeleteConfirm === "__item__" ? `Delete ${item.name}?` : "Delete transaction?"}
          message={showDeleteConfirm === "__item__" ? "This will delete the asset, alerts and all transactions." : "This cannot be undone."}
          onCancel={() => setShowDeleteConfirm(null)}
          onConfirm={() => void (showDeleteConfirm === "__item__" ? deleteItem() : deletePurchase(showDeleteConfirm))}
        />
      )}

      <Toast message={toast} isDark={isDark} pos={V.pos} />
    </div>
  );
}
