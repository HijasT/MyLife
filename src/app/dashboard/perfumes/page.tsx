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
type Purchase = { id: string; perfumeId: string; bottleId: string; date: string; ml: number; price: number; currency: string; shopName: string; shopLink?: string };
type Perfume = {
  id: string; status: PerfumeStatus; brand: string; model: string; imageUrl: string;
  ratingStars: number | null; notesTags: string[]; weatherTags: string[];
  genderScale: GenderScale; longevity: string; sillage: string;
  value: string; cloneSimilar: string; notesText: string;
  bottles: Bottle[]; archiveReason?: string;
};
type Toast = { id: string; kind: ToastKind; message: string };
type AddForm = {
  status: PerfumeStatus; brand: string; model: string; imageDataUrl: string;
  rating: number; bottleType: BottleType; sizeMl: string; usage: string;
  price: string; currency: string; shop: string; shopLink: string; date: string;
};

function uid() { return `id-${Math.random().toString(16).slice(2)}-${Date.now()}`; }
function safeNum(x: unknown, fb = 0) { const n = typeof x === "number" ? x : Number(x); return Number.isFinite(n) ? n : fb; }
function nowIso() { return new Date().toISOString().slice(0, 10); }
function monthKey(d: string) { return d.slice(0, 7); }
function fmtMoney(c: string, a: number) { return `${c} ${a.toFixed(2)}`; }

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bottles: (row.perfume_bottles ?? []).map((b: any): Bottle => ({
      id: b.id, bottleSizeMl: b.bottle_size_ml ?? 100, bottleType: b.bottle_type ?? "Full bottle",
      status: b.status ?? "In collection", usage: b.usage ?? "",
    })),
    archiveReason: row.archive_reason ?? undefined,
  };
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dbToPurchase(p: any): Purchase {
  return { id: p.id, perfumeId: p.perfume_id, bottleId: p.bottle_id ?? "none", date: p.date, ml: p.ml ?? 0, price: p.price ?? 0, currency: p.currency ?? "AED", shopName: p.shop_name ?? "Unknown", shopLink: p.shop_link ?? undefined };
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
  const [af, setAf] = useState<AddForm>({
    status: "wardrobe", brand: "", model: "", imageDataUrl: "", rating: 4,
    bottleType: "Full bottle", sizeMl: "100", usage: "Casual",
    price: "0", currency: "AED", shop: "Unknown", shopLink: "", date: nowIso(),
  });

  const isDark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");

  useEffect(() => {
    async function load() {
      const cached = loadFromCache<Perfume[]>("perfumes");
      const cachedPur = loadFromCache<Purchase[]>("purchases");
      if (cached) { setItems(cached); setLoading(false); }
      if (cachedPur) setPurchases(cachedPur);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      setUserId(user.id);

      const [pr, pur] = await Promise.all([
        supabase.from("perfumes").select("*, perfume_bottles(*)").eq("user_id", user.id).order("brand"),
        supabase.from("perfume_purchases").select("*").eq("user_id", user.id).order("date", { ascending: false }),
      ]);
      const loaded = (pr.data ?? []).map(dbToItem);
      const loadedPur = (pur.data ?? []).map(dbToPurchase);
      setItems(loaded);
      setPurchases(loadedPur);
      saveToCache("perfumes", loaded);
      saveToCache("purchases", loadedPur);
      markSynced();
      setLoading(false);
    }
    load();
  }, []);

  const counts = useMemo(() => ({
    wardrobe: items.filter(x => x.status === "wardrobe").length,
    wishlist: items.filter(x => x.status === "wishlist").length,
    archive: items.filter(x => x.status === "archive").length,
  }), [items]);

  const tabItems = useMemo(() => {
    const statusMap: Record<TabKey, PerfumeStatus | null> = { wardrobe: "wardrobe", wishlist: "wishlist", archive: "archive", purchases: null };
    const s = statusMap[activeTab];
    if (!s) return [];
    let list = items.filter(x => x.status === s);
    if (search.trim()) list = list.filter(x => `${x.brand} ${x.model}`.toLowerCase().includes(search.toLowerCase()));
    return [...list].sort((a, b) => {
      if (sortBy === "brand_asc")  return `${a.brand} ${a.model}`.localeCompare(`${b.brand} ${b.model}`);
      if (sortBy === "brand_desc") return `${b.brand} ${b.model}`.localeCompare(`${a.brand} ${a.model}`);
      if (sortBy === "rating_desc") return (b.ratingStars ?? 0) - (a.ratingStars ?? 0);
      if (sortBy === "rating_asc")  return (a.ratingStars ?? 0) - (b.ratingStars ?? 0);
      return 0;
    });
  }, [items, activeTab, search, sortBy]);

  const purchaseHistory = useMemo(() => [...purchases].sort((a, b) => b.date.localeCompare(a.date)), [purchases]);

  const last12Months = useMemo(() => {
    const today = new Date();
    const map = new Map<string, number>();
    for (const p of purchases) { if (safeNum(p.price) <= 0) continue; map.set(monthKey(p.date), (map.get(monthKey(p.date)) ?? 0) + 1); }
    return Array.from({ length: 12 }).map((_, i) => {
      const dt = new Date(today.getFullYear(), today.getMonth() - 11 + i, 1);
      const mk = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
      return { month: mk.slice(5), count: map.get(mk) ?? 0 };
    });
  }, [purchases]);

  function toast(message: string, kind: ToastKind = "success") {
    const id = uid();
    setToasts(p => [...p, { id, kind, message }]);
    setTimeout(() => setToasts(p => p.filter(x => x.id !== id)), 2500);
  }

  async function doAdd() {
    if (!userId) return;
    if (!af.brand.trim() || !af.model.trim()) { toast("Brand and model required", "error"); return; }
    const { data: pd, error } = await supabase.from("perfumes").insert({
      user_id: userId, brand: af.brand.trim(), model: af.model.trim(), status: af.status,
      image_url: af.imageDataUrl || "", rating_stars: af.rating,
      notes_tags: [], weather_tags: [], gender_scale: 2,
      longevity: "Unknown", sillage: "Unknown", value_rating: "Neutral",
    }).select("*").single();
    if (error || !pd) { toast("Failed to save", "error"); return; }
    if (af.status === "wardrobe") {
      const size = safeNum(af.sizeMl, 100);
      const { data: bd } = await supabase.from("perfume_bottles").insert({
        perfume_id: pd.id, user_id: userId, bottle_size_ml: size,
        bottle_type: af.bottleType, status: "In collection", usage: af.usage,
      }).select("*").single();
      if (bd) {
        const price = safeNum(af.price, 0);
        if (price > 0 || af.shop.trim()) {
          await supabase.from("perfume_purchases").insert({
            perfume_id: pd.id, bottle_id: bd.id, user_id: userId,
            date: af.date || nowIso(), ml: size, price, currency: af.currency,
            shop_name: af.shop, shop_link: af.shopLink || null,
          });
        }
      }
    }
    setShowAdd(false);
    router.push(`/dashboard/perfumes/${pd.id}`);
  }

  function downloadCsv() {
    const rows = [["Brand","Model","Status","Rating","Notes","Weather","Longevity","Sillage","Value","Clone"].join(",")];
    for (const it of items) {
      rows.push([it.brand, it.model, it.status, it.ratingStars ?? "", it.notesTags.join("|"), it.weatherTags.join("|"), it.longevity, it.sillage, it.value, it.cloneSimilar].map(v => `"${String(v).replaceAll('"','""')}"`).join(","));
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([rows.join("\n")], { type: "text/csv" }));
    a.download = `aromatica-${nowIso()}.csv`; a.click();
    toast("CSV downloaded");
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
          <button style={btn} onClick={downloadCsv}>Export CSV</button>
          <button style={btnPrimary} onClick={() => { setAf({ status:"wardrobe", brand:"", model:"", imageDataUrl:"", rating:4, bottleType:"Full bottle", sizeMl:"100", usage:"Casual", price:"0", currency:"AED", shop:"Unknown", shopLink:"", date:nowIso() }); setShowAdd(true); }}>+ Add</button>
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
                <div style={{ fontSize:16, fontWeight:600, color:V.muted }}>{items.length === 0 ? "Your collection is empty" : search ? "No results" : "Nothing here yet"}</div>
                {items.length === 0 && <div style={{ fontSize:13, color:V.faint, marginTop:6 }}>Click + Add to get started</div>}
              </div>
            : <div style={{ padding:"0 24px 24px", display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))", gap:14 }}>
                {tabItems.map(item => (
                  <button key={item.id} onClick={() => router.push(`/dashboard/perfumes/${item.id}`)}
                    style={{ borderRadius:14, border:`1px solid ${V.border}`, background:V.card, cursor:"pointer", padding:0, textAlign:"left", color:V.text, transition:"transform 0.15s,box-shadow 0.15s,border-color 0.15s" }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform="translateY(-2px)"; (e.currentTarget as HTMLButtonElement).style.boxShadow="0 8px 32px rgba(0,0,0,0.12)"; (e.currentTarget as HTMLButtonElement).style.borderColor="rgba(245,166,35,0.4)"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform=""; (e.currentTarget as HTMLButtonElement).style.boxShadow=""; (e.currentTarget as HTMLButtonElement).style.borderColor=V.border; }}>
                    {item.imageUrl
                      ? <img src={item.imageUrl} alt="" style={{ width:"100%", height:160, objectFit:"cover", borderRadius:"14px 14px 0 0", display:"block" }} />
                      : <div style={{ width:"100%", height:160, borderRadius:"14px 14px 0 0", background:V.input, display:"flex", alignItems:"center", justifyContent:"center", fontSize:36 }}>🌸</div>
                    }
                    <div style={{ padding:"12px 14px 14px" }}>
                      <div style={{ fontSize:10, fontWeight:700, letterSpacing:"0.1em", textTransform:"uppercase", color:V.faint, marginBottom:2 }}>{item.brand}</div>
                      <div style={{ fontSize:14, fontWeight:700, marginBottom:8, lineHeight:1.3 }}>{item.model}</div>
                      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:8 }}>
                        <Stars value={item.ratingStars} size={12} />
                        <span style={{ fontSize:10, fontWeight:700, padding:"3px 8px", borderRadius:999, textTransform:"uppercase",
                          background: item.status==="wardrobe"?"rgba(245,166,35,0.12)":item.status==="wishlist"?"rgba(99,102,241,0.1)":"rgba(107,114,128,0.1)",
                          color: item.status==="wardrobe"?"#d97706":item.status==="wishlist"?"#6366f1":"#6b7280" }}>
                          {item.status}
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
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
                  <div style={{ fontWeight:700 }}>{p.price > 0 ? fmtMoney(p.currency, p.price) : <span style={{ color:V.faint }}>Free</span>}</div>
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
                  <option value="wardrobe">Wardrobe</option><option value="wishlist">Wishlist</option><option value="archive">Archive</option>
                </select>
              </label>
              <label style={{ display:"flex", flexDirection:"column", gap:5, fontSize:12, fontWeight:700, color:V.muted, textTransform:"uppercase", letterSpacing:"0.06em" }}>
                Brand
                <input style={inputSt} value={af.brand} onChange={e => setAf(f => ({ ...f, brand: e.target.value }))} placeholder="e.g. Lattafa" />
              </label>
              <label style={{ display:"flex", flexDirection:"column", gap:5, fontSize:12, fontWeight:700, color:V.muted, textTransform:"uppercase", letterSpacing:"0.06em" }}>
                Model
                <input style={inputSt} value={af.model} onChange={e => setAf(f => ({ ...f, model: e.target.value }))} placeholder="e.g. Asad" />
              </label>
              <label style={{ display:"flex", flexDirection:"column", gap:5, fontSize:12, fontWeight:700, color:V.muted, textTransform:"uppercase", letterSpacing:"0.06em" }}>
                Rating
                <div style={{ display:"flex", gap:4 }}>
                  {[1,2,3,4,5].map(s => <button key={s} onClick={() => setAf(f => ({ ...f, rating: s }))} style={{ background:"none", border:"none", cursor:"pointer", fontSize:22, color: s <= af.rating ? "#F5A623" : V.border, padding:2 }}>★</button>)}
                </div>
              </label>
              <label style={{ display:"flex", flexDirection:"column", gap:5, fontSize:12, fontWeight:700, color:V.muted, textTransform:"uppercase", letterSpacing:"0.06em", gridColumn:"1/-1" }}>
                Image URL (optional)
                <input style={inputSt} value={af.imageDataUrl} onChange={e => setAf(f => ({ ...f, imageDataUrl: e.target.value }))} placeholder="https://…" />
              </label>
              <label style={{ display:"flex", flexDirection:"column", gap:5, fontSize:12, fontWeight:700, color:V.muted, textTransform:"uppercase", letterSpacing:"0.06em" }}>
                Bottle type
                <select style={inputSt} value={af.bottleType} onChange={e => setAf(f => ({ ...f, bottleType: e.target.value as BottleType }))}>
                  <option>Full bottle</option><option>Decant</option><option>Sample</option><option>Tester</option>
                </select>
              </label>
              <label style={{ display:"flex", flexDirection:"column", gap:5, fontSize:12, fontWeight:700, color:V.muted, textTransform:"uppercase", letterSpacing:"0.06em" }}>
                Size (ml)
                <input style={inputSt} value={af.sizeMl} onChange={e => setAf(f => ({ ...f, sizeMl: e.target.value }))} />
              </label>
              <label style={{ display:"flex", flexDirection:"column", gap:5, fontSize:12, fontWeight:700, color:V.muted, textTransform:"uppercase", letterSpacing:"0.06em" }}>
                Usage
                <input style={inputSt} value={af.usage} onChange={e => setAf(f => ({ ...f, usage: e.target.value }))} placeholder="Office . Party" />
              </label>
              <label style={{ display:"flex", flexDirection:"column", gap:5, fontSize:12, fontWeight:700, color:V.muted, textTransform:"uppercase", letterSpacing:"0.06em" }}>
                Purchase date
                <input style={inputSt} type="date" value={af.date} onChange={e => setAf(f => ({ ...f, date: e.target.value }))} />
              </label>
              <label style={{ display:"flex", flexDirection:"column", gap:5, fontSize:12, fontWeight:700, color:V.muted, textTransform:"uppercase", letterSpacing:"0.06em" }}>
                Price
                <input style={inputSt} value={af.price} onChange={e => setAf(f => ({ ...f, price: e.target.value }))} />
              </label>
              <label style={{ display:"flex", flexDirection:"column", gap:5, fontSize:12, fontWeight:700, color:V.muted, textTransform:"uppercase", letterSpacing:"0.06em" }}>
                Currency
                <select style={inputSt} value={af.currency} onChange={e => setAf(f => ({ ...f, currency: e.target.value }))}>
                  <option>AED</option><option>USD</option><option>INR</option><option>GBP</option><option>EUR</option>
                </select>
              </label>
              <label style={{ display:"flex", flexDirection:"column", gap:5, fontSize:12, fontWeight:700, color:V.muted, textTransform:"uppercase", letterSpacing:"0.06em" }}>
                Shop name
                <input style={inputSt} value={af.shop} onChange={e => setAf(f => ({ ...f, shop: e.target.value }))} />
              </label>
              <label style={{ display:"flex", flexDirection:"column", gap:5, fontSize:12, fontWeight:700, color:V.muted, textTransform:"uppercase", letterSpacing:"0.06em" }}>
                Shop link (optional)
                <input style={inputSt} value={af.shopLink} onChange={e => setAf(f => ({ ...f, shopLink: e.target.value }))} placeholder="https://…" />
              </label>
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
