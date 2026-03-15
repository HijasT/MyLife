"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// ── Types ──────────────────────────────────────────────────────────────────
type TabKey = "wardrobe" | "wishlist" | "archive" | "purchases";
type PerfumeStatus = "wardrobe" | "wishlist" | "archive";
type BottleType = "Full bottle" | "Decant" | "Sample" | "Tester";
type BottleStatus = "In collection" | "Emptied" | "Sold" | "Gifted";
type GenderScale = 0 | 1 | 2 | 3 | 4;
type ToastKind = "success" | "error" | "info";

type Bottle = { id: string; bottleSizeMl: number; bottleType: BottleType; status: BottleStatus; usage: string };
type Purchase = { id: string; perfumeId: string; bottleId: string; date: string; ml: number; price: number; currency: string; shopName: string; shopLink?: string };
type Perfume = {
  id: string; status: PerfumeStatus; brand: string; model: string; imageUrl: string;
  ratingStars: number | null; notesTags: string[]; weatherTags: ("Cold"|"Neutral"|"Hot")[];
  genderScale: GenderScale; longevity: string; sillage: string;
  value: "Worth it" | "Neutral" | "Not worth it"; cloneSimilar: string; notesText: string;
  bottles: Bottle[]; archiveReason?: "Sold" | "Emptied" | "Gifted";
};
type Toast = { id: string; kind: ToastKind; message: string };

// ── Helpers ────────────────────────────────────────────────────────────────
function uid() { return `id-${Math.random().toString(16).slice(2)}-${Date.now()}`; }
function safeNum(x: unknown, fb = 0) { const n = typeof x === "number" ? x : Number(x); return Number.isFinite(n) ? n : fb; }
function nowIso() { return new Date().toISOString().slice(0, 10); }
function addDays(d: string, n: number) { const [y,m,dd] = d.split("-").map(Number); const dt = new Date(y,m-1,dd); dt.setDate(dt.getDate()+n); return dt.toISOString().slice(0,10); }
function monthKey(d: string) { return d.slice(0, 7); }
function fmtMoney(c: string, a: number) { return `${c} ${a.toFixed(2)}`; }
function genderLabel(v: GenderScale) { return ["Masculine","Lean masc.","Unisex","Lean fem.","Feminine"][v]; }
function clamp(n: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, n)); }
function tagColor(tag: string) {
  const palettes = [["#dbeafe","#1e40af"],["#ede9fe","#5b21b6"],["#fce7f3","#9d174d"],["#fff7ed","#9a3412"],["#ecfdf5","#065f46"],["#f0f9ff","#0c4a6e"]];
  let h = 0; for (let i=0;i<tag.length;i++) h=(h*31+tag.charCodeAt(i))>>>0;
  return palettes[h % palettes.length];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dbToItem(row: any): Perfume {
  return {
    id: row.id, status: row.status ?? "wardrobe", brand: row.brand ?? "", model: row.model ?? "",
    imageUrl: row.image_url || "",
    ratingStars: row.rating_stars ?? null,
    notesTags: row.notes_tags ?? [], weatherTags: row.weather_tags ?? [],
    genderScale: (row.gender_scale ?? 2) as GenderScale,
    longevity: row.longevity ?? "", sillage: row.sillage ?? "",
    value: (row.value_rating ?? "Neutral") as Perfume["value"],
    cloneSimilar: row.clone_similar ?? "", notesText: row.notes_text ?? "",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bottles: (row.perfume_bottles ?? []).map((b: any): Bottle => ({ id: b.id, bottleSizeMl: b.bottle_size_ml??100, bottleType: b.bottle_type??"Full bottle", status: b.status??"In collection", usage: b.usage??"" })),
    archiveReason: row.archive_reason ?? undefined,
  };
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dbToPurchase(p: any): Purchase {
  return { id: p.id, perfumeId: p.perfume_id, bottleId: p.bottle_id??"none", date: p.date, ml: p.ml??0, price: p.price??0, currency: p.currency??"AED", shopName: p.shop_name??"Unknown", shopLink: p.shop_link??undefined };
}

// ── Star display ───────────────────────────────────────────────────────────
function Stars({ value, max = 5, size = 14 }: { value: number | null; max?: number; size?: number }) {
  if (!value) return <span style={{ fontSize: 11, color: "var(--c-muted)" }}>No rating</span>;
  const full = Math.floor(value);
  const frac = value - full;
  return (
    <span style={{ display:"inline-flex", gap:1, alignItems:"center" }}>
      {Array.from({ length: max }).map((_, i) => {
        const fill = i < full ? 1 : i === full && frac >= 0.5 ? 0.5 : 0;
        return (
          <svg key={i} width={size} height={size} viewBox="0 0 24 24">
            <defs><linearGradient id={`sg-${i}`}><stop offset={`${fill*100}%`} stopColor="#F5A623"/><stop offset={`${fill*100}%`} stopColor="transparent"/></linearGradient></defs>
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill={`url(#sg-${i})`} stroke="#F5A623" strokeWidth="1.5"/>
          </svg>
        );
      })}
      <span style={{ fontSize: 11, color:"var(--c-secondary)", marginLeft: 3 }}>{value.toFixed(1)}</span>
    </span>
  );
}

// ── Tag chip ───────────────────────────────────────────────────────────────
function Tag({ label, onRemove }: { label: string; onRemove?: () => void }) {
  const [bg, text] = tagColor(label);
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:4, padding:"3px 10px", borderRadius:999, fontSize:11, fontWeight:600, background:bg, color:text, border:`1px solid ${text}30` }}>
      {label}
      {onRemove && <button onClick={onRemove} style={{ background:"none", border:"none", cursor:"pointer", color:text, padding:0, lineHeight:1, fontSize:13 }}>×</button>}
    </span>
  );
}

// ── Value badge ────────────────────────────────────────────────────────────
function ValueBadge({ v }: { v: Perfume["value"] }) {
  const map = { "Worth it": ["#dcfce7","#166534"], "Neutral": ["#f3f4f6","#374151"], "Not worth it": ["#fee2e2","#991b1b"] };
  const [bg, text] = map[v] ?? map["Neutral"];
  return <span style={{ padding:"3px 10px", borderRadius:999, fontSize:11, fontWeight:700, background:bg, color:text }}>{v}</span>;
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function PerfumesPage() {
  const supabase = createClient();
  const [userId, setUserId] = useState<string|null>(null);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Perfume[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [activeTab, setActiveTab] = useState<TabKey>("wardrobe");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("brand_asc");
  const [selectedId, setSelectedId] = useState<string|null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [addMode, setAddMode] = useState<"perfume"|"bottle">("perfume");
  const [addContextId, setAddContextId] = useState<string|null>(null);
  const [noteManagerOpen, setNoteManagerOpen] = useState(false);
  const [weatherManagerOpen, setWeatherManagerOpen] = useState(false);
  const [globalNotes, setGlobalNotes] = useState<string[]>([]);
  const [noteInput, setNoteInput] = useState("");
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveChoice, setArchiveChoice] = useState<"Sold"|"Emptied"|"Gifted">("Emptied");
  const [removeOpen, setRemoveOpen] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [photoInput, setPhotoInput] = useState("");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timerRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Add form state
  const [af, setAf] = useState({ status:"wardrobe" as PerfumeStatus, brand:"", model:"", imageDataUrl:"", rating:4, bottleType:"Full bottle" as BottleType, sizeMl:"100", usage:"Casual", price:"0", currency:"AED", shop:"Unknown", shopLink:"", date:nowIso() });

  // Load from Supabase
  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      setUserId(user.id);
      const [pr, pur] = await Promise.all([
        supabase.from("perfumes").select("*, perfume_bottles(*)").eq("user_id", user.id).order("brand"),
        supabase.from("perfume_purchases").select("*").eq("user_id", user.id).order("date", { ascending:false }),
      ]);
      const loaded = (pr.data??[]).map(dbToItem);
      setItems(loaded);
      setPurchases((pur.data??[]).map(dbToPurchase));
      setGlobalNotes([...new Set(loaded.flatMap(x=>x.notesTags))].sort());
      setLoading(false);
    }
    load();
  }, []);

  const selected = useMemo(() => items.find(x=>x.id===selectedId)??null, [items, selectedId]);

  const tabItems = useMemo(() => {
    const statusMap: Record<TabKey, PerfumeStatus|null> = { wardrobe:"wardrobe", wishlist:"wishlist", archive:"archive", purchases:null };
    const s = statusMap[activeTab];
    if (!s) return [];
    let list = items.filter(x=>x.status===s);
    if (search.trim()) list = list.filter(x=>`${x.brand} ${x.model}`.toLowerCase().includes(search.toLowerCase()));
    return [...list].sort((a,b) => {
      if (sortBy==="brand_asc") return `${a.brand} ${a.model}`.localeCompare(`${b.brand} ${b.model}`);
      if (sortBy==="brand_desc") return `${b.brand} ${b.model}`.localeCompare(`${a.brand} ${a.model}`);
      if (sortBy==="rating_desc") return (b.ratingStars??0)-(a.ratingStars??0);
      if (sortBy==="rating_asc") return (a.ratingStars??0)-(b.ratingStars??0);
      return 0;
    });
  }, [items, activeTab, search, sortBy]);

  const counts = useMemo(() => ({
    wardrobe: items.filter(x=>x.status==="wardrobe").length,
    wishlist: items.filter(x=>x.status==="wishlist").length,
    archive: items.filter(x=>x.status==="archive").length,
  }), [items]);

  const purchaseHistory = useMemo(() => [...purchases].sort((a,b)=>b.date.localeCompare(a.date)), [purchases]);

  const last12Months = useMemo(() => {
    const today = new Date();
    const map = new Map<string,number>();
    for (const p of purchases) { if (safeNum(p.price)<=0) continue; map.set(monthKey(p.date),(map.get(monthKey(p.date))??0)+1); }
    return Array.from({length:12}).map((_,i) => { const dt = new Date(today.getFullYear(), today.getMonth()-11+i, 1); const mk=`${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}`; return {month:mk.slice(5),count:map.get(mk)??0}; });
  }, [purchases]);

  function toast(message: string, kind: ToastKind = "success") {
    const id = uid();
    setToasts(p=>[...p,{id,kind,message}]);
    timerRef.current[id] = setTimeout(()=>{setToasts(p=>p.filter(x=>x.id!==id));}, 2500);
  }

  function openDetail(id: string) { setSelectedId(id); setIsEditMode(false); setNoteManagerOpen(false); setWeatherManagerOpen(false); }
  function closeDetail() { setSelectedId(null); setIsEditMode(false); setArchiveOpen(false); setRemoveOpen(false); setPhotoOpen(false); setNoteManagerOpen(false); setWeatherManagerOpen(false); }

  async function updateItem(partial: Partial<Perfume>) {
    if (!selected) return;
    setItems(p=>p.map(x=>x.id===selected.id?{...x,...partial}:x));
    const db: Record<string,unknown> = {};
    if (partial.ratingStars!==undefined) db.rating_stars=partial.ratingStars;
    if (partial.notesTags!==undefined) db.notes_tags=partial.notesTags;
    if (partial.weatherTags!==undefined) db.weather_tags=partial.weatherTags;
    if (partial.genderScale!==undefined) db.gender_scale=partial.genderScale;
    if (partial.longevity!==undefined) db.longevity=partial.longevity;
    if (partial.sillage!==undefined) db.sillage=partial.sillage;
    if (partial.value!==undefined) db.value_rating=partial.value;
    if (partial.cloneSimilar!==undefined) db.clone_similar=partial.cloneSimilar;
    if (partial.notesText!==undefined) db.notes_text=partial.notesText;
    if (partial.imageUrl!==undefined) db.image_url=partial.imageUrl;
    if (Object.keys(db).length) await supabase.from("perfumes").update(db).eq("id",selected.id);
  }

  async function updateBottle(perfumeId: string, bottleId: string, partial: Partial<Bottle>) {
    setItems(p=>p.map(x=>x.id!==perfumeId?x:{...x,bottles:x.bottles.map(b=>b.id!==bottleId?b:{...b,...partial})}));
    const db: Record<string,unknown> = {};
    if (partial.bottleType!==undefined) db.bottle_type=partial.bottleType;
    if (partial.bottleSizeMl!==undefined) db.bottle_size_ml=partial.bottleSizeMl;
    if (partial.status!==undefined) db.status=partial.status;
    if (partial.usage!==undefined) db.usage=partial.usage;
    if (Object.keys(db).length) await supabase.from("perfume_bottles").update(db).eq("id",bottleId);
  }

  async function doAdd() {
    if (!userId) return;
    if (addMode==="perfume") {
      if (!af.brand.trim()||!af.model.trim()) { toast("Brand and model required","error"); return; }
      const { data:pd, error } = await supabase.from("perfumes").insert({ user_id:userId, brand:af.brand.trim(), model:af.model.trim(), status:af.status, image_url:af.imageDataUrl||"", rating_stars:af.rating, notes_tags:[], weather_tags:[], gender_scale:2, longevity:"Unknown", sillage:"Unknown", value_rating:"Neutral" }).select("*").single();
      if (error||!pd) { toast("Failed to save","error"); return; }
      const newItem: Perfume = { id:pd.id, status:af.status, brand:af.brand.trim(), model:af.model.trim(), imageUrl:pd.image_url, ratingStars:af.rating, notesTags:[], weatherTags:[], genderScale:2, longevity:"Unknown", sillage:"Unknown", value:"Neutral", cloneSimilar:"", notesText:"", bottles:[] };
      if (af.status==="wardrobe") {
        const size = safeNum(af.sizeMl,100);
        const { data:bd } = await supabase.from("perfume_bottles").insert({ perfume_id:pd.id, user_id:userId, bottle_size_ml:size, bottle_type:af.bottleType, status:"In collection", usage:af.usage }).select("*").single();
        if (bd) {
          newItem.bottles.push({ id:bd.id, bottleSizeMl:bd.bottle_size_ml, bottleType:bd.bottle_type, status:bd.status, usage:bd.usage });
          const price = safeNum(af.price,0);
          if (price>0 || af.shop.trim()) {
            const { data:pur } = await supabase.from("perfume_purchases").insert({ perfume_id:pd.id, bottle_id:bd.id, user_id:userId, date:af.date||nowIso(), ml:size, price, currency:af.currency, shop_name:af.shop, shop_link:af.shopLink||null }).select("*").single();
            if (pur) setPurchases(p=>[dbToPurchase(pur),...p]);
          }
        }
      }
      setItems(p=>[newItem,...p]);
      setShowAdd(false); toast("Added successfully");
    } else {
      const perfumeId = addContextId;
      if (!perfumeId) return;
      const size = safeNum(af.sizeMl,30);
      const { data:bd, error } = await supabase.from("perfume_bottles").insert({ perfume_id:perfumeId, user_id:userId, bottle_size_ml:size, bottle_type:af.bottleType, status:"In collection", usage:af.usage }).select("*").single();
      if (error||!bd) { toast("Failed","error"); return; }
      const price = safeNum(af.price,0);
      const { data:pur } = await supabase.from("perfume_purchases").insert({ perfume_id:perfumeId, bottle_id:bd.id, user_id:userId, date:af.date||nowIso(), ml:size, price, currency:af.currency, shop_name:af.shop, shop_link:af.shopLink||null }).select("*").single();
      setItems(p=>p.map(x=>x.id!==perfumeId?x:{...x,bottles:[...x.bottles,{id:bd.id,bottleSizeMl:bd.bottle_size_ml,bottleType:bd.bottle_type,status:bd.status,usage:bd.usage}]}));
      if (pur) setPurchases(p=>[dbToPurchase(pur),...p]);
      setShowAdd(false); toast("Bottle added");
    }
  }

  async function doRemove() {
    if (!selected) return;
    await supabase.from("perfumes").delete().eq("id",selected.id);
    setItems(p=>p.filter(x=>x.id!==selected.id));
    setPurchases(p=>p.filter(x=>x.perfumeId!==selected.id));
    toast("Removed"); closeDetail();
  }

  async function doArchive() {
    if (!selected||selected.status==="wishlist") { setArchiveOpen(false); return; }
    await supabase.from("perfumes").update({status:"archive",archive_reason:archiveChoice}).eq("id",selected.id);
    setItems(p=>p.map(x=>x.id===selected.id?{...x,status:"archive",archiveReason:archiveChoice}:x));
    setArchiveOpen(false); toast(`Archived as ${archiveChoice}`);
  }

  async function doAddToWishlist() {
    if (!selected||!userId) return;
    if (selected.status==="wishlist") { toast("Already in wishlist","info"); return; }
    const { data } = await supabase.from("perfumes").insert({ user_id:userId, brand:selected.brand, model:selected.model, status:"wishlist", image_url:selected.imageUrl, rating_stars:selected.ratingStars, notes_tags:selected.notesTags, weather_tags:selected.weatherTags, gender_scale:selected.genderScale, longevity:selected.longevity, sillage:selected.sillage, value_rating:selected.value, clone_similar:selected.cloneSimilar, notes_text:selected.notesText }).select("*").single();
    if (data) { setItems(p=>[...p,{...selected,id:data.id,status:"wishlist",bottles:[],archiveReason:undefined}]); toast("Added to wishlist"); }
  }

  async function shareItem() {
    if (!selected) return;
    const text = `${selected.brand} — ${selected.model}\n⭐ ${selected.ratingStars?.toFixed(1)??"n/a"}/5\n🌿 ${selected.notesTags.join(", ")||"—"}\n🌦 ${selected.weatherTags.join(", ")||"—"}\n👤 ${genderLabel(selected.genderScale)}\n⏱ ${selected.longevity}\n💨 ${selected.sillage}\n💰 ${selected.value}\n🔗 ${selected.cloneSimilar||"—"}`;
    try { await navigator.clipboard.writeText(text); toast("Copied to clipboard"); }
    catch { toast("Clipboard blocked","error"); }
  }

  function downloadCsv() {
    const header = ["Brand","Model","Status","Rating","Notes","Weather","Gender","Longevity","Sillage","Value","Clone","Price","Currency","Shop","ShopLink","ArchiveReason"];
    const rows = [header.join(",")];
    for (const it of items) {
      const pp = purchases.filter(p=>p.perfumeId===it.id);
      const p = pp[0];
      rows.push([it.brand,it.model,it.status,it.ratingStars??"",it.notesTags.join("|"),it.weatherTags.join("|"),genderLabel(it.genderScale),it.longevity,it.sillage,it.value,it.cloneSimilar,p?.price??"",p?.currency??"",p?.shopName??"",p?.shopLink??"",it.archiveReason??""].map(v=>`"${String(v).replaceAll('"','""')}"`).join(","));
    }
    const blob = new Blob([rows.join("\n")], {type:"text/csv"});
    const a = document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=`aromatica-${nowIso()}.csv`; a.click();
    toast("CSV downloaded");
  }

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key==="Escape") { closeDetail(); setShowAdd(false); } };
    window.addEventListener("keydown",h); return ()=>window.removeEventListener("keydown",h);
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────
  const isDark = typeof document!=="undefined" && document.documentElement.classList.contains("dark");

  const css = `
    .aro-page{--bg:${isDark?"#0d0f14":"#f9f8f5"};--card:${isDark?"#16191f":"#ffffff"};--border:${isDark?"rgba(255,255,255,0.07)":"rgba(0,0,0,0.07)"};--c-primary:${isDark?"#f0ede8":"#1a1a1a"};--c-secondary:${isDark?"#9ba3b2":"#6b7280"};--c-muted:${isDark?"#5c6375":"#9ca3af"};--c-accent:#F5A623;--c-accent-bg:${isDark?"rgba(245,166,35,0.12)":"rgba(245,166,35,0.1)"}; min-height:100vh; background:var(--bg); color:var(--c-primary); font-family:system-ui,sans-serif; padding:0;}
    .aro-header{padding:24px 28px 0; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;}
    .aro-title{font-size:24px; font-weight:800; letter-spacing:-0.5px;}
    .aro-title span{color:var(--c-accent); font-style:italic;}
    .aro-header-btns{display:flex;gap:8px;flex-wrap:wrap;}
    .aro-btn{padding:8px 14px;border-radius:10px;border:1px solid var(--border);background:var(--card);color:var(--c-primary);cursor:pointer;font-size:13px;font-weight:600;transition:all 0.15s;}
    .aro-btn:hover{border-color:var(--c-accent);color:var(--c-accent);}
    .aro-btn-primary{background:var(--c-accent);color:#fff;border-color:var(--c-accent);font-weight:700;}
    .aro-btn-primary:hover{background:#e09520;border-color:#e09520;color:#fff;}
    .aro-btn-danger{border-color:rgba(239,68,68,0.4);color:#ef4444;}
    .aro-btn-danger:hover{background:rgba(239,68,68,0.1);}
    .aro-tabs{padding:16px 28px 0; display:flex; gap:4px; border-bottom:1px solid var(--border);}
    .aro-tab{padding:10px 18px;border-radius:10px 10px 0 0;border:1px solid transparent;border-bottom:none;font-size:13px;font-weight:600;color:var(--c-secondary);cursor:pointer;background:none;transition:all 0.15s;display:flex;gap:6px;align-items:center;}
    .aro-tab:hover{color:var(--c-primary);}
    .aro-tab.active{background:var(--card);border-color:var(--border);color:var(--c-primary);}
    .aro-tab .cnt{font-size:11px;padding:1px 7px;border-radius:999px;background:var(--c-accent-bg);color:var(--c-accent);font-weight:700;}
    .aro-controls{padding:16px 28px;display:flex;gap:10px;flex-wrap:wrap;}
    .aro-search{flex:1;min-width:180px;padding:9px 14px;border-radius:10px;border:1px solid var(--border);background:var(--card);color:var(--c-primary);font-size:13px;outline:none;}
    .aro-search::placeholder{color:var(--c-muted);}
    .aro-select{padding:9px 14px;border-radius:10px;border:1px solid var(--border);background:var(--card);color:var(--c-primary);font-size:13px;outline:none;cursor:pointer;}
    .aro-grid{padding:0 28px 28px;display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px;}
    .aro-card{border-radius:14px;border:1px solid var(--border);background:var(--card);cursor:pointer;overflow:hidden;transition:transform 0.15s,box-shadow 0.15s,border-color 0.15s;text-align:left;}
    .aro-card:hover{transform:translateY(-2px);box-shadow:0 8px 32px rgba(0,0,0,0.12);border-color:rgba(245,166,35,0.4);}
    .aro-card-img{width:100%;height:160px;object-fit:cover;background:${isDark?"#1e2130":"#f3f4f6"};}
    .aro-card-img-placeholder{width:100%;height:160px;background:${isDark?"#1e2130":"#f0eff8"};display:flex;align-items:center;justify-content:center;font-size:36px;}
    .aro-card-body{padding:12px 14px;}
    .aro-card-brand{font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:var(--c-muted);margin-bottom:2px;}
    .aro-card-model{font-size:14px;font-weight:700;margin-bottom:8px;line-height:1.3;}
    .aro-card-footer{display:flex;align-items:center;justify-content:space-between;gap:8px;}
    .aro-status-badge{font-size:10px;font-weight:700;padding:3px 8px;border-radius:999px;text-transform:uppercase;letter-spacing:0.06em;}
    .badge-wardrobe{background:${isDark?"rgba(245,166,35,0.15)":"rgba(245,166,35,0.12)"};color:#d97706;}
    .badge-wishlist{background:${isDark?"rgba(99,102,241,0.15)":"rgba(99,102,241,0.1)"};color:#6366f1;}
    .badge-archive{background:${isDark?"rgba(107,114,128,0.2)":"rgba(107,114,128,0.1)"};color:#6b7280;}
    .aro-empty{padding:60px 28px;text-align:center;color:var(--c-muted);}
    .aro-empty-icon{font-size:48px;margin-bottom:12px;}
    .aro-empty-text{font-size:15px;font-weight:600;}
    .aro-empty-sub{font-size:13px;margin-top:6px;}
    /* Modal */
    .aro-backdrop{position:fixed;inset:0;background:rgba(0,0,0,0.6);backdrop-filter:blur(8px);z-index:100;display:flex;align-items:center;justify-content:center;padding:16px;}
    .aro-modal{width:min(960px,100%);max-height:90vh;overflow:auto;border-radius:18px;background:${isDark?"#13161c":"#ffffff"};border:1px solid var(--border);box-shadow:0 24px 80px rgba(0,0,0,0.4);position:relative;color:var(--c-primary);}
    .aro-modal-header{position:sticky;top:0;z-index:10;padding:18px 22px;border-bottom:1px solid var(--border);background:${isDark?"#13161c":"#ffffff"};display:flex;justify-content:space-between;align-items:flex-start;gap:12px;}
    .aro-modal-title{font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:var(--c-muted);margin-bottom:4px;}
    .aro-modal-name{font-size:22px;font-weight:800;letter-spacing:-0.5px;}
    .aro-modal-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;align-items:center;flex-shrink:0;}
    .aro-modal-body{display:grid;grid-template-columns:280px 1fr;gap:0;}
    .aro-modal-left{padding:20px;border-right:1px solid var(--border);}
    .aro-modal-right{padding:20px;display:flex;flex-direction:column;gap:20px;}
    .aro-modal-img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:12px;background:${isDark?"#1e2130":"#f0eff8"};}
    .aro-modal-img-placeholder{width:100%;aspect-ratio:1;border-radius:12px;background:${isDark?"#1e2130":"#f0eff8"};display:flex;align-items:center;justify-content:center;font-size:64px;}
    .aro-section{background:${isDark?"rgba(255,255,255,0.03)":"rgba(0,0,0,0.02)"};border:1px solid var(--border);border-radius:12px;padding:14px 16px;}
    .aro-section-title{font-size:10px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:var(--c-muted);margin-bottom:10px;}
    .aro-field{margin-bottom:12px;}
    .aro-field:last-child{margin-bottom:0;}
    .aro-field-label{font-size:11px;font-weight:700;color:var(--c-muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:0.06em;}
    .aro-field-value{font-size:13px;font-weight:600;color:var(--c-primary);}
    .aro-field-value.muted{color:var(--c-muted);}
    .aro-input{width:100%;padding:8px 12px;border-radius:8px;border:1px solid var(--border);background:${isDark?"#1e2130":"#f9fafb"};color:var(--c-primary);font-size:13px;outline:none;}
    .aro-input:focus{border-color:var(--c-accent);}
    .aro-textarea{width:100%;padding:8px 12px;border-radius:8px;border:1px solid var(--border);background:${isDark?"#1e2130":"#f9fafb"};color:var(--c-primary);font-size:13px;outline:none;resize:vertical;min-height:80px;}
    .aro-select-inline{width:100%;padding:8px 12px;border-radius:8px;border:1px solid var(--border);background:${isDark?"#1e2130":"#f9fafb"};color:var(--c-primary);font-size:13px;outline:none;}
    .aro-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;}
    .aro-grid-2{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
    .aro-tags{display:flex;flex-wrap:wrap;gap:6px;}
    .aro-star-row{display:flex;gap:2px;}
    .aro-star-btn{background:none;border:none;cursor:pointer;padding:2px;font-size:18px;line-height:1;transition:transform 0.1s;}
    .aro-star-btn:hover{transform:scale(1.2);}
    .aro-gender-slider{display:flex;gap:10px;align-items:center;}
    .aro-gender-slider input{flex:1;}
    .aro-gender-label{font-size:12px;font-weight:600;color:var(--c-secondary);white-space:nowrap;min-width:90px;}
    .aro-table{border-radius:10px;overflow:hidden;border:1px solid var(--border);}
    .aro-table-head{display:grid;padding:8px 12px;background:${isDark?"rgba(255,255,255,0.04)":"rgba(0,0,0,0.04)"};font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;color:var(--c-muted);}
    .aro-table-row{display:grid;padding:10px 12px;border-top:1px solid var(--border);font-size:13px;font-weight:600;}
    .aro-table-cols-4{grid-template-columns:1.2fr 0.7fr 0.9fr 1.5fr;}
    .aro-table-cols-4p{grid-template-columns:0.9fr 0.6fr 0.9fr 1.4fr;}
    .aro-mini-input{width:100%;padding:5px 8px;border-radius:6px;border:1px solid var(--border);background:${isDark?"#1e2130":"#f9fafb"};color:var(--c-primary);font-size:12px;outline:none;}
    .aro-mini-select{width:100%;padding:5px 8px;border-radius:6px;border:1px solid var(--border);background:${isDark?"#1e2130":"#f9fafb"};color:var(--c-primary);font-size:12px;outline:none;}
    .aro-inline-prompt{position:absolute;inset:0;background:rgba(0,0,0,0.5);border-radius:18px;display:flex;align-items:center;justify-content:center;padding:20px;}
    .aro-prompt-box{background:${isDark?"#1a1d25":"#ffffff"};border:1px solid var(--border);border-radius:14px;padding:20px;width:min(480px,100%);box-shadow:0 20px 60px rgba(0,0,0,0.3);}
    .aro-prompt-title{font-size:16px;font-weight:800;margin-bottom:6px;}
    .aro-prompt-sub{font-size:13px;color:var(--c-secondary);margin-bottom:14px;}
    .aro-prompt-btns{display:flex;gap:8px;justify-content:flex-end;margin-top:14px;}
    .aro-radio-group{display:flex;gap:8px;flex-wrap:wrap;}
    .aro-radio{display:flex;gap:6px;align-items:center;padding:8px 14px;border-radius:8px;border:1px solid var(--border);background:${isDark?"#1e2130":"#f9fafb"};font-size:13px;font-weight:600;cursor:pointer;}
    .aro-tag-picker{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0;}
    .aro-tag-opt{padding:6px 12px;border-radius:999px;border:1px solid var(--border);background:${isDark?"#1e2130":"#f3f4f6"};color:var(--c-primary);cursor:pointer;font-size:12px;font-weight:600;transition:all 0.1s;}
    .aro-tag-opt.sel{background:var(--c-accent);border-color:var(--c-accent);color:#fff;}
    .aro-tag-adder{display:flex;gap:8px;margin-top:10px;}
    /* Purchases tab */
    .aro-purchases{padding:20px 28px;display:flex;flex-direction:column;gap:16px;}
    .aro-chart-panel{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:16px;}
    .aro-chart-title{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.1em;color:var(--c-muted);margin-bottom:12px;}
    .aro-purchase-list{background:var(--card);border:1px solid var(--border);border-radius:14px;overflow:hidden;}
    .aro-purchase-row{display:grid;grid-template-columns:1fr 0.6fr 0.8fr 1.2fr;gap:8px;padding:12px 16px;border-bottom:1px solid var(--border);font-size:13px;align-items:center;}
    .aro-purchase-row:last-child{border-bottom:none;}
    .aro-purchase-head{background:${isDark?"rgba(255,255,255,0.04)":"rgba(0,0,0,0.03)"};font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;color:var(--c-muted);}
    .aro-link{color:var(--c-accent);text-decoration:none;font-weight:600;}
    .aro-link:hover{text-decoration:underline;}
    /* Add modal */
    .aro-add-modal{width:min(640px,100%);}
    .aro-add-form{padding:20px;display:grid;grid-template-columns:1fr 1fr;gap:14px;}
    .aro-add-label{display:flex;flex-direction:column;gap:5px;font-size:12px;font-weight:700;color:var(--c-secondary);text-transform:uppercase;letter-spacing:0.06em;}
    .aro-add-actions{padding:0 20px 20px;display:flex;justify-content:flex-end;gap:8px;}
    /* Toast */
    .aro-toasts{position:fixed;right:16px;bottom:20px;display:flex;flex-direction:column;gap:8px;z-index:200;}
    .aro-toast{padding:12px 16px;border-radius:10px;font-size:13px;font-weight:700;max-width:320px;box-shadow:0 8px 24px rgba(0,0,0,0.25);border:1px solid rgba(255,255,255,0.1);}
    .aro-toast-success{background:#1a3a2a;color:#4ade80;border-color:rgba(74,222,128,0.3);}
    .aro-toast-error{background:#3a1a1a;color:#f87171;border-color:rgba(248,113,113,0.3);}
    .aro-toast-info{background:#1a2a3a;color:#60a5fa;border-color:rgba(96,165,250,0.3);}
    @media(max-width:700px){
      .aro-modal-body{grid-template-columns:1fr;}
      .aro-modal-left{border-right:none;border-bottom:1px solid var(--border);padding-bottom:16px;}
      .aro-grid{grid-template-columns:repeat(auto-fill,minmax(150px,1fr));padding:0 16px 16px;}
      .aro-header{padding:16px 16px 0;}
      .aro-tabs{padding:12px 16px 0;}
      .aro-controls{padding:12px 16px;}
      .aro-purchases{padding:16px;}
      .aro-add-form{grid-template-columns:1fr;}
      .aro-purchase-row{grid-template-columns:1fr 0.7fr;}
    }
  `;

  const tabStatusMap: Record<TabKey, PerfumeStatus|null> = { wardrobe:"wardrobe", wishlist:"wishlist", archive:"archive", purchases:null };

  return (
    <div className="aro-page">
      <style>{css}</style>

      {/* Header */}
      <div className="aro-header">
        <div className="aro-title">Aroma<span>tica</span></div>
        <div className="aro-header-btns">
          <button className="aro-btn" onClick={downloadCsv}>Export CSV</button>
          <button className="aro-btn aro-btn-primary" onClick={() => { setAddMode("perfume"); setAddContextId(null); setAf(f=>({...f,status:tabStatusMap[activeTab]??"wardrobe",brand:"",model:"",imageDataUrl:"",rating:4,bottleType:"Full bottle",sizeMl:"100",usage:"Casual",price:"0",shop:"Unknown",shopLink:"",date:nowIso()})); setShowAdd(true); }}>+ Add</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="aro-tabs">
        {([["wardrobe","Wardrobe",counts.wardrobe],["wishlist","Wishlist",counts.wishlist],["archive","Archive",counts.archive],["purchases","Purchases",null]] as const).map(([key,label,count]) => (
          <button key={key} className={`aro-tab${activeTab===key?" active":""}`} onClick={()=>setActiveTab(key as TabKey)}>
            {label}
            {count!==null && count>0 && <span className="cnt">{count}</span>}
          </button>
        ))}
      </div>

      {/* Controls */}
      {activeTab!=="purchases" && (
        <div className="aro-controls">
          <input className="aro-search" placeholder="Search brand or name…" value={search} onChange={e=>setSearch(e.target.value)} />
          <select className="aro-select" value={sortBy} onChange={e=>setSortBy(e.target.value)}>
            <option value="brand_asc">Brand A–Z</option>
            <option value="brand_desc">Brand Z–A</option>
            <option value="rating_desc">Rating ↓</option>
            <option value="rating_asc">Rating ↑</option>
          </select>
        </div>
      )}

      {/* Grid */}
      {activeTab!=="purchases" && (
        loading ? (
          <div style={{padding:"60px 28px",textAlign:"center",color:"var(--c-muted)"}}>Loading your collection…</div>
        ) : tabItems.length===0 ? (
          <div className="aro-empty">
            <div className="aro-empty-icon">🌿</div>
            <div className="aro-empty-text">{items.length===0?"Your collection is empty":search?"No results found":"Nothing here yet"}</div>
            <div className="aro-empty-sub">{items.length===0?"Click + Add to get started":""}</div>
          </div>
        ) : (
          <div className="aro-grid">
            {tabItems.map(item => (
              <button key={item.id} className="aro-card" onClick={()=>openDetail(item.id)}>
                {item.imageUrl ? <img className="aro-card-img" src={item.imageUrl} alt="" /> : <div className="aro-card-img-placeholder">🌸</div>}
                <div className="aro-card-body">
                  <div className="aro-card-brand">{item.brand}</div>
                  <div className="aro-card-model">{item.model}</div>
                  <div className="aro-card-footer">
                    <Stars value={item.ratingStars} size={12} />
                    <span className={`aro-status-badge badge-${item.status}`}>{item.status}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )
      )}

      {/* Purchases tab */}
      {activeTab==="purchases" && (
        <div className="aro-purchases">
          <div className="aro-chart-panel">
            <div className="aro-chart-title">Paid purchases — last 12 months</div>
            <MiniBarChart data={last12Months} />
          </div>
          <div className="aro-purchase-list">
            <div className="aro-purchase-row aro-purchase-head"><div>Perfume</div><div>Price</div><div>Date</div><div>Shop</div></div>
            {purchaseHistory.length===0 && <div style={{padding:"24px",textAlign:"center",color:"var(--c-muted)",fontSize:13}}>No purchases yet.</div>}
            {purchaseHistory.slice(0,50).map(p => {
              const perf = items.find(x=>x.id===p.perfumeId);
              return (
                <div key={p.id} className="aro-purchase-row">
                  <div style={{fontWeight:700,fontSize:13}}>{perf?`${perf.brand} ${perf.model}`:"Unknown"}</div>
                  <div style={{fontWeight:600}}>{p.price>0?fmtMoney(p.currency,p.price):<span style={{color:"var(--c-muted)"}}>Free</span>}</div>
                  <div style={{color:"var(--c-secondary)",fontSize:12}}>{p.date}</div>
                  <div>{p.shopLink?<a className="aro-link" href={p.shopLink} target="_blank" rel="noreferrer">{p.shopName}</a>:<span style={{color:"var(--c-secondary)"}}>{p.shopName}</span>}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Detail modal */}
      {selected && (
        <div className="aro-backdrop" onMouseDown={closeDetail}>
          <div className="aro-modal" onMouseDown={e=>e.stopPropagation()}>
            <div className="aro-modal-header">
              <div>
                <div className="aro-modal-title">{selected.brand}</div>
                <div className="aro-modal-name">{selected.model}</div>
                <div style={{marginTop:6}}><Stars value={selected.ratingStars} /></div>
              </div>
              <div className="aro-modal-actions">
                <button className="aro-btn" onClick={shareItem}>Share</button>
                <button className="aro-btn" onClick={()=>setIsEditMode(v=>!v)} style={isEditMode?{borderColor:"var(--c-accent)",color:"var(--c-accent)"}:{}}>{isEditMode?"✓ Done":"Edit"}</button>
                <button className="aro-btn" onClick={doAddToWishlist} disabled={selected.status==="wishlist"}>+ Wishlist</button>
                {selected.status!=="wishlist"&&<button className="aro-btn" onClick={()=>{setArchiveChoice("Emptied");setArchiveOpen(true);}}>Archive</button>}
                <button className="aro-btn aro-btn-danger" onClick={()=>setRemoveOpen(true)}>Remove</button>
                <button className="aro-btn" onClick={closeDetail} style={{fontWeight:800}}>✕</button>
              </div>
            </div>

            <div className="aro-modal-body">
              {/* Left */}
              <div className="aro-modal-left">
                {selected.imageUrl
                  ? <img className="aro-modal-img" src={selected.imageUrl} alt="" />
                  : <div className="aro-modal-img-placeholder">🌸</div>
                }
                <button className="aro-btn" style={{width:"100%",marginTop:10,textAlign:"center"}} onClick={()=>{setPhotoInput(selected.imageUrl);setPhotoOpen(true);}}>Change photo</button>

                <div style={{marginTop:16}} className="aro-section">
                  <div className="aro-section-title">Rating</div>
                  {!isEditMode ? <Stars value={selected.ratingStars} size={18} /> : (
                    <div className="aro-star-row">
                      {[1,2,3,4,5].map(s=>(
                        <button key={s} className="aro-star-btn" onClick={()=>updateItem({ratingStars:s})}>
                          <span style={{color:s<=(selected.ratingStars??0)?"#F5A623":"var(--c-border)",fontSize:22}}>★</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{marginTop:10}} className="aro-section">
                  <div className="aro-section-title">Gender</div>
                  <div className="aro-gender-slider">
                    <input type="range" min={0} max={4} step={1} value={selected.genderScale} onChange={e=>{if(isEditMode)updateItem({genderScale:Number(e.target.value) as GenderScale});}} style={{flex:1}} />
                    <span className="aro-gender-label">{genderLabel(selected.genderScale)}</span>
                  </div>
                </div>

                {selected.status==="archive" && (
                  <div style={{marginTop:10}} className="aro-section">
                    <div className="aro-section-title">Archive reason</div>
                    <div className="aro-field-value">{selected.archiveReason??"Unknown"}</div>
                  </div>
                )}
              </div>

              {/* Right */}
              <div className="aro-modal-right">
                {/* Tags */}
                <div className="aro-section">
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                    <div className="aro-section-title" style={{margin:0}}>Notes tags</div>
                    {isEditMode&&<button className="aro-btn" style={{padding:"4px 10px",fontSize:12}} onClick={()=>setNoteManagerOpen(true)}>Manage</button>}
                  </div>
                  {selected.notesTags.length===0 ? <span style={{fontSize:12,color:"var(--c-muted)"}}>No tags set</span> : (
                    <div className="aro-tags">{selected.notesTags.map(t=><Tag key={t} label={t} onRemove={isEditMode?()=>updateItem({notesTags:selected.notesTags.filter(x=>x!==t)}):undefined} />)}</div>
                  )}
                </div>

                {/* Weather */}
                <div className="aro-section">
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                    <div className="aro-section-title" style={{margin:0}}>Weather</div>
                    {isEditMode&&<button className="aro-btn" style={{padding:"4px 10px",fontSize:12}} onClick={()=>setWeatherManagerOpen(true)}>Manage</button>}
                  </div>
                  {selected.weatherTags.length===0 ? <span style={{fontSize:12,color:"var(--c-muted)"}}>Not set</span> : (
                    <div className="aro-tags">{selected.weatherTags.map(w=><Tag key={w} label={w} />)}</div>
                  )}
                </div>

                {/* Core details */}
                <div className="aro-section">
                  <div className="aro-section-title">Details</div>
                  <div className="aro-grid-2">
                    {([["Longevity","longevity"],["Sillage","sillage"],["Clone / similar","cloneSimilar"]] as const).map(([label,key])=>(
                      <div key={key} className="aro-field">
                        <div className="aro-field-label">{label}</div>
                        {!isEditMode
                          ? <div className={`aro-field-value${!(selected as unknown as Record<string,unknown>)[key]?" muted":""}`}>{(selected as unknown as Record<string,unknown>)[key] as string||"—"}</div>
                          : <input className="aro-input" value={(selected as unknown as Record<string,unknown>)[key] as string||""} onChange={e=>updateItem({[key]:e.target.value})} />
                        }
                      </div>
                    ))}
                    <div className="aro-field">
                      <div className="aro-field-label">Value</div>
                      {!isEditMode ? <ValueBadge v={selected.value} /> : (
                        <select className="aro-select-inline" value={selected.value} onChange={e=>updateItem({value:e.target.value as Perfume["value"]})}>
                          <option>Worth it</option><option>Neutral</option><option>Not worth it</option>
                        </select>
                      )}
                    </div>
                  </div>
                  <div style={{marginTop:12}}>
                    <div className="aro-field-label">Notes</div>
                    {!isEditMode
                      ? <div className="aro-field-value" style={{lineHeight:1.6,whiteSpace:"pre-wrap"}}>{selected.notesText||<span style={{color:"var(--c-muted)"}}>No notes yet</span>}</div>
                      : <textarea className="aro-textarea" value={selected.notesText} onChange={e=>updateItem({notesText:e.target.value})} placeholder="Your thoughts…" />
                    }
                  </div>
                </div>

                {/* Bottles */}
                <div className="aro-section">
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                    <div className="aro-section-title" style={{margin:0}}>Bottles</div>
                    <button className="aro-btn" style={{padding:"4px 10px",fontSize:12}} onClick={()=>{setAddMode("bottle");setAddContextId(selected.id);setAf(f=>({...f,bottleType:"Decant",sizeMl:"30",usage:"Casual",price:"0",shop:"Unknown",shopLink:"",date:nowIso()}));setShowAdd(true);}}>+ Add</button>
                  </div>
                  {selected.bottles.length===0 ? <span style={{fontSize:12,color:"var(--c-muted)"}}>No bottles recorded</span> : (
                    <div className="aro-table">
                      <div className="aro-table-head aro-table-cols-4"><div>Type</div><div>Size</div><div>Status</div><div>Usage</div></div>
                      {selected.bottles.map(b=>(
                        <div key={b.id} className="aro-table-row aro-table-cols-4">
                          <div>{!isEditMode?b.bottleType:<select className="aro-mini-select" value={b.bottleType} onChange={e=>updateBottle(selected.id,b.id,{bottleType:e.target.value as BottleType})}><option>Full bottle</option><option>Decant</option><option>Sample</option><option>Tester</option></select>}</div>
                          <div>{!isEditMode?`${b.bottleSizeMl}ml`:<input className="aro-mini-input" style={{maxWidth:70}} value={b.bottleSizeMl} onChange={e=>updateBottle(selected.id,b.id,{bottleSizeMl:safeNum(e.target.value,0)})} />}</div>
                          <div>{!isEditMode?b.status:<select className="aro-mini-select" value={b.status} onChange={e=>updateBottle(selected.id,b.id,{status:e.target.value as BottleStatus})}><option>In collection</option><option>Emptied</option><option>Sold</option><option>Gifted</option></select>}</div>
                          <div>{!isEditMode?<span style={{fontSize:12,color:"var(--c-secondary)"}}>{b.usage}</span>:<input className="aro-mini-input" value={b.usage} onChange={e=>updateBottle(selected.id,b.id,{usage:e.target.value})} />}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Purchase history */}
                <div className="aro-section">
                  <div className="aro-section-title">Purchase history</div>
                  {(() => {
                    const list = purchases.filter(p=>p.perfumeId===selected.id).sort((a,b)=>b.date.localeCompare(a.date));
                    if (list.length===0) return <span style={{fontSize:12,color:"var(--c-muted)"}}>No purchases recorded</span>;
                    return (
                      <div className="aro-table">
                        <div className="aro-table-head aro-table-cols-4p"><div>Date</div><div>ML</div><div>Price</div><div>Shop</div></div>
                        {list.map(p=>(
                          <div key={p.id} className="aro-table-row aro-table-cols-4p">
                            <div style={{fontSize:12}}>{p.date}</div>
                            <div style={{fontSize:12}}>{p.ml||"—"}</div>
                            <div style={{fontWeight:700}}>{p.price>0?fmtMoney(p.currency,p.price):<span style={{color:"var(--c-muted)"}}>Free</span>}</div>
                            <div>{p.shopLink?<a className="aro-link" href={p.shopLink} target="_blank" rel="noreferrer">{p.shopName}</a>:<span style={{fontSize:12,color:"var(--c-secondary)"}}>{p.shopName}</span>}</div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>

            {/* Prompts */}
            {removeOpen && <div className="aro-inline-prompt"><div className="aro-prompt-box"><div className="aro-prompt-title">Remove this perfume?</div><div className="aro-prompt-sub">This will permanently delete {selected.brand} {selected.model} and all its purchase records.</div><div className="aro-prompt-btns"><button className="aro-btn" onClick={()=>setRemoveOpen(false)}>Cancel</button><button className="aro-btn aro-btn-danger" onClick={doRemove}>Remove</button></div></div></div>}
            {archiveOpen && selected.status!=="wishlist" && <div className="aro-inline-prompt"><div className="aro-prompt-box"><div className="aro-prompt-title">Move to archive</div><div className="aro-prompt-sub">What happened to this one?</div><div className="aro-radio-group">{(["Sold","Emptied","Gifted"] as const).map(r=><label key={r} className="aro-radio"><input type="radio" checked={archiveChoice===r} onChange={()=>setArchiveChoice(r)} />{r}</label>)}</div><div className="aro-prompt-btns"><button className="aro-btn" onClick={()=>setArchiveOpen(false)}>Cancel</button><button className="aro-btn aro-btn-primary" onClick={doArchive}>Archive</button></div></div></div>}
            {photoOpen && <div className="aro-inline-prompt"><div className="aro-prompt-box"><div className="aro-prompt-title">Change photo</div><div className="aro-prompt-sub">Paste an image URL or a direct link to any image.</div><input className="aro-input" value={photoInput} onChange={e=>setPhotoInput(e.target.value)} placeholder="https://…" style={{marginBottom:4}} /><div className="aro-prompt-btns"><button className="aro-btn" onClick={()=>setPhotoOpen(false)}>Cancel</button><button className="aro-btn aro-btn-primary" onClick={async()=>{await updateItem({imageUrl:photoInput.trim()});setPhotoOpen(false);toast("Photo updated");}}>Apply</button></div></div></div>}
            {noteManagerOpen && <div className="aro-inline-prompt"><div className="aro-prompt-box"><div className="aro-prompt-title">Notes tags</div><div className="aro-prompt-sub">Tap to toggle. Add new tags to your global list.</div><div className="aro-tag-picker">{globalNotes.map(t=><button key={t} className={`aro-tag-opt${selected.notesTags.includes(t)?" sel":""}`} onClick={()=>updateItem({notesTags:selected.notesTags.includes(t)?selected.notesTags.filter(x=>x!==t):[...selected.notesTags,t]})}>{t}</button>)}</div><div className="aro-tag-adder"><input className="aro-input" value={noteInput} onChange={e=>setNoteInput(e.target.value)} placeholder="New tag…" /><button className="aro-btn aro-btn-primary" onClick={()=>{const v=noteInput.trim();if(!v||globalNotes.includes(v))return;setGlobalNotes(p=>[...p,v].sort());setNoteInput("");toast("Tag added");}}>Add</button></div><div className="aro-prompt-btns"><button className="aro-btn aro-btn-primary" onClick={()=>setNoteManagerOpen(false)}>Done</button></div></div></div>}
            {weatherManagerOpen && <div className="aro-inline-prompt"><div className="aro-prompt-box"><div className="aro-prompt-title">Weather</div><div className="aro-tag-picker">{(["Cold","Neutral","Hot"] as const).map(w=><button key={w} className={`aro-tag-opt${selected.weatherTags.includes(w)?" sel":""}`} onClick={()=>updateItem({weatherTags:selected.weatherTags.includes(w)?selected.weatherTags.filter(x=>x!==w):[...selected.weatherTags,w] as ("Cold"|"Neutral"|"Hot")[]})}>{w}</button>)}</div><div className="aro-prompt-btns"><button className="aro-btn aro-btn-primary" onClick={()=>setWeatherManagerOpen(false)}>Done</button></div></div></div>}
          </div>
        </div>
      )}

      {/* Add modal */}
      {showAdd && (
        <div className="aro-backdrop" onMouseDown={()=>setShowAdd(false)}>
          <div className={`aro-modal aro-add-modal`} onMouseDown={e=>e.stopPropagation()}>
            <div className="aro-modal-header">
              <div><div className="aro-modal-title">New entry</div><div className="aro-modal-name">{addMode==="bottle"?"Add bottle / decant":"Add perfume"}</div></div>
              <div className="aro-modal-actions"><button className="aro-btn" onClick={()=>setShowAdd(false)}>✕</button></div>
            </div>
            <div className="aro-add-form">
              {addMode==="perfume" && <>
                <label className="aro-add-label">Collection<select className="aro-select-inline" value={af.status} onChange={e=>setAf(f=>({...f,status:e.target.value as PerfumeStatus}))}><option value="wardrobe">Wardrobe</option><option value="wishlist">Wishlist</option><option value="archive">Archive</option></select></label>
                <label className="aro-add-label">Brand <input className="aro-input" value={af.brand} onChange={e=>setAf(f=>({...f,brand:e.target.value}))} placeholder="e.g. Lattafa" /></label>
                <label className="aro-add-label">Model <input className="aro-input" value={af.model} onChange={e=>setAf(f=>({...f,model:e.target.value}))} placeholder="e.g. Asad" /></label>
                <label className="aro-add-label">Rating
                  <div className="aro-star-row">{[1,2,3,4,5].map(s=><button key={s} className="aro-star-btn" onClick={()=>setAf(f=>({...f,rating:s}))}><span style={{color:s<=af.rating?"#F5A623":"var(--c-muted)",fontSize:22}}>★</span></button>)}</div>
                </label>
                <label className="aro-add-label" style={{gridColumn:"1/-1"}}>Image URL <input className="aro-input" value={af.imageDataUrl} onChange={e=>setAf(f=>({...f,imageDataUrl:e.target.value}))} placeholder="https://… (optional)" /></label>
              </>}
              {addMode==="bottle" && <div style={{gridColumn:"1/-1",padding:"0 0 4px",fontSize:13,color:"var(--c-secondary)"}}>{af.brand} {af.model}</div>}
              <label className="aro-add-label">Type <select className="aro-select-inline" value={af.bottleType} onChange={e=>setAf(f=>({...f,bottleType:e.target.value as BottleType}))}><option>Full bottle</option><option>Decant</option><option>Sample</option><option>Tester</option></select></label>
              <label className="aro-add-label">Size (ml) <input className="aro-input" value={af.sizeMl} onChange={e=>setAf(f=>({...f,sizeMl:e.target.value}))} /></label>
              <label className="aro-add-label">Usage <input className="aro-input" value={af.usage} onChange={e=>setAf(f=>({...f,usage:e.target.value}))} placeholder="Office . Party" /></label>
              <label className="aro-add-label">Purchase date <input className="aro-input" type="date" value={af.date} onChange={e=>setAf(f=>({...f,date:e.target.value}))} /></label>
              <label className="aro-add-label">Price <input className="aro-input" value={af.price} onChange={e=>setAf(f=>({...f,price:e.target.value}))} /></label>
              <label className="aro-add-label">Currency <select className="aro-select-inline" value={af.currency} onChange={e=>setAf(f=>({...f,currency:e.target.value}))}><option>AED</option><option>USD</option><option>INR</option><option>GBP</option><option>EUR</option></select></label>
              <label className="aro-add-label">Shop <input className="aro-input" value={af.shop} onChange={e=>setAf(f=>({...f,shop:e.target.value}))} /></label>
              <label className="aro-add-label">Shop link <input className="aro-input" value={af.shopLink} onChange={e=>setAf(f=>({...f,shopLink:e.target.value}))} placeholder="https://… (optional)" /></label>
            </div>
            <div className="aro-add-actions">
              <button className="aro-btn" onClick={()=>setShowAdd(false)}>Cancel</button>
              <button className="aro-btn aro-btn-primary" onClick={doAdd}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Toasts */}
      <div className="aro-toasts">
        {toasts.map(t=><div key={t.id} className={`aro-toast aro-toast-${t.kind}`}>{t.message}</div>)}
      </div>
    </div>
  );
}

// ── Mini bar chart ─────────────────────────────────────────────────────────
function MiniBarChart({ data }: { data: { month: string; count: number }[] }) {
  const max = Math.max(...data.map(d=>d.count), 1);
  return (
    <div style={{ display:"flex", gap:6, alignItems:"flex-end", height:80, padding:"0 4px" }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
          <div style={{ fontSize:9, color:"var(--c-muted)", fontWeight:700 }}>{d.count>0?d.count:""}</div>
          <div style={{ width:"100%", background:d.count>0?"#F5A623":"var(--border)", borderRadius:4, height:Math.max(4,(d.count/max)*52), transition:"height 0.3s" }} />
          <div style={{ fontSize:9, color:"var(--c-muted)", whiteSpace:"nowrap" }}>{d.month}</div>
        </div>
      ))}
    </div>
  );
}
