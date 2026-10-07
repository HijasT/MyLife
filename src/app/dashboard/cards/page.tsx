"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { createClient, getClientUser } from "@/lib/supabase/client";

// rewards is jsonb on credit_cards; one row per spending category the card earns on.
// cap = monthly reward/cashback cap in the card's fee_currency (omit = uncapped).
type Reward = { category: string; rate: number; cap?: number; notes?: string };

// Monthly spend that hits a capped reward's ceiling: cap / (rate/100).
// e.g. 10% capped at AED 75 → spend AED 750/mo reaches the cap.
function capSpend(r: Reward, currency: string | null): string | null {
  if (!r.cap || r.cap <= 0 || !r.rate || r.rate <= 0) return null;
  const spend = Math.round(r.cap / (r.rate / 100));
  const cur = currency || "";
  return `max spend ${cur} ${spend.toLocaleString()}/mo (${cur} ${r.cap} cap)`;
}
type Card = {
  id: string;
  name: string;
  issuer: string | null;
  network: string | null;
  annual_fee: number | null;
  fee_currency: string | null;
  fee_waiver: string | null;
  forex_fee: string | null;
  benefits: string | null;
  terms: string | null;
  source_url: string | null;
  rewards: Reward[];
  is_active: boolean;
};

type Draft = {
  name: string;
  issuer: string;
  network: string;
  annual_fee: string;
  fee_currency: string;
  fee_waiver: string;
  forex_fee: string;
  benefits: string;
  terms: string;
  source_url: string;
  is_active: boolean;
  rewards: Reward[];
};

const EMPTY: Draft = {
  name: "", issuer: "", network: "", annual_fee: "", fee_currency: "AED",
  fee_waiver: "", forex_fee: "", benefits: "", terms: "", source_url: "", is_active: true, rewards: [],
};

const ACCENT = "#8b5cf6";

type Region = "UAE" | "India" | "International";
const REGIONS: { key: Region; label: string }[] = [
  { key: "UAE", label: "🇦🇪 UAE" },
  { key: "India", label: "🇮🇳 India" },
  { key: "International", label: "🌍 International" },
];

// ponytail: region derived from billing currency (AED→UAE, INR→India, else International)
function regionOf(c: Card): Region {
  const cur = (c.fee_currency || "").trim().toUpperCase();
  if (cur === "AED") return "UAE";
  if (cur === "INR") return "India";
  return "International";
}

// This card's highest-rate reward category.
function topReward(c: Card): Reward | null {
  let best: Reward | null = null;
  for (const r of c.rewards ?? []) {
    if (r.category.trim() && (!best || r.rate > best.rate)) best = r;
  }
  return best;
}

// For each category earned by any active card in the set, the card with the top rate.
function bestByCategory(cards: Card[]) {
  const best = new Map<string, { card: Card; reward: Reward }>();
  for (const c of cards) {
    if (!c.is_active) continue;
    for (const r of c.rewards ?? []) {
      const key = r.category.trim();
      if (!key) continue;
      const cur = best.get(key);
      if (!cur || r.rate > cur.reward.rate) best.set(key, { card: c, reward: r });
    }
  }
  return [...best.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

export default function CardsPage() {
  const supabase = createClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [cards, setCards] = useState<Card[]>([]);
  const [editing, setEditing] = useState<{ id: string | null; draft: Draft } | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [toast, setToast] = useState("");

  const V = {
    bg: "var(--main-bg)", card: "var(--card-bg)", border: "var(--card-border)",
    text: "var(--text-primary)", muted: "var(--text-secondary)", faint: "var(--text-muted)",
    input: "var(--main-bg2)",
  };
  const inp: CSSProperties = { padding: "8px 12px", borderRadius: 8, border: `1px solid ${V.border}`, background: V.input, color: V.text, fontSize: 13, outline: "none", width: "100%" };
  const btn: CSSProperties = { padding: "8px 14px", borderRadius: 10, border: `1px solid ${V.border}`, background: V.card, color: V.text, cursor: "pointer", fontSize: 13, fontWeight: 600 };
  const btnP: CSSProperties = { ...btn, background: ACCENT, border: "none", color: "#fff", fontWeight: 700 };

  function flash(m: string) { setToast(m); window.setTimeout(() => setToast(""), 2500); }

  useEffect(() => {
    void (async () => {
      const user = await getClientUser(supabase);
      if (!user) { setLoading(false); return; }
      setUserId(user.id);
      await load(user.id);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load(uid: string) {
    const { data, error } = await supabase
      .from("credit_cards").select("*").eq("user_id", uid)
      .order("sort_order").order("created_at");
    if (error) { flash(error.message); return; }
    setCards((data ?? []).map((c) => ({ ...c, rewards: Array.isArray(c.rewards) ? c.rewards : [] })) as Card[]);
  }

  async function save() {
    if (!editing || !userId) return;
    const d = editing.draft;
    if (!d.name.trim()) { flash("Card name is required"); return; }
    const row = {
      user_id: userId,
      name: d.name.trim(),
      issuer: d.issuer.trim() || null,
      network: d.network.trim() || null,
      annual_fee: d.annual_fee === "" ? 0 : Number(d.annual_fee),
      fee_currency: d.fee_currency.trim() || "AED",
      fee_waiver: d.fee_waiver.trim() || null,
      forex_fee: d.forex_fee.trim() || null,
      benefits: d.benefits.trim() || null,
      terms: d.terms.trim() || null,
      source_url: d.source_url.trim() || null,
      is_active: d.is_active,
      rewards: d.rewards
        .filter((r) => r.category.trim())
        .map((r) => ({
          category: r.category.trim(),
          rate: Number(r.rate) || 0,
          cap: r.cap && Number(r.cap) > 0 ? Number(r.cap) : undefined,
          notes: r.notes?.trim() || undefined,
        })),
    };
    const q = editing.id
      ? supabase.from("credit_cards").update(row).eq("id", editing.id)
      : supabase.from("credit_cards").insert(row);
    const { error } = await q;
    if (error) { flash(error.message); return; }
    setEditing(null);
    await load(userId);
    flash(editing.id ? "Card updated" : "Card added");
  }

  async function remove(id: string) {
    if (!userId || !confirm("Delete this card?")) return;
    const { error } = await supabase.from("credit_cards").delete().eq("id", id);
    if (error) { flash(error.message); return; }
    await load(userId);
    flash("Card deleted");
  }

  async function toggleActive(c: Card) {
    if (!userId) return;
    const { error } = await supabase.from("credit_cards").update({ is_active: !c.is_active }).eq("id", c.id);
    if (error) { flash(error.message); return; }
    await load(userId);
    flash(c.is_active ? "Card disabled — dropped from best-card picker" : "Card enabled");
  }

  function openEdit(c?: Card) {
    setEditing(c
      ? { id: c.id, draft: {
          name: c.name, issuer: c.issuer ?? "", network: c.network ?? "",
          annual_fee: c.annual_fee == null ? "" : String(c.annual_fee),
          fee_currency: c.fee_currency ?? "AED", fee_waiver: c.fee_waiver ?? "", forex_fee: c.forex_fee ?? "",
          benefits: c.benefits ?? "", terms: c.terms ?? "", source_url: c.source_url ?? "", is_active: c.is_active,
          rewards: c.rewards.map((r) => ({ ...r })),
        } }
      : { id: null, draft: { ...EMPTY, rewards: [] } });
  }

  const grouped = useMemo(() => {
    return REGIONS
      .map((r) => ({ ...r, cards: cards.filter((c) => regionOf(c) === r.key) }))
      .filter((g) => g.cards.length > 0);
  }, [cards]);

  if (loading) return <div style={{ padding: 40, color: V.muted }}>Loading…</div>;

  return (
    <div style={{ minHeight: "100vh", background: V.bg, color: V.text }}>
      <div style={{ maxWidth: 820, margin: "0 auto", padding: "24px 16px 80px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>💳 Cards</h1>
            <p style={{ color: V.faint, fontSize: 13, margin: "4px 0 0" }}>Best card per service, grouped by region.</p>
          </div>
          <button style={btnP} onClick={() => openEdit()}>+ Add card</button>
        </div>

        {cards.length === 0 ? (
          <div style={{ color: V.faint, fontSize: 14, textAlign: "center", padding: 40 }}>No cards yet.</div>
        ) : (
          grouped.map((g) => {
            const best = bestByCategory(g.cards);
            return (
              <div key={g.key} style={{ marginBottom: 32 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                  <h2 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>{g.label}</h2>
                  <span style={{ fontSize: 12, color: V.faint }}>{g.cards.length} card{g.cards.length > 1 ? "s" : ""}</span>
                  <div style={{ flex: 1, height: 1, background: V.border }} />
                </div>

                {/* Best card per category within this region */}
                {best.length > 0 && (
                  <section style={{ background: V.card, border: `1px solid ${V.border}`, borderRadius: 14, marginBottom: 14, overflow: "hidden" }}>
                    <div style={{ padding: "10px 16px", fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", color: V.faint, borderBottom: `1px solid ${V.border}` }}>
                      Best card by category
                    </div>
                    {best.map(([cat, { card, reward }]) => (
                      <div key={cat} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "9px 16px", borderBottom: `1px solid ${V.border}` }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 14 }}>{cat}</div>
                          {reward.notes && <div style={{ fontSize: 12, color: V.faint }}>{reward.notes}</div>}
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontWeight: 700, color: ACCENT }}>{reward.rate}%</div>
                          <div style={{ fontSize: 12, color: V.muted }}>{card.name}</div>
                        </div>
                      </div>
                    ))}
                  </section>
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {g.cards.map((c) => (
                    <CardRow
                      key={c.id} c={c} V={V} btn={btn}
                      open={expanded === c.id}
                      onToggle={() => setExpanded(expanded === c.id ? null : c.id)}
                      onEdit={() => openEdit(c)} onDelete={() => remove(c.id)}
                      onToggleActive={() => toggleActive(c)}
                    />
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>

      {editing && (
        <EditModal
          V={V} inp={inp} btn={btn} btnP={btnP}
          state={editing} setState={setEditing}
          onSave={save} onClose={() => setEditing(null)}
        />
      )}

      {toast && (
        <div style={{ position: "fixed", bottom: 20, right: 16, background: V.card, border: `1px solid ${V.border}`, color: V.text, padding: "12px 18px", borderRadius: 12, fontSize: 13, fontWeight: 700, boxShadow: "0 8px 24px rgba(0,0,0,0.2)", zIndex: 200 }}>
          {toast}
        </div>
      )}
    </div>
  );
}

function CardRow({
  c, V, btn, open, onToggle, onEdit, onDelete, onToggleActive,
}: {
  c: Card; V: Record<string, string>; btn: CSSProperties;
  open: boolean; onToggle: () => void; onEdit: () => void; onDelete: () => void; onToggleActive: () => void;
}) {
  const top = topReward(c);
  return (
    <div style={{ background: V.card, border: `1px solid ${V.border}`, borderRadius: 14, overflow: "hidden", opacity: c.is_active ? 1 : 0.5 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "14px 16px", cursor: "pointer" }} onClick={onToggle}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>
            {c.name} {!c.is_active && <span style={{ fontSize: 11, color: V.faint }}>(disabled)</span>}
          </div>
          <div style={{ fontSize: 12, color: V.faint }}>
            {[c.issuer, c.network].filter(Boolean).join(" · ") || "—"}
            {" · "}Fee {c.annual_fee ? `${c.fee_currency} ${c.annual_fee}` : "free"}
            {c.forex_fee ? ` · Forex ${c.forex_fee}` : ""}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
          <button style={{ ...btn, padding: "6px 10px" }} onClick={onToggleActive} title={c.is_active ? "Disable (drop from best-card picker)" : "Enable"}>
            {c.is_active ? "Disable" : "Enable"}
          </button>
          <button style={{ ...btn, padding: "6px 10px" }} onClick={onEdit}>Edit</button>
          <button style={{ ...btn, padding: "6px 10px", color: "#ef4444" }} onClick={onDelete}>Delete</button>
        </div>
      </div>

      {/* Always-visible: best category + benefits */}
      <div style={{ padding: "0 16px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
        {top && (
          <div>
            <Label V={V}>Best category</Label>
            <span style={{ display: "inline-block", fontSize: 13, fontWeight: 700, padding: "4px 10px", borderRadius: 999, background: ACCENT, color: "#fff" }}>
              {top.category} {top.rate}%{top.notes ? ` · ${top.notes}` : ""}
            </span>
            {capSpend(top, c.fee_currency) && (
              <div style={{ fontSize: 12, color: V.muted, marginTop: 4 }}>💡 {capSpend(top, c.fee_currency)}</div>
            )}
          </div>
        )}
        {c.benefits && <Field V={V} label="Benefits" value={c.benefits} />}
      </div>

      {open && (
        <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 12, borderTop: `1px solid ${V.border}`, marginTop: 2, paddingTop: 12 }}>
          {c.rewards.length > 0 && (
            <div>
              <Label V={V}>All rewards</Label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {c.rewards.map((r, i) => {
                  const isTop = top != null && r.category === top.category && r.rate === top.rate;
                  const cap = capSpend(r, c.fee_currency);
                  return (
                    <span key={i} style={{ fontSize: 12, padding: "3px 8px", borderRadius: 999, background: isTop ? ACCENT : V.input, color: isTop ? "#fff" : V.text, border: `1px solid ${isTop ? ACCENT : V.border}` }}>
                      {r.category} <b style={{ color: isTop ? "#fff" : ACCENT }}>{r.rate}%</b>{r.notes ? ` · ${r.notes}` : ""}{cap ? ` · ${cap}` : ""}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
          {c.forex_fee && <Field V={V} label="Foreign transaction fee" value={c.forex_fee} />}
          {c.fee_waiver && <Field V={V} label="Fee waiver" value={c.fee_waiver} />}
          {c.terms && <Field V={V} label="Terms, fees & usage policy" value={c.terms} />}
          {c.source_url && (
            <div>
              <Label V={V}>Source</Label>
              <a href={c.source_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: ACCENT, wordBreak: "break-all" }}>
                {c.source_url}
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Label({ children, V }: { children: React.ReactNode; V: Record<string, string> }) {
  return <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: V.faint, marginBottom: 4 }}>{children}</div>;
}

function Field({ V, label, value }: { V: Record<string, string>; label: string; value: string }) {
  return (
    <div>
      <Label V={V}>{label}</Label>
      <div style={{ fontSize: 13, color: V.muted, whiteSpace: "pre-wrap" }}>{value}</div>
    </div>
  );
}

function EditModal({
  V, inp, btn, btnP, state, setState, onSave, onClose,
}: {
  V: Record<string, string>;
  inp: CSSProperties; btn: CSSProperties; btnP: CSSProperties;
  state: { id: string | null; draft: Draft };
  setState: (s: { id: string | null; draft: Draft }) => void;
  onSave: () => void; onClose: () => void;
}) {
  const d = state.draft;
  const set = (patch: Partial<Draft>) => setState({ ...state, draft: { ...d, ...patch } });
  const setReward = (i: number, patch: Partial<Reward>) =>
    set({ rewards: d.rewards.map((r, j) => (j === i ? { ...r, ...patch } : r)) });

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, overflow: "auto" }} onClick={onClose}>
      <div style={{ background: V.card, border: `1px solid ${V.border}`, borderRadius: 18, width: "min(560px,100%)", maxHeight: "90vh", overflow: "auto", margin: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: "18px 20px", borderBottom: `1px solid ${V.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: V.text }}>{state.id ? "Edit card" : "Add card"}</div>
          <button style={{ ...btn, padding: "6px 10px" }} onClick={onClose}>✕</button>
        </div>
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <div><Label V={V}>Card name *</Label><input style={inp} value={d.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. ADCB Traveller" /></div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 140 }}><Label V={V}>Issuer / bank</Label><input style={inp} value={d.issuer} onChange={(e) => set({ issuer: e.target.value })} /></div>
            <div style={{ flex: 1, minWidth: 140 }}><Label V={V}>Network</Label><input style={inp} value={d.network} onChange={(e) => set({ network: e.target.value })} placeholder="Visa / Mastercard" /></div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 120 }}><Label V={V}>Annual fee</Label><input style={inp} type="number" value={d.annual_fee} onChange={(e) => set({ annual_fee: e.target.value })} /></div>
            <div style={{ width: 90 }}><Label V={V}>Currency</Label><input style={inp} value={d.fee_currency} onChange={(e) => set({ fee_currency: e.target.value })} /></div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 140 }}><Label V={V}>Fee waiver condition</Label><input style={inp} value={d.fee_waiver} onChange={(e) => set({ fee_waiver: e.target.value })} placeholder="e.g. waived if spend 24k/yr" /></div>
            <div style={{ flex: 1, minWidth: 140 }}><Label V={V}>Foreign transaction fee</Label><input style={inp} value={d.forex_fee} onChange={(e) => set({ forex_fee: e.target.value })} placeholder="e.g. 2.61% + scheme" /></div>
          </div>

          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <Label V={V}>Reward categories</Label>
              <button style={{ ...btn, padding: "4px 10px", fontSize: 12 }} onClick={() => set({ rewards: [...d.rewards, { category: "", rate: 0, notes: "" }] })}>+ Add</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {d.rewards.map((r, i) => (
                <div key={i} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  <input style={{ ...inp, flex: 2, minWidth: 120 }} value={r.category} onChange={(e) => setReward(i, { category: e.target.value })} placeholder="Category (e.g. Dining)" />
                  <input style={{ ...inp, width: 70 }} type="number" value={r.rate} onChange={(e) => setReward(i, { rate: Number(e.target.value) })} placeholder="rate %" />
                  <input style={{ ...inp, width: 90 }} type="number" value={r.cap ?? ""} onChange={(e) => setReward(i, { cap: e.target.value === "" ? undefined : Number(e.target.value) })} placeholder="cap/mo" title="Monthly cashback cap in card currency (blank = uncapped)" />
                  <input style={{ ...inp, flex: 2, minWidth: 110 }} value={r.notes ?? ""} onChange={(e) => setReward(i, { notes: e.target.value })} placeholder="Notes" />
                  <button style={{ ...btn, padding: "6px 10px", color: "#ef4444" }} onClick={() => set({ rewards: d.rewards.filter((_, j) => j !== i) })}>✕</button>
                </div>
              ))}
              {d.rewards.length === 0 && <div style={{ fontSize: 12, color: V.faint }}>No categories yet — add one per service this card earns on.</div>}
            </div>
          </div>

          <div><Label V={V}>Benefits</Label><textarea style={{ ...inp, minHeight: 60, resize: "vertical" }} value={d.benefits} onChange={(e) => set({ benefits: e.target.value })} placeholder="Lounge access, travel insurance, offers…" /></div>
          <div><Label V={V}>Terms, fees & usage policy</Label><textarea style={{ ...inp, minHeight: 60, resize: "vertical" }} value={d.terms} onChange={(e) => set({ terms: e.target.value })} placeholder="Interest, late fee, forex, min spend, exclusions…" /></div>
          <div><Label V={V}>Source URL</Label><input style={inp} value={d.source_url} onChange={(e) => set({ source_url: e.target.value })} placeholder="Official KFS / product page to cross-verify" /></div>

          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: V.muted, cursor: "pointer" }}>
            <input type="checkbox" checked={d.is_active} onChange={(e) => set({ is_active: e.target.checked })} />
            Active (include in best-card picker)
          </label>
        </div>
        <div style={{ padding: "0 20px 20px", display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button style={btn} onClick={onClose}>Cancel</button>
          <button style={btnP} onClick={onSave}>{state.id ? "Save" : "Add card"}</button>
        </div>
      </div>
    </div>
  );
}
