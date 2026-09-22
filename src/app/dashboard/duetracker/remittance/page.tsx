"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useIsMobile } from "@/hooks/useIsMobile";
import { type Status, fmtMonth, remittanceStatusFromRow, statusTone } from "@/lib/duetracker";
import { getTheme, styleKit } from "../_components/theme";
import { Toast } from "../_components/Toast";
import { LoadingSpinner } from "../_components/LoadingSpinner";
import { PageHeader } from "../_components/PageHeader";
import { StatGrid } from "../_components/StatGrid";

type MonthRecord = {
  month: string;
  remittanceInr: number;
  fxRate: number;
  remittanceAed: number;
  status: Status;
  note: string;
  indiaTotalInr: number;
  isLocked: boolean;
};

export default function RemittancePage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [records, setRecords] = useState<MonthRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [editMonth, setEditMonth] = useState<string | null>(null);
  const [editInr, setEditInr] = useState("");
  const [editRate, setEditRate] = useState("");
  const [editNote, setEditNote] = useState("");
  const [editStatus, setEditStatus] = useState<Status>("pending");
  const [toast, setToast] = useState("");
  const toastTimerRef = useRef<number | undefined>(undefined);
  const [isDark, setIsDark] = useState(false);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (typeof document === "undefined") return;
    const read = () => setIsDark(document.documentElement.classList.contains("dark"));
    read();
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

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

      const [settingsRes, dueItemsRes, entriesRes] = await Promise.all([
        supabase.from("due_month_settings").select("month, remittance_inr, remittance_rate, remittance_paid, note, fx_rates, cash_in, is_locked").eq("user_id", user.id).order("month", { ascending: false }),
        supabase.from("due_items").select("id,group_name,default_amount,default_currency").eq("user_id", user.id).eq("group_name", "India"),
        supabase.from("due_entries").select("month,due_item_id,amount,currency,status").eq("user_id", user.id),
      ]);

      if (settingsRes.error || dueItemsRes.error || entriesRes.error) {
        setToast(settingsRes.error?.message || dueItemsRes.error?.message || entriesRes.error?.message || "Could not load remittance history");
        setLoading(false);
        return;
      }

      const indiaItems = dueItemsRes.data ?? [];
      const indiaIds = new Set(indiaItems.map((item) => item.id));
      const entries = entriesRes.data ?? [];

      const recs: MonthRecord[] = (settingsRes.data ?? [])
        .filter((s) => (s.remittance_inr ?? 0) > 0)
        .map((s) => {
          const inr = s.remittance_inr ?? 0;
          const rate = s.remittance_rate ?? ((s.fx_rates as Record<string, number> | null)?.INR ?? 25.2);
          const monthEntries = entries.filter((e) => e.month === s.month && indiaIds.has(e.due_item_id));
          const indiaTotal = indiaItems.reduce((sum, item) => {
            const entry = monthEntries.find((e) => e.due_item_id === item.id);
            const amount = entry?.amount ?? item.default_amount ?? 0;
            const currency = (entry?.currency ?? item.default_currency ?? "INR") as "AED" | "INR" | "USD";
            if (entry?.status === "waived") return sum;
            if (currency === "INR") return sum + amount;
            const fxRates = (s.fx_rates as Record<string, number> | null) ?? { INR: 25.2, USD: 3.67 };
            if (currency === "AED") return sum + amount * (fxRates.INR ?? 25.2);
            return sum + amount * ((fxRates.INR ?? 25.2) / (fxRates.USD ?? 3.67));
          }, 0);

          return {
            month: s.month,
            remittanceInr: inr,
            fxRate: rate,
            remittanceAed: rate > 0 ? inr / rate : 0,
            status: remittanceStatusFromRow(s),
            note: s.note ?? "",
            indiaTotalInr: indiaTotal,
            isLocked: s.is_locked ?? false,
          };
        });

      setRecords(recs);
      setLoading(false);
    }
    void load();
  }, [router, supabase]);

  function showToast(msg: string) {
    setToast(msg);
    window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(""), 2500);
  }

  async function saveEdit(record: MonthRecord) {
    if (!userId) return;
    if (record.isLocked) {
      showToast("That month is locked");
      return;
    }
    const inr = editInr.trim() === "" ? record.remittanceInr : Number(editInr);
    const rate = editRate.trim() === "" ? record.fxRate : Number(editRate);
    if (!Number.isFinite(inr) || inr < 0) {
      showToast("INR amount must be 0 or more");
      return;
    }
    if (!Number.isFinite(rate) || rate <= 0) {
      showToast("Rate must be more than 0");
      return;
    }

    const { error } = await supabase.from("due_month_settings").upsert(
      {
        user_id: userId,
        month: record.month,
        remittance_inr: inr,
        remittance_rate: rate,
        note: editNote,
        remittance_paid: editStatus === "paid",
        cash_in: { __remittance_status: editStatus },
        is_locked: record.isLocked,
      },
      { onConflict: "user_id,month" },
    );

    if (error) {
      showToast(error.message);
      return;
    }

    setRecords((p) => p.map((r) => (r.month === record.month ? { ...r, remittanceInr: inr, fxRate: rate, remittanceAed: inr / rate, note: editNote, status: editStatus } : r)));
    setEditMonth(null);
    showToast("Saved");
  }

  async function updateStatus(record: MonthRecord, status: Status) {
    if (!userId) return;
    if (record.isLocked) {
      showToast("That month is locked");
      return;
    }

    const previousRecords = records;
    setRecords((p) => p.map((r) => (r.month === record.month ? { ...r, status } : r)));

    try {
      const updateData = {
        user_id: userId,
        month: record.month,
        remittance_paid: status === "paid",
        remittance_inr: record.remittanceInr,
        remittance_rate: record.fxRate,
        note: record.note,
        cash_in: { __remittance_status: status },
        is_locked: record.isLocked,
      };

      const { error } = await supabase.from("due_month_settings").upsert(updateData, { onConflict: "user_id,month" });

      if (error) {
        showToast(`Failed: ${error.message}`);
        setRecords(previousRecords);
        return;
      }

      showToast(`Status updated to ${status}`);
    } catch {
      showToast("Failed to save status update");
      setRecords(previousRecords);
    }
  }

  const totalSent = useMemo(() => records.reduce((sum, record) => sum + record.remittanceAed, 0), [records]);
  // Only count fully "paid" records — remittance records have no partial-amount field
  // (status is just an enum), so a "partial" record has no tracked paid amount and
  // counting it in full here would overstate how much has actually been sent.
  const totalPaid = useMemo(() => records.filter((r) => r.status === "paid").reduce((sum, record) => sum + record.remittanceAed, 0), [records]);
  const partialCount = useMemo(() => records.filter((r) => r.status === "partial").length, [records]);
  const totalVariance = useMemo(() => records.reduce((sum, record) => sum + (record.remittanceInr - record.indiaTotalInr), 0), [records]);

  const V = getTheme(isDark);
  const { shadow, btn, btnP, inp } = styleKit(V, isDark, isMobile);

  if (loading) return <LoadingSpinner bg={V.bg} accent={V.accent} />;

  return (
    <div style={{ minHeight: "100vh", background: V.bg, color: V.text, fontFamily: "system-ui,sans-serif" }}>
      <PageHeader V={V} isDark={isDark} title="Remittance History" />

      <div style={{ maxWidth: 980, margin: "0 auto", padding: "24px 20px" }}>
        <div style={{ marginBottom: 20 }}>
          <StatGrid
            V={V}
            shadow={shadow}
            cards={[
              { label: "Total remitted", value: `AED ${totalSent.toFixed(0)}` },
              { label: "Total paid", value: `AED ${totalPaid.toFixed(0)}`, color: V.pos, note: partialCount > 0 ? `+ ${partialCount} partially paid (amount not tracked)` : undefined },
              { label: "Months tracked", value: records.length, color: V.muted },
              { label: "Variance", value: `${totalVariance > 0 ? "+" : ""}${totalVariance.toFixed(0)} INR`, color: totalVariance === 0 ? V.faint : totalVariance > 0 ? V.neg : V.pos },
            ]}
          />
        </div>

        {records.length === 0 && (
          <div style={{ padding: "48px", textAlign: "center", color: V.faint, fontSize: 13, background: V.card, border: `1px solid ${V.border}`, borderRadius: 14 }}>
            No remittance entries yet. Beautifully empty, but not very useful.
          </div>
        )}

        <div style={{ background: V.card, border: `1px solid ${V.border}`, borderRadius: 14, overflow: "hidden", boxShadow: shadow }}>
          {!isMobile && records.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 0.9fr 0.7fr 0.9fr 1fr 120px 80px", gap: 8, padding: "9px 16px", fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: V.faint, borderBottom: `1px solid ${V.border}`, background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)" }}>
              <div>Month</div>
              <div>INR</div>
              <div>Rate</div>
              <div>AED</div>
              <div>Variance</div>
              <div>Status</div>
              <div />
            </div>
          )}

          {records.map((record) => {
            const isEditing = editMonth === record.month;
            const varianceInr = record.remittanceInr - record.indiaTotalInr;
            const varianceAed = record.fxRate > 0 ? varianceInr / record.fxRate : 0;
            const tone = statusTone(record.status);

            return (
              <div key={record.month} style={{ borderBottom: `1px solid ${V.border}` }}>
                {isEditing ? (
                  <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{fmtMonth(record.month)}</div>
                    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 140px", gap: 10 }}>
                      <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 700, color: V.faint, textTransform: "uppercase" }}>
                        INR Amount
                        <input type="text" inputMode="decimal" style={inp} value={editInr} onChange={(e) => setEditInr(e.target.value)} placeholder={record.remittanceInr.toFixed(0)} />
                      </label>
                      <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 700, color: V.faint, textTransform: "uppercase" }}>
                        Rate (1 AED = ? INR)
                        <input type="text" inputMode="decimal" style={inp} value={editRate} onChange={(e) => setEditRate(e.target.value)} placeholder={record.fxRate.toString()} />
                      </label>
                      <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 700, color: V.faint, textTransform: "uppercase" }}>
                        Status
                        <select style={inp} value={editStatus} onChange={(e) => setEditStatus(e.target.value as Status)}>
                          <option value="pending">Pending</option>
                          <option value="partial">Partial</option>
                          <option value="paid">Paid</option>
                          <option value="waived">Waived</option>
                        </select>
                      </label>
                    </div>
                    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 700, color: V.faint, textTransform: "uppercase" }}>
                      Note
                      <input style={inp} value={editNote} onChange={(e) => setEditNote(e.target.value)} placeholder="Leave blank to clear it" />
                    </label>
                    <div style={{ fontSize: 12, color: V.muted }}>India subtotal for that month: INR {record.indiaTotalInr.toFixed(0)}</div>
                    {editInr && editRate && <div style={{ fontSize: 12, color: V.accent, fontWeight: 700 }}>AED {(Number(editInr) / Number(editRate)).toFixed(0)}</div>}
                    <div style={{ display: "flex", gap: 8 }}>
                      <button style={btnP} onClick={() => void saveEdit(record)}>
                        Save
                      </button>
                      <button style={btn} onClick={() => setEditMonth(null)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : isMobile ? (
                  <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, textDecoration: record.status === "paid" || record.status === "waived" ? "line-through" : "none", color: record.status === "paid" || record.status === "waived" ? V.faint : V.text }}>
                          {fmtMonth(record.month)}
                        </div>
                        {record.note && <div style={{ fontSize: 11, color: V.faint, fontStyle: "italic", marginTop: 2 }}>{record.note}</div>}
                      </div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: record.status === "paid" ? V.pos : V.accent, textDecoration: record.status === "waived" ? "line-through" : "none", textAlign: "right" }}>
                        AED {record.remittanceAed.toFixed(0)}
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, fontSize: 11, color: V.muted }}>
                      <div>
                        INR
                        <br />
                        <strong style={{ color: V.text, fontSize: 12, textDecoration: record.status === "waived" ? "line-through" : "none" }}>₹{record.remittanceInr.toLocaleString()}</strong>
                      </div>
                      <div>
                        Rate
                        <br />
                        <strong style={{ color: V.text, fontSize: 12 }}>÷{record.fxRate}</strong>
                      </div>
                      <div>
                        Variance
                        <br />
                        <strong style={{ color: varianceInr === 0 ? V.faint : varianceInr > 0 ? V.neg : V.pos, fontSize: 12 }}>
                          {varianceInr > 0 ? "+" : ""}
                          {varianceInr.toFixed(0)} INR
                        </strong>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
                      <select disabled={record.isLocked} value={record.status} onChange={(e) => void updateStatus(record, e.target.value as Status)} style={{ ...inp, padding: "6px 8px", fontSize: 12, borderColor: tone.fg, color: tone.fg, flex: 1 }}>
                        <option value="pending">Pending</option>
                        <option value="partial">Partial</option>
                        <option value="paid">Paid</option>
                        <option value="waived">Waived</option>
                      </select>
                      <button
                        onClick={() => {
                          setEditMonth(record.month);
                          setEditInr(record.remittanceInr.toString());
                          setEditRate(record.fxRate.toString());
                          setEditNote(record.note);
                          setEditStatus(record.status);
                        }}
                        disabled={record.isLocked}
                        style={{ ...btn, padding: "6px 12px", fontSize: 11, color: V.muted }}
                      >
                        Edit
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 0.9fr 0.7fr 0.9fr 1fr 120px 80px", gap: 8, padding: "12px 16px", alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, textDecoration: record.status === "paid" || record.status === "waived" ? "line-through" : "none", color: record.status === "paid" || record.status === "waived" ? V.faint : V.text }}>
                        {fmtMonth(record.month)}
                      </div>
                      {record.note && <div style={{ fontSize: 11, color: V.faint, fontStyle: "italic", marginTop: 2 }}>{record.note}</div>}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: V.muted, textDecoration: record.status === "waived" ? "line-through" : "none" }}>₹{record.remittanceInr.toLocaleString()}</div>
                    <div style={{ fontSize: 12, color: V.faint }}>÷{record.fxRate}</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: record.status === "paid" ? V.pos : V.accent, textDecoration: record.status === "waived" ? "line-through" : "none" }}>AED {record.remittanceAed.toFixed(0)}</div>
                    <div style={{ fontSize: 12, color: varianceInr === 0 ? V.faint : varianceInr > 0 ? V.neg : V.pos }}>
                      {varianceInr > 0 ? "+" : ""}
                      {varianceInr.toFixed(0)} INR
                      <br />
                      <span style={{ fontSize: 11, color: V.faint }}>
                        {varianceAed > 0 ? "+" : ""}AED {varianceAed.toFixed(0)}
                      </span>
                    </div>
                    <select disabled={record.isLocked} value={record.status} onChange={(e) => void updateStatus(record, e.target.value as Status)} style={{ ...inp, padding: "6px 8px", fontSize: 12, borderColor: tone.fg, color: tone.fg }}>
                      <option value="pending">Pending</option>
                      <option value="partial">Partial</option>
                      <option value="paid">Paid</option>
                      <option value="waived">Waived</option>
                    </select>
                    <button
                      onClick={() => {
                        setEditMonth(record.month);
                        setEditInr(record.remittanceInr.toString());
                        setEditRate(record.fxRate.toString());
                        setEditNote(record.note);
                        setEditStatus(record.status);
                      }}
                      disabled={record.isLocked}
                      style={{ ...btn, padding: "3px 8px", fontSize: 11, color: V.muted }}
                    >
                      Edit
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <Toast message={toast} isDark={isDark} pos={V.pos} />
    </div>
  );
}
