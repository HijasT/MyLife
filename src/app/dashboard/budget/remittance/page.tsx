"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type MonthRecord = {
  month: string;
  remittanceInr: number;
  fxRate: number;
  remittanceAed: number;
  paid: boolean;
  note: string;
  indiaTotalInr: number;
};

function fmtMonth(m: string) {
  const [y, mo] = m.split("-");
  return new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString("en-AE", { month: "long", year: "numeric" });
}

export default function RemittancePage() {
  const supabase = createClient();
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [records, setRecords] = useState<MonthRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [editMonth, setEditMonth] = useState<string | null>(null);
  const [editInr, setEditInr] = useState("");
  const [editRate, setEditRate] = useState("");
  const [editNote, setEditNote] = useState("");
  const [toast, setToast] = useState("");
  const [isDark, setIsDark] = useState(false);

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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }
      setUserId(user.id);

      const [settingsRes, dueItemsRes, entriesRes] = await Promise.all([
        supabase.from("due_month_settings").select("month, remittance_inr, remittance_rate, remittance_paid, note, fx_rates").eq("user_id", user.id).order("month", { ascending: false }),
        supabase.from("due_items").select("id,group_name,default_amount,default_currency").eq("user_id", user.id).eq("group_name", "India"),
        supabase.from("due_entries").select("month,due_item_id,amount,currency").eq("user_id", user.id),
      ]);

      const indiaItems = dueItemsRes.data ?? [];
      const indiaIds = new Set(indiaItems.map((item) => item.id));
      const entries = entriesRes.data ?? [];

      const recs: MonthRecord[] = (settingsRes.data ?? [])
        .filter((s: { remittance_inr: number | null }) => s.remittance_inr != null && s.remittance_inr > 0)
        .map((s: { month: string; remittance_inr: number; remittance_rate: number | null; remittance_paid: boolean | null; note: string | null; fx_rates: Record<string, number> | null }) => {
          const inr = s.remittance_inr ?? 0;
          const rate = s.remittance_rate ?? s.fx_rates?.INR ?? 25.2;
          const monthEntries = entries.filter((e: { month: string; due_item_id: string }) => e.month === s.month && indiaIds.has(e.due_item_id));
          const indiaTotal = indiaItems.reduce((sum, item: { id: string; default_amount: number | null; default_currency: string | null }) => {
            const entry = monthEntries.find((e: { due_item_id: string }) => e.due_item_id === item.id);
            const amount = entry?.amount ?? item.default_amount ?? 0;
            const currency = (entry?.currency ?? item.default_currency ?? "INR") as "AED" | "INR" | "USD";
            if (currency === "INR") return sum + amount;
            const fxRate = s.fx_rates?.[currency] ?? (currency === "USD" ? 3.67 : 25.2);
            return sum + amount * (currency === "AED" ? (s.fx_rates?.INR ?? 25.2) : (s.fx_rates?.INR ?? 25.2) / fxRate);
          }, 0);
          return {
            month: s.month,
            remittanceInr: inr,
            fxRate: rate,
            remittanceAed: rate > 0 ? inr / rate : 0,
            paid: s.remittance_paid ?? false,
            note: s.note ?? "",
            indiaTotalInr: indiaTotal,
          };
        });

      setRecords(recs);
      setLoading(false);
    }
    void load();
  }, []);

  function showToast(msg: string) {
    setToast(msg);
    window.clearTimeout((showToast as unknown as { timer?: number }).timer);
    (showToast as unknown as { timer?: number }).timer = window.setTimeout(() => setToast(""), 2500);
  }

  async function saveEdit(record: MonthRecord) {
    if (!userId) return;
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

    const { error } = await supabase.from("due_month_settings").upsert({
      user_id: userId,
      month: record.month,
      remittance_inr: inr,
      remittance_rate: rate,
      note: editNote,
      remittance_paid: record.paid,
    }, { onConflict: "user_id,month" });

    if (error) {
      showToast(error.message);
      return;
    }

    setRecords((p) => p.map((r) => r.month === record.month ? { ...r, remittanceInr: inr, fxRate: rate, remittanceAed: inr / rate, note: editNote } : r));
    setEditMonth(null);
    showToast("Saved");
  }

  async function togglePaid(record: MonthRecord) {
    if (!userId) return;
    const newPaid = !record.paid;
    const { error } = await supabase.from("due_month_settings").upsert({
      user_id: userId,
      month: record.month,
      remittance_paid: newPaid,
      remittance_inr: record.remittanceInr,
      remittance_rate: record.fxRate,
      note: record.note,
    }, { onConflict: "user_id,month" });
    if (error) {
      showToast(error.message);
      return;
    }
    setRecords((p) => p.map((r) => r.month === record.month ? { ...r, paid: newPaid } : r));
    showToast(newPaid ? "✓ Marked paid" : "Unmarked");
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
  const btn = { padding: "7px 13px", borderRadius: 9, border: `1px solid ${V.border}`, background: V.card, color: V.text, cursor: "pointer", fontSize: 12, fontWeight: 600 } as const;
  const btnP = { ...btn, background: V.accent, border: "none", color: "#fff", fontWeight: 700 } as const;
  const inp = { padding: "8px 12px", borderRadius: 8, border: `1px solid ${V.border}`, background: V.input, color: V.text, fontSize: 13, outline: "none" } as const;

  if (loading) return (
    <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", background: V.bg }}>
      <div style={{ width: 28, height: 28, border: `2.5px solid ${V.accent}`, borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  const totalSent = useMemo(() => records.reduce((sum, record) => sum + record.remittanceAed, 0), [records]);
  const totalPaid = useMemo(() => records.filter((r) => r.paid).reduce((sum, record) => sum + record.remittanceAed, 0), [records]);
  const totalVariance = useMemo(() => records.reduce((sum, record) => sum + (record.remittanceInr - record.indiaTotalInr), 0), [records]);

  return (
    <div style={{ minHeight: "100vh", background: V.bg, color: V.text, fontFamily: "system-ui,sans-serif" }}>
      <div style={{ position: "sticky", top: 0, zIndex: 20, background: isDark ? "rgba(13,15,20,0.9)" : "rgba(249,248,245,0.9)", backdropFilter: "blur(12px)", borderBottom: `1px solid ${V.border}`, padding: "12px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Link href="/dashboard/budget" style={{ display: "flex", alignItems: "center", gap: 8, color: V.muted, textDecoration: "none", fontWeight: 600, fontSize: 13 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          Due Tracker
        </Link>
        <span style={{ fontSize: 16, fontWeight: 800 }}>Remittance History</span>
        <div />
      </div>

      <div style={{ maxWidth: 920, margin: "0 auto", padding: "24px 20px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", gap: 10, marginBottom: 20 }}>
          {[
            { label: "Total remitted", value: `AED ${totalSent.toFixed(0)}`, color: V.accent },
            { label: "Total paid", value: `AED ${totalPaid.toFixed(0)}`, color: "#16a34a" },
            { label: "Months tracked", value: records.length, color: V.muted },
            { label: "Variance", value: `${totalVariance > 0 ? "+" : ""}${totalVariance.toFixed(0)} INR`, color: totalVariance === 0 ? V.faint : totalVariance > 0 ? "#ef4444" : "#16a34a" },
          ].map((card) => (
            <div key={card.label} style={{ background: V.card, border: `1px solid ${V.border}`, borderRadius: 12, padding: "12px 14px" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: V.faint, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>{card.label}</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: card.color }}>{card.value}</div>
            </div>
          ))}
        </div>

        {records.length === 0 && (
          <div style={{ padding: "48px", textAlign: "center", color: V.faint, fontSize: 13, background: V.card, border: `1px solid ${V.border}`, borderRadius: 14 }}>
            No remittance entries yet. Beautifully empty, but not very useful.
          </div>
        )}

        <div style={{ background: V.card, border: `1px solid ${V.border}`, borderRadius: 14, overflow: "hidden" }}>
          {records.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "22px 1fr 0.8fr 0.7fr 0.9fr 1fr", gap: 8, padding: "9px 16px", fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: V.faint, borderBottom: `1px solid ${V.border}`, background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)" }}>
              <div />
              <div>Month</div>
              <div>INR</div>
              <div>Rate</div>
              <div>AED</div>
              <div>Variance</div>
            </div>
          )}

          {records.map((record) => {
            const isEditing = editMonth === record.month;
            const varianceInr = record.remittanceInr - record.indiaTotalInr;
            const varianceAed = record.fxRate > 0 ? varianceInr / record.fxRate : 0;
            return (
              <div key={record.month} style={{ borderBottom: `1px solid ${V.border}` }}>
                {isEditing ? (
                  <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{fmtMonth(record.month)}</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 700, color: V.faint, textTransform: "uppercase" }}>
                        INR Amount
                        <input type="number" style={inp} value={editInr} onChange={(e) => setEditInr(e.target.value)} placeholder={record.remittanceInr.toFixed(0)} />
                      </label>
                      <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 700, color: V.faint, textTransform: "uppercase" }}>
                        Rate (1 AED = ? INR)
                        <input type="number" step="0.01" style={inp} value={editRate} onChange={(e) => setEditRate(e.target.value)} placeholder={record.fxRate.toString()} />
                      </label>
                    </div>
                    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 700, color: V.faint, textTransform: "uppercase" }}>
                      Note
                      <input style={inp} value={editNote} onChange={(e) => setEditNote(e.target.value)} placeholder="Leave blank to clear it" />
                    </label>
                    <div style={{ fontSize: 12, color: V.muted }}>India subtotal for that month: INR {record.indiaTotalInr.toFixed(0)}</div>
                    {editInr && editRate && (
                      <div style={{ fontSize: 12, color: V.accent, fontWeight: 700 }}>AED {(Number(editInr) / Number(editRate)).toFixed(0)}</div>
                    )}
                    <div style={{ display: "flex", gap: 8 }}>
                      <button style={btnP} onClick={() => void saveEdit(record)}>Save</button>
                      <button style={btn} onClick={() => setEditMonth(null)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "22px 1fr 0.8fr 0.7fr 0.9fr 1fr", gap: 8, padding: "12px 16px", alignItems: "center" }}>
                    <button onClick={() => void togglePaid(record)} style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${record.paid ? "#16a34a" : V.border}`, background: record.paid ? "#16a34a" : "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, padding: 0 }}>
                      {record.paid && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
                    </button>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, textDecoration: record.paid ? "line-through" : "none", color: record.paid ? V.faint : V.text }}>{fmtMonth(record.month)}</div>
                      {record.note && <div style={{ fontSize: 11, color: V.faint, fontStyle: "italic", marginTop: 2 }}>{record.note}</div>}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: V.muted }}>₹{record.remittanceInr.toLocaleString()}</div>
                    <div style={{ fontSize: 12, color: V.faint }}>÷{record.fxRate}</div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: record.paid ? "#16a34a" : V.accent }}>AED {record.remittanceAed.toFixed(0)}</span>
                      <button onClick={() => { setEditMonth(record.month); setEditInr(record.remittanceInr.toString()); setEditRate(record.fxRate.toString()); setEditNote(record.note); }} style={{ ...btn, padding: "3px 8px", fontSize: 11, color: V.muted }}>Edit</button>
                    </div>
                    <div style={{ fontSize: 12, color: varianceInr === 0 ? V.faint : varianceInr > 0 ? "#ef4444" : "#16a34a" }}>
                      {varianceInr > 0 ? "+" : ""}{varianceInr.toFixed(0)} INR<br />
                      <span style={{ fontSize: 11, color: V.faint }}>{varianceAed > 0 ? "+" : ""}AED {varianceAed.toFixed(0)}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {toast && <div style={{ position: "fixed", bottom: 20, right: 16, background: isDark ? "#1a3a2a" : "#f0fdf4", color: "#16a34a", border: "1px solid rgba(22,163,74,0.3)", padding: "12px 18px", borderRadius: 12, fontSize: 13, fontWeight: 700, boxShadow: "0 8px 24px rgba(0,0,0,0.2)", zIndex: 200 }}>{toast}</div>}
    </div>
  );
}
