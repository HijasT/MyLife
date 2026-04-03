"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { saveToCache, loadFromCache, markSynced } from "@/hooks/useSyncStatus";

type TabKey = "wardrobe" | "wishlist" | "archive" | "purchases";
type PerfumeStatus = "wardrobe" | "wishlist" | "archive";
type BottleType = "Full bottle" | "Decant" | "Sample" | "Tester";
type GenderScale = 0 | 1 | 2 | 3 | 4;
type ToastKind = "success" | "error" | "info";

type Bottle = { id: string; bottleSizeMl: number; bottleType: BottleType; status: string; usage: string };
type Purchase = { id: string; perfumeId: string; bottleId: string; date: string; ml: number; price: number; shopName: string; shopLink?: string };
type WearLog = { id: string; perfumeId: string; wornOn: string; compliment: boolean; sprays: number; weatherTag: string; occasion: string; performance: string };
type Perfume = {
  id: string; status: PerfumeStatus; brand: string; model: string; imageUrl: string;
  ratingStars: number | null; notesTags: string[]; weatherTags: string[];
  genderScale: GenderScale; longevity: string; sillage: string;
  value: string; cloneSimilar: string; notesText: string;
  purchasePriority?: string; targetPriceAed?: number | null; preferredShop?: string;
  archivedAt?: string | null; resalePriceAed?: number | null; archiveNotes?: string;
  bottles: Bottle[]; archiveReason?: string;
};
type Toast = { id: string; kind: ToastKind; message: string };
type AddForm = {
  status: PerfumeStatus; brand: string; model: string; imageDataUrl: string;
  rating: number; bottleType: BottleType; sizeMl: string;
  price: string; shop: string; shopLink: string; date: string;
  priority: string;
};

function uid() { return `id-${Math.random().toString(16).slice(2)}-${Date.now()}`; }
function safeNum(x: unknown, fb = 0) { const n = typeof x === "number" ? x : Number(x); return Number.isFinite(n) ? n : fb; }
function nowIso() { return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" }); }
function monthKey(d: string) { return d.slice(0, 7); }
function fmtMoney(a: number) { return `AED ${a.toFixed(2)}`; }
function normalizeName(v: string) { return v.trim().toLowerCase().replace(/\s+/g, " "); }
function monthShort(iso: string) { const [y,m] = iso.split("-"); return new Date(Number(y), Number(m)-1, 1).toLocaleString("en", { month:"short" }); }
function useDarkMode() {
  const get = () => typeof document !== "undefined" && document.documentElement.classList.contains("dark");
  const [isDark, setIsDark] = useState(get);
  useEffect(() => {
    if (typeof document === "undefined") return;
    const obs = new MutationObserver(() => setIsDark(get()));
    obs.observe(document.documentElement, { attributes:true, attributeFilter:["class"] });
    return () => obs.disconnect();
  }, []);
  return isDark;
}

// ── Bottle-based helpers (the source of truth) ─────────────────────────────
const ACTIVE_STATUSES  = new Set(["In collection", "in collection", "active", "Active"]);
const ARCHIVE_STATUSES = new Set(["Emptied", "emptied", "Sold", "sold", "Gifted", "gifted", "Lost", "lost", "archive", "Archive", "archived"]);

function hasActiveBottle(p: Perfume): boolean {
  if (p.bottles.length === 0) return false;
  // Active = explicitly active OR not explicitly archived (default assumption)
  return p.bottles.some(b =>
    ACTIVE_STATUSES.has(b.status) ||
    (!ARCHIVE_STATUSES.has(b.status) && b.status !== "")
  );
}
function hasArchivedBottle(p: Perfume): boolean {
  return p.bottles.some(b => ARCHIVE_STATUSES.has(b.status));
}
function isWardrobeItem(p: Perfume): boolean {
  if (p.status === "wishlist") return false;
  return hasActiveBottle(p);
}
function isArchiveItem(p: Perfume): boolean {
  if (p.status === "wishlist") return false;
  // Only show in archive if ALL bottles are archived
  // (mixed = show in wardrobe only, with a badge)
  return p.bottles.length > 0 && !hasActiveBottle(p) && hasArchivedBottle(p);
}
function isWishlistItem(p: Perfume): boolean {
  return p.status === "wishlist" && !hasActiveBottle(p);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dbToItem(row: any): Perfume {
  return {
    id: row.id, status: row.status ?? "wardrobe", brand: row.brand ?? "", model: row.model ?? "",
    imageUrl: row.image_url || "", ratingStars: row.rating_stars ?? null,
    notesTags: row.notes_tags ?? [], weatherTags: row.weather_tags ?? [],
    genderScale: (row.gender_scale ?? 2) as GenderScale,
    longevity: row.longevity ?? "", sillage: row.sillage ?? "",
    value: row.value_rating ?? "Neutral", cloneSimilar: row.clone_similar ?? "",
    notesText: row.notes_text ?? "",
    purchasePriority: row.purchase_priority ?? "Medium",
    targetPriceAed: row.target_price_aed ?? null,
    preferredShop: row.preferred_shop ?? "",
    archivedAt: row.archived_at ?? null,
    resalePriceAed: row.resale_price_aed ?? null,
    archiveNotes: row.archive_notes ?? "",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bottles: (row.perfume_bottles ?? []).map((b: any): Bottle => ({
      id: b.id, bottleSizeMl: b.bottle_size_ml ?? 100,
      bottleType: b.bottle_type ?? "Full bottle",
      status: b.status ?? "In collection",
      usage: b.usage ?? "",
    })),
    archiveReason: row.archive_reason ?? undefined,
  };
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dbToPurchase(p: any): Purchase {
  return { id: p.id, perfumeId: p.perfume_id, bottleId: p.bottle_id ?? "none", date: p.date, ml: p.ml ?? 0, price: p.price ?? 0, shopName: p.shop_name ?? "Unknown", shopLink: p.shop_link ?? undefined };
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dbToWear(p: any): WearLog {
  return { id: p.id, perfumeId: p.perfume_id, wornOn: p.worn_on, compliment: !!p.compliment, sprays: p.sprays ?? 0, weatherTag: p.weather_tag ?? "", occasion: p.occasion ?? "", performance: p.performance ?? "" };
}

function Stars({ value, size = 14 }: { value: number | null; size?: number }) {
  if (!value) return <span style={{ fontSize: 11, color: "#9ca3af" }}>–</span>;
  return (
    <span style={{ display: "inline-flex", gap: 1 }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <span key={i} style={{ color: i < value ? "#F5A623" : "#e5e7eb", fontSize: size }}>★</span>
      ))}
      <span style={{ fontSize: 11, color: "#9ca3af", marginLeft: 3 }}>{value.toFixed(1)}</span>
    </span>
  );
}

export default function PerfumesPage() {
  const supabase = createClient();
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Perfume[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [activeTab, setActiveTab] = useState<TabKey>("wardrobe");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("brand_asc");
  const [showAdd, setShowAdd] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [wearLogs, setWearLogs] = useState<WearLog[]>([]);
  const [brandFocus, setBrandFocus] = useState<string | null>(null);
  const [dubaiTemp, setDubaiTemp] = useState<number | null>(null);
  const [af, setAf] = useState<AddForm>({
    status: "wardrobe", brand: "", model: "", imageDataUrl: "", rating: 4,
    bottleType: "Full bottle", sizeMl: "100",
    price: "", shop: "Unknown", shopLink: "", date: nowIso(),
    priority: "Medium",
  });

  const isDark = useDarkMode();

  useEffect(() => {
    async function load() {
      const cached = loadFromCache<Perfume[]>("perfumes");
      const cachedPur = loadFromCache<Purchase[]>("purchases");
      if (cached) { setItems(cached); setLoading(false); }
      if (cachedPur) setPurchases(cachedPur);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      setUserId(user.id);

      const [pr, pur, wear] = await Promise.all([
        supabase.from("perfumes").select("*, perfume_bottles(*)").eq("user_id", user.id).order("brand"),
        supabase.from("perfume_purchases").select("*").eq("user_id", user.id).order("date", { ascending: false }),
        supabase.from("perfume_wear_logs").select("*").eq("user_id", user.id).order("worn_on", { ascending: false }),
      ]);
      if (pr.error) toast(pr.error.message, "error");
      if (pur.error) toast(pur.error.message, "error");
      const loaded = (pr.data ?? []).map(dbToItem);
      const loadedPur = (pur.data ?? []).map(dbToPurchase);
      const loadedWear = (wear.data ?? []).map(dbToWear);
      setItems(loaded);
      setPurchases(loadedPur);
      setWearLogs(loadedWear);
      saveToCache("perfumes", loaded);
      saveToCache("purchases", loadedPur);
      markSynced();
      setLoading(false);
      // Dubai weather for seasonal suggestions
      try {
        const r = await fetch("https://api.open-meteo.com/v1/forecast?latitude=25.2048&longitude=55.2708&current=temperature_2m&timezone=Asia%2FDubai");
        const data = await r.json();
        const temp = data?.current?.temperature_2m ?? null;
        if (temp !== null) setDubaiTemp(temp);
      } catch { /* skip */ }
    }
    load();
  }, []);

  // ── Counts based on bottle state ──────────────────────────────────────────
  const counts = useMemo(() => ({
    wardrobe: items.filter(isWardrobeItem).length,
    wishlist:  items.filter(isWishlistItem).length,
    archive:   items.filter(isArchiveItem).length,
  }), [items]);

  const wearByPerfume = useMemo(() => {
    const map = new Map<string, WearLog[]>();
    for (const w of wearLogs) {
      if (!map.has(w.perfumeId)) map.set(w.perfumeId, []);
      map.get(w.perfumeId)!.push(w);
    }
    return map;
  }, [wearLogs]);

  const topUsed = useMemo(() => {
    return items
      .filter(isWardrobeItem)
      .map(p => {
        const uniqueDays = new Set((wearByPerfume.get(p.id) ?? []).map(w => w.wornOn)).size;
        return { perfume: p, days: uniqueDays };
      })
      .filter(x => x.days > 0)
      .sort((a, b) => b.days - a.days || (b.perfume.ratingStars ?? 0) - (a.perfume.ratingStars ?? 0))
      .slice(0, 3);
  }, [items, wearByPerfume]);

  // ── Stats based on bottle state ───────────────────────────────────────────
  const tabStats = useMemo(() => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const cutoff = thirtyDaysAgo.toISOString().slice(0, 10);

    const calcFor = (filterFn: (p: Perfume) => boolean) => {
      const list = items.filter(filterFn);
      const ids = new Set(list.map(x => x.id));
      const paid = purchases.filter(p => ids.has(p.perfumeId) && p.price > 0);
      const total = paid.reduce((s, p) => s + safeNum(p.price), 0);
      const avg = paid.length ? total / paid.length : 0;
      return { count: list.length, total, avg };
    };

    const newIds = new Set(
      purchases.filter(p => p.date >= cutoff && p.price > 0).map(p => p.perfumeId)
    );

    const wardrobeIds = new Set(items.filter(isWardrobeItem).map(x => x.id));
    const wardrobeValue = purchases
      .filter(p => wardrobeIds.has(p.perfumeId))
      .reduce((s, p) => s + safeNum(p.price), 0);

    return {
      wardrobe: calcFor(isWardrobeItem),
      wishlist:  calcFor(isWishlistItem),
      archive:   calcFor(isArchiveItem),
      newIds,
      wardrobeValue,
    };
  }, [items, purchases]);

  // ── Tab items — bottle-based filtering ────────────────────────────────────
  const tabItems = useMemo(() => {
    let list: Perfume[];
    if (activeTab === "wardrobe")  list = items.filter(isWardrobeItem);
    else if (activeTab === "wishlist") list = items.filter(isWishlistItem);
    else if (activeTab === "archive")  list = items.filter(isArchiveItem);
    else return []; // purchases tab handled separately

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(x => `${x.brand} ${x.model}`.toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => {
      if (sortBy === "brand_asc")   return `${a.brand} ${a.model}`.localeCompare(`${b.brand} ${b.model}`);
      if (sortBy === "brand_desc")  return `${b.brand} ${b.model}`.localeCompare(`${a.brand} ${a.model}`);
      if (sortBy === "rating_desc") return (b.ratingStars ?? 0) - (a.ratingStars ?? 0);
      if (sortBy === "rating_asc")  return (a.ratingStars ?? 0) - (b.ratingStars ?? 0);
      return 0;
    });
  }, [items, activeTab, search, sortBy]);

  // ── Weather suggestions ───────────────────────────────────────────────────
  const weatherSuggestions = useMemo(() => {
    if (dubaiTemp === null) return [];
    const tag = dubaiTemp < 22 ? "Cold" : dubaiTemp > 32 ? "Hot" : "Moderate";
    return items
      .filter(isWardrobeItem)
      .filter(p => p.weatherTags.includes(tag) || p.weatherTags.includes("All Season"))
      .slice(0, 4);
  }, [items, dubaiTemp]);

  const purchaseHistory = useMemo(() => [...purchases].sort((a, b) => b.date.localeCompare(a.date)), [purchases]);

  const last12Months = useMemo(() => {
    const today = new Date();
    const map = new Map<string, number>();
    for (const p of purchases) { if (safeNum(p.price) <= 0) continue; map.set(monthKey(p.date), (map.get(monthKey(p.date)) ?? 0) + 1); }
    return Array.from({ length: 12 }).map((_, i) => {
      const dt = new Date(today.getFullYear(), today.getMonth() - 11 + i, 1);
      const mk = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
      return { month: monthShort(mk), count: map.get(mk) ?? 0 };
    });
  }, [purchases]);

  function toast(message: string, kind: ToastKind = "success") {
    const id = uid();
    setToasts(p => [...p, { id, kind, message }]);
    setTimeout(() => setToasts(p => p.filter(x => x.id !== id)), 2500);
  }

  async function doAdd() {
    if (!userId) return;
    const brand = af.brand.trim();
    const model = af.model.trim();
    if (!brand || !model) { toast("Brand and model required", "error"); return; }
    const dupe = items.find(x => normalizeName(x.brand) === normalizeName(brand) && normalizeName(x.model) === normalizeName(model));
    if (dupe) { toast("This perfume already exists in Aromatica", "error"); router.push(`/dashboard/perfumes/${dupe.id}`); return; }
    const size = safeNum(af.sizeMl, 100);
    const price = safeNum(af.price, 0);
    if (af.status === "wardrobe" && price <= 0) { toast("Enter bottle price", "error"); return; }
    const { data: pd, error } = await supabase.from("perfumes").insert({
      user_id: userId, brand, model, status: af.status,
      image_url: af.imageDataUrl || "", rating_stars: af.rating,
      notes_tags: [], weather_tags: [], gender_scale: 2,
      longevity: "Unknown", sillage: "Unknown", value_rating: "Neutral",
      purchase_priority: af.status === "wishlist" ? af.priority : null,
    }).select("*").single();
    if (error || !pd) { toast(error?.message || "Failed to save", "error"); return; }
    if (af.status === "wardrobe") {
      const { data: bd, error: bErr } = await supabase.from("perfume_bottles").insert({
        perfume_id: pd.id, user_id: userId, bottle_size_ml: size,
        bottle_type: af.bottleType, status: "In collection", usage: "Casual",
      }).select("*").single();
      if (bErr || !bd) { toast(bErr?.message || "Bottle save failed", "error"); return; }
      const { error: pErr } = await supabase.from("perfume_purchases").insert({
        perfume_id: pd.id, bottle_id: bd.id, user_id: userId,
        date: af.date || nowIso(), ml: size, price, currency: "AED",
        shop_name: af.shop || "Unknown", shop_link: af.shopLink || null,
      });
      if (pErr) { toast(pErr.message, "error"); return; }
    }
    setShowAdd(false);
    router.push(`/dashboard/perfumes/${pd.id}`);
  }

  const V = {
    bg:     isDark ? "#0d0f14"  : "#f9f8f5",
    card:   isDark ? "#16191f"  : "#ffffff",
    border: isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)",
    text:   isDark ? "#f0ede8"  : "#1a1a1a",
    muted:  isDark ? "#9ba3b2"  : "#6b7280",
    faint:  isDark ? "#5c6375"  : "#9ca3af",
    input:  isDark ? "#1e2130"  : "#f9fafb",
    accent: "#F5A623",
  };

  const btn   = { padding:"8px 14px", borderRadius:10, border:`1px solid ${V.border}`, background:V.card, color:V.text, cursor:"pointer", fontSize:13, fontWeight:600 } as const;
  const btnPrimary = { ...btn, background:V.accent, border:"none", color:"#fff", fontWeight:700 } as const;
  const inputSt = { width:"100%", padding:"9px 12px", borderRadius:8, border:`1px solid ${V.border}`, background:V.input, color:V.text, fontSize:13, outline:"none", boxSizing:"border-box" as const };

  return (
    <div style={{ minHeight:"100vh", background:V.bg, color:V.text, fontFamily:"system-ui,sans-serif" }}>

      {/* Header */}
      <div style={{ padding:"22px 24px 0", display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:12 }}>
        <div style={{ fontSize:22, fontWeight:800 }}>Aroma<span style={{ color:V.accent, fontStyle:"italic" }}>tica</span> <span style={{ fontSize:13, fontWeight:500, color:V.faint, fontStyle:"normal" }}>— Fragrance Collection</span></div>
        <div style={{ display:"flex", gap:8 }}>
          <button style={btnPrimary} onClick={() => { setAf({ status:"wardrobe", brand:"", model:"", imageDataUrl:"", rating:4, bottleType:"Full bottle", sizeMl:"100", price:"", shop:"Unknown", shopLink:"", date:nowIso(), priority:"Medium" }); setShowAdd(true); }}>+ Add</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ padding:"14px 24px 0", display:"flex", gap:4, borderBottom:`1px solid ${V.border}` }}>
        {([["wardrobe","Wardrobe",counts.wardrobe],["wishlist","Wishlist",counts.wishlist],["archive","Archive",counts.archive],["purchases","Purchases",null]] as const).map(([key,label,count]) => (
          <button key={key} onClick={() => setActiveTab(key as TabKey)} style={{ padding:"9px 16px", borderRadius:"10px 10px 0 0", border:`1px solid ${activeTab===key?V.border:"transparent"}`, borderBottom:"none", background: activeTab===key ? V.card : "transparent", color: activeTab===key ? V.text : V.muted, cursor:"pointer", fontSize:13, fontWeight:600, display:"flex", gap:6, alignItems:"center" }}>
            {label}
            {count !== null && count > 0 && <span style={{ fontSize:10, padding:"1px 7px", borderRadius:999, background:activeTab===key?"rgba(245,166,35,0.15)":"rgba(245,166,35,0.1)", color:V.accent, fontWeight:700 }}>{count}</span>}
          </button>
        ))}
      </div>

      {/* Tab stats bar */}
      {activeTab !== "purchases" && (() => {
        const s = tabStats[activeTab as "wardrobe"|"wishlist"|"archive"];
        return s && s.count > 0 ? (
          <div style={{ margin:"10px 24px 0", padding:"10px 16px", background:V.card, border:`1px solid ${V.border}`, borderRadius:12, display:"flex", gap:20, flexWrap:"wrap", fontSize:13 }}>
            <span style={{ color:V.muted }}><strong style={{ color:V.text, fontWeight:700 }}>{s.count}</strong> perfumes</span>
            {s.total > 0 && <span style={{ color:V.muted }}>Total spent: <strong style={{ color:V.accent, fontWeight:700 }}>{fmtMoney(s.total)}</strong></span>}
            {s.avg > 0 && <span style={{ color:V.muted }}>Avg bottle: <strong style={{ color:V.text, fontWeight:700 }}>{fmtMoney(s.avg)}</strong></span>}
            {activeTab === "wardrobe" && tabStats.wardrobeValue > 0 && <span style={{ color:V.muted }}>Wardrobe value: <strong style={{ color:V.text, fontWeight:700 }}>{fmtMoney(tabStats.wardrobeValue)}</strong></span>}
            {tabStats.newIds.size > 0 && activeTab === "wardrobe" && (
              <span style={{ color:"#16a34a", fontWeight:600 }}>🆕 {Array.from(tabStats.newIds).filter(id => {
                const p = items.find(x => x.id === id);
                return p && isWardrobeItem(p);
              }).length} added this month</span>
            )}
          </div>
        ) : null;
      })()}

      {/* Archive mixed-state note */}
      {activeTab === "archive" && (
        <div style={{ margin:"6px 24px 0", fontSize:12, color:V.faint }}>
          Perfumes with at least one archived bottle. Some may also appear in Wardrobe if they have active bottles too.
        </div>
      )}

      {/* Weather suggestions */}
      {activeTab === "wardrobe" && weatherSuggestions.length > 0 && dubaiTemp !== null && (
        <div style={{ margin:"10px 24px 0", padding:"14px 16px", background:isDark?"rgba(99,102,241,0.08)":"rgba(99,102,241,0.04)", border:"1px solid rgba(99,102,241,0.2)", borderRadius:14 }}>
          <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:10 }}>
            <span style={{ fontSize:18 }}>{dubaiTemp > 32 ? "🌡️" : dubaiTemp < 22 ? "❄️" : "🌤️"}</span>
            <div>
              <span style={{ fontSize:13, fontWeight:700, color:"#6366f1" }}>
                {dubaiTemp > 32 ? "It's hot out" : dubaiTemp < 22 ? "Cool weather today" : "Nice weather"} · {dubaiTemp.toFixed(0)}°C in Dubai
              </span>
              <span style={{ fontSize:11, color:V.faint, marginLeft:8 }}>
                {dubaiTemp > 32 ? "Light, fresh scents" : dubaiTemp < 22 ? "Rich, warm fragrances" : "Moderate projection"}
              </span>
            </div>
          </div>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            {weatherSuggestions.map(item => (
              <button key={item.id} onClick={() => router.push(`/dashboard/perfumes/${item.id}`)}
                style={{ padding:"8px 12px", borderRadius:10, border:"1px solid rgba(99,102,241,0.2)", background:isDark?"rgba(99,102,241,0.1)":"rgba(99,102,241,0.06)", cursor:"pointer", textAlign:"left" }}>
                <div style={{ fontSize:10, fontWeight:700, color:"#6366f1" }}>{item.brand}</div>
                <div style={{ fontSize:12, fontWeight:800, color:V.text }}>{item.model}</div>
                <div style={{ display:"flex", gap:3, marginTop:3 }}>
                  {item.weatherTags.slice(0,2).map(w => <span key={w} style={{ fontSize:9, fontWeight:700, padding:"1px 5px", borderRadius:999, background:"rgba(99,102,241,0.15)", color:"#6366f1" }}>{w}</span>)}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Top used */}
      {activeTab === "wardrobe" && topUsed.length > 0 && (
        <div style={{ margin:"12px 24px 0", padding:"14px 16px", background:V.card, border:`1px solid ${V.border}`, borderRadius:14 }}>
          <div style={{ fontSize:11, fontWeight:800, textTransform:"uppercase", letterSpacing:"0.08em", color:V.faint, marginBottom:8 }}>Most used</div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))", gap:10 }}>
            {topUsed.map(({ perfume, days }) => (
              <button key={perfume.id} onClick={() => router.push(`/dashboard/perfumes/${perfume.id}`)} style={{ textAlign:"left", border:`1px solid ${V.border}`, background:V.input, borderRadius:12, padding:12, cursor:"pointer" }}>
                <div style={{ fontSize:11, color:V.faint, textTransform:"uppercase", fontWeight:800 }}>{perfume.brand}</div>
                <div style={{ fontSize:14, fontWeight:800, margin:"2px 0 6px" }}>{perfume.model}</div>
                <div style={{ fontSize:12, color:V.muted }}>{days} day{days === 1 ? "" : "s"} used</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Brand modal */}
      {brandFocus && (() => {
        const brandItems = items.filter(x => x.brand === brandFocus);
        const brandIds = new Set(brandItems.map(x => x.id));
        const spend = purchases.filter(p => brandIds.has(p.perfumeId)).reduce((s,p) => s + p.price, 0);
        const rated = brandItems.filter(p => p.ratingStars);
        const avgRating = rated.length ? rated.reduce((s,p) => s + (p.ratingStars ?? 0), 0) / rated.length : 0;
        return (
          <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", zIndex:70, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }} onClick={() => setBrandFocus(null)}>
            <div onClick={e => e.stopPropagation()} style={{ width:"min(700px,100%)", background:V.card, border:`1px solid ${V.border}`, borderRadius:18, padding:20 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
                <div><div style={{ fontSize:20, fontWeight:800 }}>{brandFocus}</div><div style={{ fontSize:12, color:V.muted }}>Brand overview</div></div>
                <button style={btn} onClick={() => setBrandFocus(null)}>Close</button>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(4,minmax(0,1fr))", gap:10, marginBottom:14 }}>
                <div style={{ background:V.input, border:`1px solid ${V.border}`, borderRadius:12, padding:10 }}><div style={{ fontSize:10, color:V.faint, textTransform:"uppercase", fontWeight:800 }}>Perfumes</div><div style={{ fontSize:16, fontWeight:800 }}>{brandItems.length}</div></div>
                <div style={{ background:V.input, border:`1px solid ${V.border}`, borderRadius:12, padding:10 }}><div style={{ fontSize:10, color:V.faint, textTransform:"uppercase", fontWeight:800 }}>Wardrobe</div><div style={{ fontSize:16, fontWeight:800 }}>{brandItems.filter(isWardrobeItem).length}</div></div>
                <div style={{ background:V.input, border:`1px solid ${V.border}`, borderRadius:12, padding:10 }}><div style={{ fontSize:10, color:V.faint, textTransform:"uppercase", fontWeight:800 }}>Avg rating</div><div style={{ fontSize:16, fontWeight:800 }}>{avgRating ? avgRating.toFixed(1) : "—"}</div></div>
                <div style={{ background:V.input, border:`1px solid ${V.border}`, borderRadius:12, padding:10 }}><div style={{ fontSize:10, color:V.faint, textTransform:"uppercase", fontWeight:800 }}>Spent</div><div style={{ fontSize:16, fontWeight:800 }}>{fmtMoney(spend)}</div></div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))", gap:10 }}>
                {brandItems.map(x => (
                  <button key={x.id} onClick={() => router.push(`/dashboard/perfumes/${x.id}`)} style={{ textAlign:"left", border:`1px solid ${V.border}`, background:V.input, borderRadius:12, padding:12, cursor:"pointer" }}>
                    <div style={{ fontSize:14, fontWeight:800 }}>{x.model}</div>
                    <div style={{ fontSize:11, color:V.muted, marginTop:3 }}>
                      {isWardrobeItem(x) ? "Wardrobe" : isWishlistItem(x) ? "Wishlist" : "Archive"}
                      {x.bottles.length > 0 && ` · ${x.bottles.length} bottle${x.bottles.length > 1 ? "s" : ""}`}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Search + sort */}
      {activeTab !== "purchases" && (
        <div style={{ padding:"14px 24px", display:"flex", gap:10, flexWrap:"wrap" }}>
          <input style={{ ...inputSt, flex:1, minWidth:160, borderRadius:999 }} placeholder="Search brand or name…" value={search} onChange={e => setSearch(e.target.value)} />
          <select style={{ ...inputSt, width:"auto", borderRadius:999, cursor:"pointer" }} value={sortBy} onChange={e => setSortBy(e.target.value)}>
            <option value="brand_asc">Brand A–Z</option>
            <option value="brand_desc">Brand Z–A</option>
            <option value="rating_desc">Rating ↓</option>
            <option value="rating_asc">Rating ↑</option>
          </select>
        </div>
      )}

      {/* Grid */}
      {activeTab !== "purchases" && (
        loading
          ? <div style={{ padding:"60px 24px", textAlign:"center", color:V.faint }}>Loading your collection…</div>
          : tabItems.length === 0
            ? <div style={{ padding:"60px 24px", textAlign:"center" }}>
                <div style={{ fontSize:48, marginBottom:12 }}>🌿</div>
                <div style={{ fontSize:16, fontWeight:600, color:V.muted }}>{search ? "No results" : activeTab === "wardrobe" ? "No active bottles yet" : activeTab === "archive" ? "No archived bottles yet" : "Wishlist is empty"}</div>
                {items.length === 0 && <div style={{ fontSize:13, color:V.faint, marginTop:6 }}>Click + Add to get started</div>}
              </div>
            : <div style={{ padding:"0 24px 24px", display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))", gap:14 }}>
                {tabItems.map(item => {
                  // For archive tab: show how many bottles are archived
                  const archivedBottleCount = item.bottles.filter(b => ARCHIVE_STATUSES.has(b.status)).length;
                  const activeBottleCount   = item.bottles.filter(b => !ARCHIVE_STATUSES.has(b.status)).length;
                  const isMixed = activeBottleCount > 0 && archivedBottleCount > 0;
                  return (
                    <button key={item.id} onClick={() => router.push(`/dashboard/perfumes/${item.id}`)}
                      style={{ borderRadius:14, border:`1px solid ${V.border}`, background:V.card, cursor:"pointer", padding:0, textAlign:"left", color:V.text, transition:"transform 0.15s,box-shadow 0.15s,border-color 0.15s" }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform="translateY(-2px)"; (e.currentTarget as HTMLButtonElement).style.boxShadow="0 8px 32px rgba(0,0,0,0.12)"; (e.currentTarget as HTMLButtonElement).style.borderColor="rgba(245,166,35,0.4)"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform=""; (e.currentTarget as HTMLButtonElement).style.boxShadow=""; (e.currentTarget as HTMLButtonElement).style.borderColor=V.border; }}>
                      {item.imageUrl
                        ? <img src={item.imageUrl} alt="" style={{ width:"100%", height:160, objectFit:"cover", borderRadius:"14px 14px 0 0", display:"block" }} />
                        : <div style={{ width:"100%", height:160, borderRadius:"14px 14px 0 0", background:V.input, display:"flex", alignItems:"center", justifyContent:"center", fontSize:36 }}>🌸</div>
                      }
                      <div style={{ padding:"10px 12px 12px" }}>
                        <button onClick={(e) => { e.stopPropagation(); setBrandFocus(item.brand); }} style={{ background:"none", border:"none", padding:0, fontSize:10, fontWeight:700, letterSpacing:"0.1em", textTransform:"uppercase", color:V.faint, marginBottom:1, cursor:"pointer" }}>{item.brand}</button>
                        <div style={{ fontSize:13, fontWeight:700, marginBottom:6, lineHeight:1.3 }}>{item.model}</div>
                        <div style={{ marginBottom:5 }}><Stars value={item.ratingStars} size={11} /></div>
                        <div style={{ display:"flex", gap:3, flexWrap:"wrap", alignItems:"center" }}>
                          {tabStats.newIds.has(item.id) && <span style={{ fontSize:9, fontWeight:800, padding:"1px 6px", borderRadius:999, background:"rgba(22,163,74,0.12)", color:"#16a34a", textTransform:"uppercase", letterSpacing:"0.06em" }}>New</span>}
                          {isMixed && <span style={{ fontSize:9, fontWeight:700, padding:"1px 6px", borderRadius:999, background:"rgba(245,166,35,0.12)", color:"#d97706" }}>Mixed</span>}
                          {item.weatherTags.slice(0,2).map(w => (
                            <span key={w} style={{ fontSize:9, fontWeight:700, padding:"1px 6px", borderRadius:999, background:"rgba(99,102,241,0.1)", color:"#6366f1" }}>{w}</span>
                          ))}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
      )}

      {/* Purchases tab */}
      {activeTab === "purchases" && (
        <div style={{ padding:"20px 24px", display:"flex", flexDirection:"column", gap:16 }}>
          <div style={{ background:V.card, border:`1px solid ${V.border}`, borderRadius:14, padding:16 }}>
            <div style={{ fontSize:11, fontWeight:800, textTransform:"uppercase", letterSpacing:"0.1em", color:V.faint, marginBottom:12 }}>Paid purchases — last 12 months</div>
            <div style={{ display:"flex", gap:6, alignItems:"flex-end", height:80 }}>
              {last12Months.map((d, i) => {
                const max = Math.max(...last12Months.map(x => x.count), 1);
                return (
                  <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
                    <div style={{ fontSize:9, color:V.faint, fontWeight:700 }}>{d.count > 0 ? d.count : ""}</div>
                    <div style={{ width:"100%", background:d.count>0?V.accent:V.border, borderRadius:4, height:Math.max(4,(d.count/max)*52) }} />
                    <div style={{ fontSize:9, color:V.faint, whiteSpace:"nowrap" }}>{d.month}</div>
                  </div>
                );
              })}
            </div>
          </div>
          <div style={{ background:V.card, border:`1px solid ${V.border}`, borderRadius:14, overflow:"hidden" }}>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 0.6fr 0.8fr 1.2fr", gap:8, padding:"10px 16px", background:isDark?"rgba(255,255,255,0.04)":"rgba(0,0,0,0.03)", fontSize:10, fontWeight:800, textTransform:"uppercase", letterSpacing:"0.08em", color:V.faint }}>
              <div>Perfume</div><div>Price</div><div>Date</div><div>Shop</div>
            </div>
            {purchaseHistory.length === 0 && <div style={{ padding:24, textAlign:"center", color:V.faint, fontSize:13 }}>No purchases yet.</div>}
            {purchaseHistory.slice(0, 50).map(p => {
              const perf = items.find(x => x.id === p.perfumeId);
              return (
                <div key={p.id} style={{ display:"grid", gridTemplateColumns:"1fr 0.6fr 0.8fr 1.2fr", gap:8, padding:"11px 16px", borderTop:`1px solid ${V.border}`, fontSize:13, alignItems:"center" }}>
                  <button onClick={() => perf && router.push(`/dashboard/perfumes/${perf.id}`)} style={{ background:"none", border:"none", textAlign:"left", cursor:"pointer", padding:0, fontWeight:700, color:V.text, fontSize:13 }}>{perf ? `${perf.brand} ${perf.model}` : "Unknown"}</button>
                  <div style={{ fontWeight:700 }}>{p.price > 0 ? fmtMoney(p.price) : <span style={{ color:V.faint }}>Free</span>}</div>
                  <div style={{ color:V.muted, fontSize:12 }}>{p.date}</div>
                  <div>{p.shopLink ? <a href={p.shopLink} target="_blank" rel="noreferrer" style={{ color:V.accent, textDecoration:"none", fontWeight:600, fontSize:12 }}>{p.shopName}</a> : <span style={{ color:V.muted, fontSize:12 }}>{p.shopName}</span>}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Add modal */}
      {showAdd && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:50, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }} onClick={() => setShowAdd(false)}>
          <div style={{ background:V.card, border:`1px solid ${V.border}`, borderRadius:18, width:"min(580px,100%)", maxHeight:"90vh", overflow:"auto" }} onClick={e => e.stopPropagation()}>
            <div style={{ padding:"18px 20px", borderBottom:`1px solid ${V.border}`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div>
                <div style={{ fontSize:11, fontWeight:700, color:V.faint, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:3 }}>New entry</div>
                <div style={{ fontSize:18, fontWeight:800 }}>Add perfume</div>
              </div>
              <button style={btn} onClick={() => setShowAdd(false)}>✕</button>
            </div>
            <div style={{ padding:20, display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
              <label style={{ display:"flex", flexDirection:"column", gap:5, fontSize:12, fontWeight:700, color:V.muted, textTransform:"uppercase", letterSpacing:"0.06em" }}>
                Collection
                <select style={inputSt} value={af.status} onChange={e => setAf(f => ({ ...f, status: e.target.value as PerfumeStatus }))}>
                  <option value="wardrobe">Wardrobe</option><option value="wishlist">Wishlist</option>
                </select>
              </label>
              <label style={{ display:"flex", flexDirection:"column", gap:5, fontSize:12, fontWeight:700, color:V.muted, textTransform:"uppercase", letterSpacing:"0.06em" }}>
                Brand <input style={inputSt} value={af.brand} onChange={e => setAf(f => ({ ...f, brand: e.target.value }))} placeholder="e.g. Lattafa" />
              </label>
              <label style={{ display:"flex", flexDirection:"column", gap:5, fontSize:12, fontWeight:700, color:V.muted, textTransform:"uppercase", letterSpacing:"0.06em" }}>
                Model <input style={inputSt} value={af.model} onChange={e => setAf(f => ({ ...f, model: e.target.value }))} placeholder="e.g. Asad" />
              </label>
              <label style={{ display:"flex", flexDirection:"column", gap:5, fontSize:12, fontWeight:700, color:V.muted, textTransform:"uppercase", letterSpacing:"0.06em" }}>
                Rating
                <div style={{ display:"flex", gap:4 }}>
                  {[1,2,3,4,5].map(s => <button key={s} onClick={() => setAf(f => ({ ...f, rating: s }))} style={{ background:"none", border:"none", cursor:"pointer", fontSize:22, color: s <= af.rating ? "#F5A623" : V.border, padding:2 }}>★</button>)}
                </div>
              </label>
              <label style={{ display:"flex", flexDirection:"column", gap:5, fontSize:12, fontWeight:700, color:V.muted, textTransform:"uppercase", letterSpacing:"0.06em", gridColumn:"1/-1" }}>
                Image URL (optional) <input style={inputSt} value={af.imageDataUrl} onChange={e => setAf(f => ({ ...f, imageDataUrl: e.target.value }))} placeholder="https://…" />
              </label>
              {af.status === "wardrobe" && <>
                <label style={{ display:"flex", flexDirection:"column", gap:5, fontSize:12, fontWeight:700, color:V.muted, textTransform:"uppercase", letterSpacing:"0.06em" }}>
                  Bottle type
                  <select style={inputSt} value={af.bottleType} onChange={e => setAf(f => ({ ...f, bottleType: e.target.value as BottleType }))}>
                    <option>Full bottle</option><option>Decant</option><option>Sample</option><option>Tester</option>
                  </select>
                </label>
                <label style={{ display:"flex", flexDirection:"column", gap:5, fontSize:12, fontWeight:700, color:V.muted, textTransform:"uppercase", letterSpacing:"0.06em" }}>
                  Size (ml) <input style={inputSt} value={af.sizeMl} onChange={e => setAf(f => ({ ...f, sizeMl: e.target.value }))} />
                </label>
                <label style={{ display:"flex", flexDirection:"column", gap:5, fontSize:12, fontWeight:700, color:V.muted, textTransform:"uppercase", letterSpacing:"0.06em" }}>
                  Purchase date <input style={inputSt} type="date" value={af.date} onChange={e => setAf(f => ({ ...f, date: e.target.value }))} />
                </label>
                <label style={{ display:"flex", flexDirection:"column", gap:5, fontSize:12, fontWeight:700, color:V.muted, textTransform:"uppercase", letterSpacing:"0.06em" }}>
                  Price (AED) <input style={inputSt} value={af.price} onChange={e => setAf(f => ({ ...f, price: e.target.value }))} />
                </label>
                <label style={{ display:"flex", flexDirection:"column", gap:5, fontSize:12, fontWeight:700, color:V.muted, textTransform:"uppercase", letterSpacing:"0.06em" }}>
                  Shop name <input style={inputSt} value={af.shop} onChange={e => setAf(f => ({ ...f, shop: e.target.value }))} />
                </label>
                <label style={{ display:"flex", flexDirection:"column", gap:5, fontSize:12, fontWeight:700, color:V.muted, textTransform:"uppercase", letterSpacing:"0.06em" }}>
                  Shop link (optional) <input style={inputSt} value={af.shopLink} onChange={e => setAf(f => ({ ...f, shopLink: e.target.value }))} placeholder="https://…" />
                </label>
              </>}
              {af.status === "wishlist" && (
                <label style={{ display:"flex", flexDirection:"column", gap:5, fontSize:12, fontWeight:700, color:V.muted, textTransform:"uppercase", letterSpacing:"0.06em" }}>
                  Priority
                  <select style={inputSt} value={af.priority} onChange={e => setAf(f => ({ ...f, priority: e.target.value }))}>
                    <option>Low</option><option>Medium</option><option>High</option><option>Must buy</option>
                  </select>
                </label>
              )}
            </div>
            <div style={{ padding:"0 20px 20px", display:"flex", justifyContent:"flex-end", gap:8 }}>
              <button style={btn} onClick={() => setShowAdd(false)}>Cancel</button>
              <button style={btnPrimary} onClick={doAdd}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Toasts */}
      <div style={{ position:"fixed", right:16, bottom:20, display:"flex", flexDirection:"column", gap:8, zIndex:200 }}>
        {toasts.map(t => (
          <div key={t.id} style={{ padding:"12px 16px", borderRadius:10, fontSize:13, fontWeight:700, maxWidth:320, boxShadow:"0 8px 24px rgba(0,0,0,0.25)",
            background: t.kind==="success"?"#1a3a2a":t.kind==="error"?"#3a1a1a":"#1a2a3a",
            color: t.kind==="success"?"#4ade80":t.kind==="error"?"#f87171":"#60a5fa",
            border: `1px solid ${t.kind==="success"?"rgba(74,222,128,0.3)":t.kind==="error"?"rgba(248,113,113,0.3)":"rgba(96,165,250,0.3)"}` }}>
            {t.message}
          </div>
        ))}
      </div>
    </div>
  );
}
