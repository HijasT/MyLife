"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { nowDubai, todayDubai } from "@/lib/timezone";
import { createClient } from "@/lib/supabase/client";
import { markSynced } from "@/hooks/useSyncStatus";

type BottleType = "Full bottle" | "Decant" | "Sample" | "Tester";
type BottleStatus = "In collection" | "Emptied" | "Sold" | "Gifted";
type GenderScale = 0 | 1 | 2 | 3 | 4;

type Bottle = { id: string; bottleSizeMl: number; bottleType: BottleType; status: BottleStatus; usage: string };
type Purchase = { id: string; bottleId: string; date: string; ml: number; price: number; shopName: string; shopLink?: string };
type WearLog = { id: string; wornOn: string; occasion: string; sprays: number; weatherTag: string; compliment: boolean; performance: string };
type Perfume = {
  id: string;
  status: "wardrobe" | "wishlist" | "archive";
  brand: string;
  model: string;
  imageUrl: string;
  ratingStars: number | null;
  notesTags: string[];
  weatherTags: ("Cold" | "Neutral" | "Hot")[];
  genderScale: GenderScale;
  longevity: string;
  sillage: string;
  value: "Worth it" | "Neutral" | "Not worth it";
  cloneSimilar: string;
  notesText: string;
  purchasePriority?: string;
  targetPriceAed?: number | null;
  preferredShop?: string;
  archivedAt?: string | null;
  resalePriceAed?: number | null;
  archiveNotes?: string;
  bottles: Bottle[];
  archiveReason?: string;
};

function safeNum(x: unknown, fb = 0) { const n = typeof x === "number" ? x : Number(x); return Number.isFinite(n) ? n : fb; }
function fmtMoney(a: number) { return `AED ${a.toFixed(2)}`; }
function genderLabel(v: GenderScale) { return ["Masculine","Lean masc.","Unisex","Lean fem.","Feminine"][v]; }
function normalizeName(v: string) { return v.trim().toLowerCase().replace(/\s+/g, " "); }
function useDarkMode() {
  const get = () => typeof document !== "undefined" && document.documentElement.classList.contains("dark");
  const [isDark, setIsDark] = useState(get);
  useEffect(() => {
    if (typeof document === "undefined") return;
    const obs = new MutationObserver(() => setIsDark(get()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return isDark;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dbToItem(row: any): Perfume {
  return {
    id: row.id,
    status: row.status ?? "wardrobe",
    brand: row.brand ?? "",
    model: row.model ?? "",
    imageUrl: row.image_url || "",
    ratingStars: row.rating_stars ?? null,
    notesTags: row.notes_tags ?? [],
    weatherTags: row.weather_tags ?? [],
    genderScale: (row.gender_scale ?? 2) as GenderScale,
    longevity: row.longevity ?? "",
    sillage: row.sillage ?? "",
    value: (row.value_rating ?? "Neutral") as Perfume["value"],
    cloneSimilar: row.clone_similar ?? "",
    notesText: row.notes_text ?? "",
    purchasePriority: row.purchase_priority ?? "Medium",
    targetPriceAed: row.target_price_aed ?? null,
    preferredShop: row.preferred_shop ?? "",
    archivedAt: row.archived_at ?? null,
    resalePriceAed: row.resale_price_aed ?? null,
    archiveNotes: row.archive_notes ?? "",
    bottles: (row.perfume_bottles ?? []).map((b: any): Bottle => ({
      id: b.id,
      bottleSizeMl: b.bottle_size_ml ?? 100,
      bottleType: b.bottle_type ?? "Full bottle",
      status: b.status ?? "In collection",
      usage: b.usage ?? "Casual",
    })),
    archiveReason: row.archive_reason ?? undefined,
  };
}

function Tag({ label }: { label: string }) {
  return <span style={{ padding: "4px 10px", borderRadius: 999, background: "rgba(245,166,35,0.12)", color: "#d97706", fontSize: 12, fontWeight: 700 }}>{label}</span>;
}
function Stars({ value, size=16 }: { value: number | null; size?: number }) {
  const v = Math.round(value ?? 0);
  return <div style={{ display: "flex", gap: 2 }}>{[1,2,3,4,5].map(n => <span key={n} style={{ fontSize: size, color: n <= v ? "#F5A623" : "#d1d5db" }}>★</span>)}</div>;
}

export default function PerfumeDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const router = useRouter();
  const isDark = useDarkMode();

  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState("");
  const [item, setItem] = useState<Perfume | null>(null);
  const [catalog, setCatalog] = useState<Perfume[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [wearLogs, setWearLogs] = useState<WearLog[]>([]);
  const [globalNotes, setGlobalNotes] = useState<string[]>([]);
  const [noteInput, setNoteInput] = useState("");
  const [isEdit, setIsEdit] = useState(false);
  const [noteManager, setNoteManager] = useState(false);
  const [weatherManager, setWeatherManager] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [archiveChoice, setArchiveChoice] = useState<"Sold"|"Emptied"|"Gifted">("Emptied");
  const [archiveResale, setArchiveResale] = useState("");
  const [archiveNotesInput, setArchiveNotesInput] = useState("");
  const [showRemove, setShowRemove] = useState(false);
  const [toast, setToast] = useState("");
  const [photoMode, setPhotoMode] = useState<"url"|"upload">("url");
  const [photoInput, setPhotoInput] = useState("");
  const [showAddBottle, setShowAddBottle] = useState(false);
  const [showPhoto, setShowPhoto] = useState(false);
  const [showWearModal, setShowWearModal] = useState(false);
  const [brandView, setBrandView] = useState(false);
  const [newBottle, setNewBottle] = useState({ bottleType: "Full bottle" as BottleType, sizeMl: "100", usage: "Casual", price: "", date: nowDubai().slice(0,10), shopName: "", shopLink: "" });
  const [wearForm, setWearForm] = useState({ wornOn: todayDubai(), occasion: "", sprays: "6", weatherTag: "", compliment: false, performance: "" });

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      setUserId(user.id);
      const [itemRes, purRes, allRes, catalogRes, wearRes] = await Promise.all([
        supabase.from("perfumes").select("*, perfume_bottles(*)").eq("id", params.id).single(),
        supabase.from("perfume_purchases").select("*").eq("perfume_id", params.id).order("date", { ascending: false }),
        supabase.from("perfumes").select("notes_tags").eq("user_id", user.id),
        supabase.from("perfumes").select("*").eq("user_id", user.id).order("brand"),
        supabase.from("perfume_wear_logs").select("*").eq("perfume_id", params.id).order("worn_on", { ascending: false }),
      ]);
      if (itemRes.error) showToast(itemRes.error.message);
      if (purRes.error) showToast(purRes.error.message);
      if (catalogRes.error) showToast(catalogRes.error.message);
      if (wearRes.error) showToast(wearRes.error.message);
      if (itemRes.data) setItem(dbToItem(itemRes.data));
      if (catalogRes.data) setCatalog(catalogRes.data.map(dbToItem));
      if (purRes.data) setPurchases(purRes.data.map((p: any) => ({ id: p.id, bottleId: p.bottle_id ?? "none", date: p.date, ml: p.ml ?? 0, price: p.price ?? 0, shopName: p.shop_name ?? "Unknown", shopLink: p.shop_link ?? undefined })));
      if (wearRes.data) setWearLogs(wearRes.data.map((w: any) => ({ id: w.id, wornOn: w.worn_on, occasion: w.occasion ?? "", sprays: w.sprays ?? 0, weatherTag: w.weather_tag ?? "", compliment: !!w.compliment, performance: w.performance ?? "" })));
      if (allRes.data) setGlobalNotes(Array.from(new Set(allRes.data.flatMap((r: { notes_tags: string[] }) => r.notes_tags ?? []))).sort());
      setLoading(false);
      markSynced();
    }
    load();
  }, [params.id, router, supabase]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  }

  async function update(partial: Partial<Perfume>) {
    if (!item) return;
    setItem(prev => prev ? { ...prev, ...partial } : prev);
    const db: Record<string, unknown> = {};
    if (partial.ratingStars !== undefined) db.rating_stars = partial.ratingStars;
    if (partial.notesTags !== undefined) db.notes_tags = partial.notesTags;
    if (partial.weatherTags !== undefined) db.weather_tags = partial.weatherTags;
    if (partial.genderScale !== undefined) db.gender_scale = partial.genderScale;
    if (partial.longevity !== undefined) db.longevity = partial.longevity;
    if (partial.sillage !== undefined) db.sillage = partial.sillage;
    if (partial.value !== undefined) db.value_rating = partial.value;
    if (partial.cloneSimilar !== undefined) db.clone_similar = partial.cloneSimilar;
    if (partial.imageUrl !== undefined) db.image_url = partial.imageUrl;
    if (partial.purchasePriority !== undefined) db.purchase_priority = partial.purchasePriority;
    if (partial.archivedAt !== undefined) db.archived_at = partial.archivedAt;
    if (partial.resalePriceAed !== undefined) db.resale_price_aed = partial.resalePriceAed;
    if (partial.archiveNotes !== undefined) db.archive_notes = partial.archiveNotes;
    if (!Object.keys(db).length) return;
    const { error } = await supabase.from("perfumes").update(db).eq("id", item.id);
    if (error) showToast(error.message);
  }

  async function updateBottle(bottleId: string, partial: Partial<Bottle>) {
    if (!item) return;
    setItem(prev => prev ? { ...prev, bottles: prev.bottles.map(b => b.id === bottleId ? { ...b, ...partial } : b) } : prev);
    const db: Record<string, unknown> = {};
    if (partial.bottleType !== undefined) db.bottle_type = partial.bottleType;
    if (partial.bottleSizeMl !== undefined) db.bottle_size_ml = partial.bottleSizeMl;
    if (partial.status !== undefined) db.status = partial.status;
    if (partial.usage !== undefined) db.usage = partial.usage;
    const { error } = await supabase.from("perfume_bottles").update(db).eq("id", bottleId);
    if (error) showToast(error.message);
  }

  async function doRemove() {
    if (!item) return;
    const { error } = await supabase.from("perfumes").delete().eq("id", item.id);
    if (error) { showToast(error.message); return; }
    router.push("/dashboard/perfumes");
  }

  async function doArchive() {
    if (!item || item.status === "wishlist") return;
    const resale = safeNum(archiveResale, 0);
    const archivedAt = nowDubai();
    const { error } = await supabase.from("perfumes").update({ status: "archive", archive_reason: archiveChoice, archived_at: archivedAt, resale_price_aed: resale || null, archive_notes: archiveNotesInput || null }).eq("id", item.id);
    if (error) { showToast(error.message); return; }
    setItem(prev => prev ? { ...prev, status: "archive", archiveReason: archiveChoice, archivedAt, resalePriceAed: resale || null, archiveNotes: archiveNotesInput } : prev);
    setShowArchive(false);
    showToast(`Archived as ${archiveChoice}`);
  }

  async function uploadPhoto(file: File) {
    if (!userId || !item) return;
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `${userId}/${item.id}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("aromatica").upload(path, file, { upsert: true });
    if (error) { showToast(error.message); return; }
    const { data } = supabase.storage.from("aromatica").getPublicUrl(path);
    await update({ imageUrl: data.publicUrl });
    setShowPhoto(false);
    showToast("Photo updated");
  }

  async function copyToClipboard() {
    if (!item) return;
    const text = `${item.brand} — ${item.model}\n⭐ ${item.ratingStars?.toFixed(1) ?? "n/a"}/5\n🌿 ${item.notesTags.join(", ") || "—"}\n🌦 ${item.weatherTags.join(", ") || "—"}\n💨 ${item.sillage} · ⏱ ${item.longevity}\n💰 ${item.value}`;
    try { await navigator.clipboard.writeText(text); showToast("Copied to clipboard"); }
    catch { showToast("Clipboard blocked"); }
  }

  async function addBottle() {
    if (!userId || !item) return;
    const price = parseFloat(newBottle.price) || 0;
    if (price <= 0) { showToast("Bottle price in AED is required"); return; }
    const size = parseFloat(newBottle.sizeMl) || 100;
    const { data: bd, error: bottleErr } = await supabase.from("perfume_bottles").insert({
      perfume_id: item.id, user_id: userId, bottle_size_ml: size, bottle_type: newBottle.bottleType, status: "In collection", usage: newBottle.usage,
    }).select("*").single();
    if (bottleErr || !bd) { showToast(bottleErr?.message || "Bottle save failed"); return; }
    const { data: pur, error: purErr } = await supabase.from("perfume_purchases").insert({
      perfume_id: item.id, bottle_id: bd.id, user_id: userId, date: newBottle.date, ml: size, price, currency: "AED", shop_name: newBottle.shopName || "Unknown", shop_link: newBottle.shopLink || null,
    }).select("*").single();
    if (purErr || !pur) {
      await supabase.from("perfume_bottles").delete().eq("id", bd.id);
      showToast(purErr?.message || "Purchase save failed");
      return;
    }
    setPurchases(p => [{ id: pur.id, bottleId: pur.bottle_id, date: pur.date, ml: pur.ml, price: pur.price, shopName: pur.shop_name, shopLink: pur.shop_link }, ...p]);
    setItem(prev => prev ? { ...prev, bottles: [...prev.bottles, { id: bd.id, bottleSizeMl: bd.bottle_size_ml, bottleType: bd.bottle_type, status: bd.status, usage: bd.usage }] } : prev);
    setShowAddBottle(false);
    setNewBottle({ bottleType: "Full bottle", sizeMl: "100", usage: "Casual", price: "", date: nowDubai().slice(0,10), shopName: "", shopLink: "" });
    showToast("Bottle and purchase added");
  }

  async function copyToWishlist() {
    if (!item || !userId) return;
    const existing = catalog.find(p => p.status === "wishlist" && normalizeName(p.brand) === normalizeName(item.brand) && normalizeName(p.model) === normalizeName(item.model));
    if (existing) { showToast("Wishlist entry already exists"); router.push(`/dashboard/perfumes/${existing.id}`); return; }
    const { data, error } = await supabase.from("perfumes").insert({
      user_id: userId, brand: item.brand, model: item.model, status: "wishlist", image_url: item.imageUrl, rating_stars: item.ratingStars,
      notes_tags: item.notesTags, weather_tags: item.weatherTags, gender_scale: item.genderScale, longevity: item.longevity, sillage: item.sillage, value_rating: item.value,
      clone_similar: item.cloneSimilar, purchase_priority: item.purchasePriority ?? "Medium",
    }).select("*").single();
    if (error || !data) { showToast(error?.message || "Failed to copy"); return; }
    showToast("Added to wishlist ✓");
    router.push(`/dashboard/perfumes/${data.id}`);
  }

  const priceStats = useMemo(() => {
    if (!purchases.length) return null;
    const totalSpent = purchases.reduce((s, p) => s + p.price, 0);
    const totalMl = purchases.reduce((s, p) => s + (p.ml || 0), 0);
    const avgBottle = totalSpent / Math.max(purchases.length, 1);
    const price100ml = totalMl > 0 ? (totalSpent / totalMl) * 100 : 0;
    const bestDeal = purchases.length ? Math.min(...purchases.map(p => (p.price / Math.max(p.ml, 1)) * 100)) : 0;
    return { totalSpent, avgBottle, price100ml, bestDeal, purchaseCount: purchases.length };
  }, [purchases]);

  const similarItems = useMemo(() => {
    if (!item) return [] as (Perfume & { score: number })[];
    return catalog
      .filter(x => x.id !== item.id && x.status !== "archive")
      .map(x => {
        const noteOverlap = x.notesTags.filter(t => item.notesTags.includes(t)).length;
        const weatherOverlap = x.weatherTags.filter(t => item.weatherTags.includes(t)).length;
        const sameBrand = x.brand === item.brand ? 2 : 0;
        const score = noteOverlap * 3 + weatherOverlap * 1.5 + sameBrand;
        return { ...x, score };
      })
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);
  }, [catalog, item]);

  const sameBrandItems = useMemo(() => item ? catalog.filter(x => x.brand === item.brand) : [], [catalog, item]);

  const V = { bg: isDark ? "#0d0f14" : "#f9f8f5", card: isDark ? "#16191f" : "#ffffff", border: isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)", text: isDark ? "#f0ede8" : "#1a1a1a", muted: isDark ? "#9ba3b2" : "#6b7280", faint: isDark ? "#5c6375" : "#9ca3af", inputBg: isDark ? "#1e2130" : "#f9fafb", accent: "#F5A623" };

  if (loading) return <div style={{ minHeight: "60vh", display: "grid", placeItems: "center", background: V.bg, color: V.text }}>Loading…</div>;
  if (!item) return <div style={{ minHeight: "60vh", display: "grid", placeItems: "center", background: V.bg, color: V.text }}><Link href="/dashboard/perfumes">Back to Aromatica</Link></div>;

  const sectionStyle = { background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)", border: `1px solid ${V.border}`, borderRadius: 12, padding: "16px 18px", marginBottom: 14 };
  const labelStyle = { fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: V.faint, marginBottom: 6, display: "block" };
  const valueStyle = { fontSize: 14, fontWeight: 600, color: V.text };
  const inputStyle = { width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${V.border}`, background: V.inputBg, color: V.text, fontSize: 13, outline: "none", boxSizing: "border-box" as const };
  const btnStyle = { padding: "8px 16px", borderRadius: 10, border: `1px solid ${V.border}`, background: V.card, color: V.text, cursor: "pointer", fontSize: 13, fontWeight: 600 };
  const primaryBtnStyle = { ...btnStyle, background: V.accent, border: "none", color: "#fff", fontWeight: 700 };
  const dangerBtnStyle = { ...btnStyle, borderColor: "rgba(239,68,68,0.4)", color: "#ef4444" };

  return (
    <div style={{ background: V.bg, minHeight: "100vh", color: V.text, fontFamily: "system-ui,sans-serif" }}>
      <div style={{ position: "sticky", top: 0, zIndex: 20, background: isDark ? "rgba(13,15,20,0.9)" : "rgba(249,248,245,0.9)", backdropFilter: "blur(12px)", borderBottom: `1px solid ${V.border}`, padding: "12px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <Link href="/dashboard/perfumes" style={{ color: V.muted, textDecoration: "none", fontWeight: 700 }}>← Aromatica</Link>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={btnStyle} onClick={copyToClipboard}>Share</button>
          {item.status !== "wishlist" && <button style={btnStyle} onClick={copyToWishlist}>+ Wishlist</button>}
          <button style={isEdit ? primaryBtnStyle : btnStyle} onClick={() => setIsEdit(v => !v)}>{isEdit ? "✓ Done" : "Edit"}</button>
          {item.status !== "wishlist" && <button style={btnStyle} onClick={() => { setArchiveChoice("Emptied"); setArchiveResale(""); setArchiveNotesInput(item.archiveNotes ?? ""); setShowArchive(true); }}>Archive</button>}
          <button style={dangerBtnStyle} onClick={() => setShowRemove(true)}>Remove</button>
        </div>
      </div>

      <div style={{ maxWidth: 920, margin: "0 auto", padding: "28px 20px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 24, marginBottom: 28, alignItems: "start" }}>
          <div>
            {item.imageUrl ? <img src={item.imageUrl} alt="" style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 16, border: `1px solid ${V.border}` }} /> : <div style={{ width: "100%", aspectRatio: "1", borderRadius: 16, background: V.inputBg, display: "grid", placeItems: "center", fontSize: 64, border: `1px solid ${V.border}` }}>🌸</div>}
            <button style={{ ...btnStyle, width: "100%", marginTop: 10 }} onClick={() => { setPhotoInput(item.imageUrl); setPhotoMode("url"); setShowPhoto(true); }}>📷 Change photo</button>
          </div>
          <div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
              <button onClick={() => setBrandView(true)} style={{ background: V.inputBg, color: V.faint, border: "none", padding: "4px 10px", borderRadius: 999, fontSize: 10, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", cursor: "pointer" }}>{item.brand}</button>
              <span style={{ fontSize: 10, fontWeight: 700, padding: "4px 10px", borderRadius: 999, background: item.status === "wardrobe" ? "rgba(245,166,35,0.12)" : item.status === "wishlist" ? "rgba(99,102,241,0.1)" : "rgba(107,114,128,0.1)", color: item.status === "wardrobe" ? "#d97706" : item.status === "wishlist" ? "#6366f1" : "#6b7280" }}>{item.status}</span>
              {item.archiveReason && <span style={{ fontSize: 10, fontWeight: 700, padding: "4px 10px", borderRadius: 999, background: "rgba(107,114,128,0.1)", color: "#6b7280" }}>{item.archiveReason}</span>}
            </div>
            <h1 style={{ fontSize: 28, fontWeight: 800, margin: "0 0 12px" }}>{item.model}</h1>
            <div style={{ marginBottom: 16 }}><Stars value={item.ratingStars} size={20} /></div>
            {isEdit && <div style={{ marginBottom: 16 }}><span style={labelStyle}>Rating</span><div style={{ display: "flex", gap: 4 }}>{[1,2,3,4,5].map(s => <button key={s} onClick={() => update({ ratingStars: s })} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 24, color: s <= (item.ratingStars ?? 0) ? "#F5A623" : V.border }}>★</button>)}</div></div>}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(130px,1fr))", gap: 10 }}>
              {priceStats && priceStats.price100ml > 0 && <div style={{ background: V.inputBg, borderRadius: 10, padding: "10px 12px", border: `1px solid ${V.border}` }}><span style={labelStyle}>Per 100ml</span><span style={{ fontSize: 13, fontWeight: 700, color: "#F5A623" }}>AED {priceStats.price100ml.toFixed(0)}</span></div>}
              {priceStats && priceStats.totalSpent > 0 && <div style={{ background: V.inputBg, borderRadius: 10, padding: "10px 12px", border: `1px solid ${V.border}` }}><span style={labelStyle}>Total spent</span><span style={{ fontSize: 13, fontWeight: 700 }}>{fmtMoney(priceStats.totalSpent)}</span></div>}
              {priceStats && priceStats.avgBottle > 0 && <div style={{ background: V.inputBg, borderRadius: 10, padding: "10px 12px", border: `1px solid ${V.border}` }}><span style={labelStyle}>Avg bottle</span><span style={{ fontSize: 13, fontWeight: 700 }}>{fmtMoney(priceStats.avgBottle)}</span></div>}
              {priceStats && priceStats.bestDeal > 0 && <div style={{ background: V.inputBg, borderRadius: 10, padding: "10px 12px", border: `1px solid ${V.border}` }}><span style={labelStyle}>Best deal</span><span style={{ fontSize: 13, fontWeight: 700 }}>AED {priceStats.bestDeal.toFixed(0)}/100ml</span></div>}
              {[ ["Longevity", item.longevity], ["Projection", item.sillage], ["Gender", genderLabel(item.genderScale)], ["Value", item.value] ].map(([k,v]) => <div key={String(k)} style={{ background: V.inputBg, borderRadius: 10, padding: "10px 12px", border: `1px solid ${V.border}` }}><span style={labelStyle}>{k}</span><span style={{ fontSize: 13, fontWeight: 700 }}>{v || "—"}</span></div>)}
            </div>
          </div>
        </div>

        {item.status === "wishlist" && <div style={sectionStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={labelStyle}>Wishlist priority</span>
            <span style={{ fontSize: 12, color: V.muted }}>Priority {item.purchasePriority || "Medium"}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 }}>
            <label><span style={labelStyle}>Priority</span><select style={inputStyle} value={item.purchasePriority || "Medium"} onChange={e => update({ purchasePriority: e.target.value })}><option>Low</option><option>Medium</option><option>High</option><option>Must buy</option></select></label>
          </div>
        </div>}

        <div style={sectionStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={labelStyle}>Wear log</span>
            <button style={{ ...btnStyle, padding: "4px 10px", fontSize: 11 }} onClick={() => setShowWearModal(true)}>+ Log wear</button>
          </div>
          {wearLogs.length === 0 ? <div style={{ fontSize: 13, color: V.faint }}>No wear logs yet.</div> : <div style={{ display: "grid", gap: 8 }}>{wearLogs.slice(0, 6).map(w => <div key={w.id} style={{ display: "grid", gridTemplateColumns: "110px 1fr auto", gap: 10, alignItems: "center", padding: "10px 12px", border: `1px solid ${V.border}`, borderRadius: 10, background: V.inputBg }}><div style={{ fontSize: 12, color: V.muted }}>{w.wornOn}</div><div style={{ fontSize: 13 }}><strong>{w.occasion || "General wear"}</strong>{w.performance ? ` · ${w.performance}` : ""}{w.weatherTag ? ` · ${w.weatherTag}` : ""}</div><div style={{ fontSize: 12, color: w.compliment ? "#16a34a" : V.muted }}>{w.sprays || 0} sprays{w.compliment ? " · compliment" : ""}</div></div>)}</div>}
        </div>

        <div style={sectionStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={labelStyle}>Similar to what you already own</span>
            {item.cloneSimilar && <span style={{ fontSize: 12, color: V.muted }}>Manual clone/similar note: {item.cloneSimilar}</span>}
          </div>
          {similarItems.length === 0 ? <div style={{ fontSize: 13, color: V.faint }}>No obvious overlap found yet.</div> : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 }}>{similarItems.map(s => <button key={s.id} onClick={() => router.push(`/dashboard/perfumes/${s.id}`)} style={{ textAlign: "left", border: `1px solid ${V.border}`, background: V.inputBg, borderRadius: 12, padding: 12, cursor: "pointer" }}><div style={{ fontSize: 12, color: V.faint, textTransform: "uppercase", fontWeight: 800 }}>{s.brand}</div><div style={{ fontSize: 14, fontWeight: 800 }}>{s.model}</div><div style={{ fontSize: 12, color: V.muted }}>Similarity score {s.score.toFixed(1)}</div></button>)}</div>}
        </div>

        <div style={sectionStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={labelStyle}>Notes tags</span>
            {isEdit && <button style={{ ...btnStyle, padding: "4px 10px", fontSize: 11 }} onClick={() => setNoteManager(true)}>Manage</button>}
          </div>
          {item.notesTags.length === 0 ? <span style={{ fontSize: 13, color: V.faint }}>No tags set</span> : <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{item.notesTags.map(t => <Tag key={t} label={t} />)}</div>}
        </div>

        <div style={sectionStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={labelStyle}>Weather</span>
            {isEdit && <button style={{ ...btnStyle, padding: "4px 10px", fontSize: 11 }} onClick={() => setWeatherManager(true)}>Manage</button>}
          </div>
          {item.weatherTags.length === 0 ? <span style={{ fontSize: 13, color: V.faint }}>Not set</span> : <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{item.weatherTags.map(w => <Tag key={w} label={w} />)}</div>}
        </div>

        {item.status === "archive" && (
          <div style={sectionStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={labelStyle}>Archive intelligence</span>
              <button style={{ ...btnStyle, padding: "4px 10px", fontSize: 11 }} onClick={() => setBrandView(true)}>Brand page</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10 }}>
              <div style={{ background: V.inputBg, border: `1px solid ${V.border}`, borderRadius: 10, padding: 12 }}><div style={labelStyle}>Archived on</div><div style={valueStyle}>{item.archivedAt ? item.archivedAt.slice(0, 10) : "—"}</div></div>
              <div style={{ background: V.inputBg, border: `1px solid ${V.border}`, borderRadius: 10, padding: 12 }}><div style={labelStyle}>Resale</div><div style={valueStyle}>{item.resalePriceAed ? fmtMoney(item.resalePriceAed) : "—"}</div></div>
              <div style={{ background: V.inputBg, border: `1px solid ${V.border}`, borderRadius: 10, padding: 12 }}><div style={labelStyle}>Profit / loss</div><div style={valueStyle}>{priceStats?.totalSpent && item.resalePriceAed !== null && item.resalePriceAed !== undefined ? fmtMoney((item.resalePriceAed || 0) - priceStats.totalSpent) : "—"}</div></div>
            </div>
            {item.archiveNotes && <div style={{ marginTop: 12, fontSize: 13, color: V.muted }}>{item.archiveNotes}</div>}
          </div>
        )}

        <div style={sectionStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={labelStyle}>Bottles & purchases</span>
            <button onClick={() => setShowAddBottle(true)} style={{ ...btnStyle, fontSize: 12, padding: "5px 12px" }}>+ Add bottle</button>
          </div>
          {item.bottles.length === 0 ? <span style={{ fontSize: 13, color: V.faint }}>No purchases recorded.</span> : <div style={{ display: "grid", gap: 8 }}>{item.bottles.map(b => {
            const pur = purchases.find(p => p.bottleId === b.id);
            return <div key={b.id} style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto auto", gap: 10, alignItems: "center", padding: "10px 12px", border: `1px solid ${V.border}`, borderRadius: 10, background: V.inputBg }}>
              <div><span style={{ fontWeight: 700 }}>{b.bottleType}</span> <span style={{ color: V.muted }}>{b.bottleSizeMl}ml</span></div>
              <div style={{ fontWeight: 700 }}>{pur && pur.price > 0 ? fmtMoney(pur.price) : <span style={{ color: V.faint }}>—</span>}</div>
              <select style={inputStyle} value={b.status} onChange={e => updateBottle(b.id, { status: e.target.value as BottleStatus })}><option>In collection</option><option>Emptied</option><option>Sold</option><option>Gifted</option></select>
              <select style={inputStyle} value={b.usage} onChange={e => updateBottle(b.id, { usage: e.target.value })}><option>Casual</option><option>Office</option><option>Party</option><option>Date night</option><option>Gym</option><option>Travel</option></select>
              <div style={{ fontSize: 12, color: V.muted }}>{pur?.date || "—"}</div>
            </div>;
          })}</div>}
        </div>
      </div>

      {noteManager && <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 100, display: "grid", placeItems: "center", padding: 16 }}><div style={{ background: V.card, border: `1px solid ${V.border}`, borderRadius: 16, padding: 22, width: "min(520px,100%)" }}><div style={{ fontSize: 16, fontWeight: 800, marginBottom: 8 }}>Notes tags</div><div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>{globalNotes.map(t => <button key={t} onClick={() => update({ notesTags: item.notesTags.includes(t) ? item.notesTags.filter(x => x !== t) : [...item.notesTags, t] })} style={{ padding: "6px 14px", borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: "pointer", border: "none", background: item.notesTags.includes(t) ? V.accent : V.inputBg, color: item.notesTags.includes(t) ? "#fff" : V.text }}>{t}</button>)}</div><div style={{ display: "flex", gap: 8 }}><input style={{ ...inputStyle, flex: 1 }} value={noteInput} onChange={e => setNoteInput(e.target.value)} placeholder="New tag…" /><button style={primaryBtnStyle} onClick={() => { const v = noteInput.trim(); if (v && !globalNotes.includes(v)) { setGlobalNotes(p => [...p, v].sort()); setNoteInput(""); showToast("Tag added"); } }}>Add</button></div><div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}><button style={primaryBtnStyle} onClick={() => setNoteManager(false)}>Done</button></div></div></div>}
      {weatherManager && <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 100, display: "grid", placeItems: "center", padding: 16 }}><div style={{ background: V.card, border: `1px solid ${V.border}`, borderRadius: 16, padding: 22, width: "min(400px,100%)" }}><div style={{ fontSize: 16, fontWeight: 800, marginBottom: 14 }}>Weather</div><div style={{ display: "flex", gap: 10 }}>{(["Cold","Neutral","Hot"] as const).map(w => <button key={w} onClick={() => update({ weatherTags: item.weatherTags.includes(w) ? item.weatherTags.filter(x => x !== w) : [...item.weatherTags, w] as ("Cold"|"Neutral"|"Hot")[] })} style={{ flex: 1, padding: "10px", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", border: "none", background: item.weatherTags.includes(w) ? V.accent : V.inputBg, color: item.weatherTags.includes(w) ? "#fff" : V.text }}>{w}</button>)}</div><div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}><button style={primaryBtnStyle} onClick={() => setWeatherManager(false)}>Done</button></div></div></div>}
      {showArchive && <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 100, display: "grid", placeItems: "center", padding: 16 }}><div style={{ background: V.card, border: `1px solid ${V.border}`, borderRadius: 16, padding: 22, width: "min(420px,100%)" }}><div style={{ fontSize: 16, fontWeight: 800, marginBottom: 6 }}>Move to archive</div><div style={{ fontSize: 13, color: V.muted, marginBottom: 14 }}>What happened to it?</div><div style={{ display: "flex", gap: 8 }}>{(["Sold","Emptied","Gifted"] as const).map(r => <button key={r} onClick={() => setArchiveChoice(r)} style={{ flex: 1, padding: "10px", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", border: `1px solid ${V.border}`, background: archiveChoice === r ? V.accent : V.inputBg, color: archiveChoice === r ? "#fff" : V.text }}>{r}</button>)}</div><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}><label><span style={labelStyle}>Resale price (AED)</span><input style={inputStyle} value={archiveResale} onChange={e => setArchiveResale(e.target.value)} /></label><label><span style={labelStyle}>Archive notes</span><input style={inputStyle} value={archiveNotesInput} onChange={e => setArchiveNotesInput(e.target.value)} /></label></div><div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}><button style={btnStyle} onClick={() => setShowArchive(false)}>Cancel</button><button style={primaryBtnStyle} onClick={doArchive}>Archive</button></div></div></div>}
      {showRemove && <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 100, display: "grid", placeItems: "center", padding: 16 }}><div style={{ background: V.card, border: `1px solid ${V.border}`, borderRadius: 16, padding: 22, width: "min(420px,100%)" }}><div style={{ fontSize: 16, fontWeight: 800, marginBottom: 6 }}>Remove {item.brand} {item.model}?</div><div style={{ fontSize: 13, color: V.muted, marginBottom: 14 }}>This permanently deletes the perfume and all bottle and purchase records.</div><div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}><button style={btnStyle} onClick={() => setShowRemove(false)}>Cancel</button><button style={dangerBtnStyle} onClick={doRemove}>Remove</button></div></div></div>}
      {showPhoto && <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 100, display: "grid", placeItems: "center", padding: 16 }}><div style={{ background: V.card, border: `1px solid ${V.border}`, borderRadius: 16, padding: 22, width: "min(480px,100%)" }}><div style={{ fontSize: 16, fontWeight: 800, marginBottom: 14 }}>Change photo</div><div style={{ display: "flex", gap: 0, marginBottom: 14, borderRadius: 10, overflow: "hidden", border: `1px solid ${V.border}` }}>{(["upload","url"] as const).map(m => <button key={m} onClick={() => setPhotoMode(m)} style={{ flex: 1, padding: "9px", fontSize: 13, fontWeight: 700, cursor: "pointer", border: "none", background: photoMode === m ? V.accent : V.inputBg, color: photoMode === m ? "#fff" : V.muted }}>{m === "upload" ? "📱 Upload" : "🔗 URL"}</button>)}</div>{photoMode === "upload" ? <div><input type="file" accept="image/*" style={{ fontSize: 13, color: V.muted, width: "100%" }} onChange={e => { const f = e.target.files?.[0]; if (f) uploadPhoto(f); }} /><div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}><button style={btnStyle} onClick={() => setShowPhoto(false)}>Cancel</button></div></div> : <div><input style={inputStyle} value={photoInput} onChange={e => setPhotoInput(e.target.value)} placeholder="https://…" /><div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}><button style={btnStyle} onClick={() => setShowPhoto(false)}>Cancel</button><button style={primaryBtnStyle} onClick={async () => { await update({ imageUrl: photoInput.trim() }); setShowPhoto(false); showToast("Photo updated"); }}>Apply</button></div></div>}</div></div>}
      {showAddBottle && <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 100, display: "grid", placeItems: "center", padding: 16 }}><div style={{ background: V.card, border: `1px solid ${V.border}`, borderRadius: 16, width: "min(620px,100%)" }}><div style={{ padding: "18px 20px", borderBottom: `1px solid ${V.border}` }}><div style={{ fontSize: 18, fontWeight: 800 }}>Add bottle</div><div style={{ fontSize: 12, color: V.muted }}>One purchase creates one bottle. No more drifting duplicate truth nonsense.</div></div><div style={{ padding: 20, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}><label><span style={labelStyle}>Bottle type</span><select style={inputStyle} value={newBottle.bottleType} onChange={e => setNewBottle(p => ({ ...p, bottleType: e.target.value as BottleType }))}><option>Full bottle</option><option>Decant</option><option>Sample</option><option>Tester</option></select></label><label><span style={labelStyle}>Size (ml)</span><input style={inputStyle} value={newBottle.sizeMl} onChange={e => setNewBottle(p => ({ ...p, sizeMl: e.target.value }))} /></label><label><span style={labelStyle}>Bottle price (AED)</span><input style={inputStyle} type="number" value={newBottle.price} onChange={e => setNewBottle(p => ({ ...p, price: e.target.value }))} placeholder="0" /></label><label><span style={labelStyle}>Usage place</span><select style={inputStyle} value={newBottle.usage} onChange={e => setNewBottle(p => ({ ...p, usage: e.target.value }))}><option>Casual</option><option>Office</option><option>Party</option><option>Date night</option><option>Gym</option><option>Travel</option></select></label><label><span style={labelStyle}>Purchase date</span><input style={inputStyle} type="date" value={newBottle.date} onChange={e => setNewBottle(p => ({ ...p, date: e.target.value }))} /></label><label><span style={labelStyle}>Shop name</span><input style={inputStyle} value={newBottle.shopName} onChange={e => setNewBottle(p => ({ ...p, shopName: e.target.value }))} placeholder="Optional" /></label><label><span style={labelStyle}>Currency</span><select style={inputStyle} value="AED" disabled aria-label="Currency"><option>AED</option></select></label><label style={{ gridColumn: "1/-1" }}><span style={labelStyle}>Shop link</span><input style={inputStyle} value={newBottle.shopLink} onChange={e => setNewBottle(p => ({ ...p, shopLink: e.target.value }))} placeholder="https://…" /></label></div><div style={{ padding: "0 20px 20px", display: "flex", justifyContent: "flex-end", gap: 8 }}><button style={btnStyle} onClick={() => setShowAddBottle(false)}>Cancel</button><button style={primaryBtnStyle} onClick={addBottle}>Add</button></div></div></div>}
      {showWearModal && <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 100, display: "grid", placeItems: "center", padding: 16 }}><div style={{ background: V.card, border: `1px solid ${V.border}`, borderRadius: 18, padding: 20, width: "min(520px,100%)" }}><div style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>Log a wear</div><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}><label><span style={labelStyle}>Date</span><input style={inputStyle} type="date" value={wearForm.wornOn} onChange={e => setWearForm(f => ({ ...f, wornOn: e.target.value }))} /></label><label><span style={labelStyle}>Occasion</span><input style={inputStyle} value={wearForm.occasion} onChange={e => setWearForm(f => ({ ...f, occasion: e.target.value }))} /></label><label><span style={labelStyle}>Sprays</span><input style={inputStyle} value={wearForm.sprays} onChange={e => setWearForm(f => ({ ...f, sprays: e.target.value }))} /></label><label><span style={labelStyle}>Weather</span><input style={inputStyle} value={wearForm.weatherTag} onChange={e => setWearForm(f => ({ ...f, weatherTag: e.target.value }))} placeholder="Hot / Neutral / Cold" /></label><label style={{ gridColumn: "1/-1" }}><span style={labelStyle}>Performance</span><input style={inputStyle} value={wearForm.performance} onChange={e => setWearForm(f => ({ ...f, performance: e.target.value }))} placeholder="Great projection, 7h, etc." /></label><label style={{ display: "flex", alignItems: "center", gap: 8, gridColumn: "1/-1", fontSize: 13 }}><input type="checkbox" checked={wearForm.compliment} onChange={e => setWearForm(f => ({ ...f, compliment: e.target.checked }))} /> Got a compliment</label></div><div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}><button style={btnStyle} onClick={() => setShowWearModal(false)}>Cancel</button><button style={primaryBtnStyle} onClick={async () => { if (!userId || !item) return; const { data, error } = await supabase.from("perfume_wear_logs").insert({ user_id: userId, perfume_id: item.id, worn_on: wearForm.wornOn, occasion: wearForm.occasion || null, sprays: safeNum(wearForm.sprays, 0), weather_tag: wearForm.weatherTag || null, compliment: wearForm.compliment, performance: wearForm.performance || null }).select("*").single(); if (error || !data) { showToast(error?.message || "Wear log failed"); return; } setWearLogs(prev => [{ id: data.id, wornOn: data.worn_on, occasion: data.occasion ?? "", sprays: data.sprays ?? 0, weatherTag: data.weather_tag ?? "", compliment: !!data.compliment, performance: data.performance ?? "" }, ...prev]); setShowWearModal(false); showToast("Wear logged"); }}>Save</button></div></div></div>}
      {brandView && <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 120, display: "grid", placeItems: "center", padding: 16 }} onClick={() => setBrandView(false)}><div onClick={e => e.stopPropagation()} style={{ width: "min(720px,100%)", background: V.card, border: `1px solid ${V.border}`, borderRadius: 18, padding: 20 }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}><div><div style={{ fontSize: 20, fontWeight: 800 }}>{item.brand}</div><div style={{ fontSize: 12, color: V.muted }}>Brand page with your lineup, spend, and favorites.</div></div><button style={btnStyle} onClick={() => setBrandView(false)}>Close</button></div><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 }}>{sameBrandItems.map(s => <button key={s.id} onClick={() => router.push(`/dashboard/perfumes/${s.id}`)} style={{ textAlign: "left", border: `1px solid ${V.border}`, background: V.inputBg, borderRadius: 12, padding: 12, cursor: "pointer" }}><div style={{ fontSize: 14, fontWeight: 800 }}>{s.model}</div><div style={{ fontSize: 12, color: V.muted }}>{s.status} · {s.purchasePriority || "Medium"}</div></button>)}</div></div></div>}
      {toast && <div style={{ position: "fixed", bottom: 20, right: 16, background: isDark ? "#1a3a2a" : "#f0fdf4", color: "#16a34a", border: "1px solid rgba(22,163,74,0.3)", padding: "12px 18px", borderRadius: 12, fontSize: 13, fontWeight: 700, zIndex: 200 }}>{toast}</div>}
    </div>
  );
}
