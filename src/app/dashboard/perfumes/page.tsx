"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type TabKey = "wardrobe" | "wishlist" | "archive" | "purchase_history";
type PerfumeStatus = "wardrobe" | "wishlist" | "archive";
type BottleType = "Full bottle" | "Decant" | "Sample" | "Tester";
type BottleStatus = "In collection" | "Emptied" | "Sold" | "Gifted";
type GenderScale = 0 | 1 | 2 | 3 | 4;
type ToastKind = "success" | "error" | "info";
type AddFormMode = "perfume" | "bottle";

type Bottle = { id: string; bottleSizeMl: number; bottleType: BottleType; status: BottleStatus; usage: string; };
type Purchase = { id: string; perfumeId: string; bottleId: string; date: string; ml: number; price: number; currency: string; shopName: string; shopLink?: string; };
type AromaticaItem = {
  id: string; status: PerfumeStatus; brand: string; model: string; imageUrl: string;
  ratingStars: number | null; notesTags: string[]; weatherTags: ("Cold"|"Neutral"|"Hot")[];
  genderScale: GenderScale; longevity: string; sillage: string;
  value: "Worth it" | "Neutral" | "Not worth it"; cloneSimilar: string; notesText: string;
  bottles: Bottle[]; archiveReason?: "Sold" | "Emptied" | "Gifted";
};
type Toast = { id: string; kind: ToastKind; message: string; };
type AddForm = {
  mode: AddFormMode; status: PerfumeStatus; brand: string; model: string; imageDataUrl: string;
  ratingStars: number; bottleType: BottleType; bottleSizeMl: string; usage: string;
  price: string; currency: string; shopName: string; shopLink: string; purchaseDate: string;
  contextPerfumeId?: string;
};

function uid(p = "id") { return `${p}-${Math.random().toString(16).slice(2)}-${Date.now()}`; }
function safeNum(x: unknown, fb = 0) { const n = typeof x === "number" ? x : Number(x); return Number.isFinite(n) ? n : fb; }
function displayKey(i: AromaticaItem) { return `${i.brand} ${i.model}`.toLowerCase(); }
function uniq(a: string[]) { return Array.from(new Set(a)); }
function fmtMoney(c: string, a: number) { return `${c} ${a.toFixed(2)}`; }
function monthKey(d: string) { return d.slice(0, 7); }
function nowIso() { return new Date().toISOString().slice(0, 10); }
function addDays(d: string, n: number) { const [y,m,dd] = d.split("-").map(Number); const dt = new Date(y,m-1,dd); dt.setDate(dt.getDate()+n); return dt.toISOString().slice(0,10); }
function withinRange(d: string, s: string, e: string) { return d >= s && d <= e; }
function genderLabel(v: GenderScale) { return ["Masculine","Lean masculine","Unisex","Lean feminine","Feminine"][v]; }
function toCsvValue(v: unknown) { const s = String(v ?? ""); return `"${s.replaceAll('"','""')}"`; }
function tagStyleClass(t: string) { const p=["tagA","tagB","tagC","tagD","tagE","tagF"]; let h=0; for(let i=0;i<t.length;i++) h=(h*31+t.charCodeAt(i))>>>0; return p[h%p.length]; }
function ratingText(r: number|null) { return r ? `${r.toFixed(1)} ★` : "No rating"; }
function clampRating(n: number) { return Math.max(1, Math.min(5, n)); }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dbToItem(row: any): AromaticaItem {
  return {
    id: row.id, status: row.status ?? "wardrobe", brand: row.brand ?? "", model: row.model ?? "",
    imageUrl: row.image_url || "https://images.pexels.com/photos/965989/pexels-photo-965989.jpeg?auto=compress&cs=tinysrgb&w=900",
    ratingStars: row.rating_stars ?? null, notesTags: row.notes_tags ?? [], weatherTags: row.weather_tags ?? [],
    genderScale: (row.gender_scale ?? 2) as GenderScale, longevity: row.longevity ?? "Unknown",
    sillage: row.sillage ?? "Unknown", value: (row.value_rating ?? "Neutral") as AromaticaItem["value"],
    cloneSimilar: row.clone_similar ?? "", notesText: row.notes_text ?? "",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bottles: (row.perfume_bottles ?? []).map((b: any) => ({ id: b.id, bottleSizeMl: b.bottle_size_ml ?? 100, bottleType: b.bottle_type ?? "Full bottle", status: b.status ?? "In collection", usage: b.usage ?? "" })),
    archiveReason: row.archive_reason ?? undefined,
  };
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dbToPurchase(p: any): Purchase {
  return { id: p.id, perfumeId: p.perfume_id, bottleId: p.bottle_id ?? "none", date: p.date, ml: p.ml ?? 0, price: p.price ?? 0, currency: p.currency ?? "AED", shopName: p.shop_name ?? "Unknown", shopLink: p.shop_link ?? undefined };
}

export default function PerfumesPage() {
  const supabase = createClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [dbLoading, setDbLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>("wardrobe");
  const [theme, setTheme] = useState<"dark"|"light">("dark");
  const [items, setItems] = useState<AromaticaItem[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [search, setSearch] = useState("");
  const [usageFilter, setUsageFilter] = useState("all");
  const [sortBy, setSortBy] = useState("brand_asc");
  const [selectedId, setSelectedId] = useState<string|null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [addForm, setAddForm] = useState<AddForm>({ mode:"perfume", status:"wardrobe", brand:"", model:"", imageDataUrl:"", ratingStars:4, bottleType:"Full bottle", bottleSizeMl:"100", usage:"Office . Casual", price:"0", currency:"AED", shopName:"Unknown", shopLink:"", purchaseDate:nowIso() });
  const [globalNotes, setGlobalNotes] = useState<string[]>([]);
  const [noteManagerOpen, setNoteManagerOpen] = useState(false);
  const [weatherManagerOpen, setWeatherManagerOpen] = useState(false);
  const [noteInput, setNoteInput] = useState("");
  const [isArchivePromptOpen, setIsArchivePromptOpen] = useState(false);
  const [archiveChoice, setArchiveChoice] = useState<"Sold"|"Emptied"|"Gifted">("Emptied");
  const [isRemovePromptOpen, setIsRemovePromptOpen] = useState(false);
  const [isPhotoPromptOpen, setIsPhotoPromptOpen] = useState(false);
  const [photoUrlInput, setPhotoUrlInput] = useState("");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    const isDark = document.documentElement.classList.contains("dark");
    setTheme(isDark ? "dark" : "light");
    const obs = new MutationObserver(() => setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light"));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setDbLoading(false); return; }
      setUserId(user.id);
      const [pr, pur] = await Promise.all([
        supabase.from("perfumes").select("*, perfume_bottles(*)").eq("user_id", user.id).order("created_at", { ascending: false }),
        supabase.from("perfume_purchases").select("*").eq("user_id", user.id).order("date", { ascending: false }),
      ]);
      const loadedItems = (pr.data ?? []).map(dbToItem);
      setItems(loadedItems);
      setPurchases((pur.data ?? []).map(dbToPurchase));
      setGlobalNotes(uniq(loadedItems.flatMap((x) => x.notesTags)).sort());
      setDbLoading(false);
    }
    load();
  }, []);

  const selected = useMemo(() => items.find((x) => x.id === selectedId) ?? null, [items, selectedId]);
  const wardrobeItems = useMemo(() => items.filter((x) => x.status === "wardrobe"), [items]);
  const wishlistItems = useMemo(() => items.filter((x) => x.status === "wishlist"), [items]);
  const archiveItems = useMemo(() => items.filter((x) => x.status === "archive"), [items]);
  const allUsageOptions = useMemo(() => uniq(items.flatMap((i) => i.bottles.map((b) => b.usage)).flatMap((u) => u.split(".").map((s) => s.trim())).filter(Boolean)).sort((a,b) => a.localeCompare(b)), [items]);
  const tabStatusFilter: PerfumeStatus|null = activeTab === "wardrobe" ? "wardrobe" : activeTab === "wishlist" ? "wishlist" : activeTab === "archive" ? "archive" : null;

  const dashboardList = useMemo(() => {
    if (!tabStatusFilter) return [];
    let list = items.filter((x) => x.status === tabStatusFilter);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((x) => displayKey(x).includes(q));
    if (usageFilter !== "all") list = list.filter((x) => x.bottles.some((b) => b.usage.toLowerCase().includes(usageFilter.toLowerCase())));
    return [...list].sort((a,b) => {
      if (sortBy === "brand_asc") return displayKey(a).localeCompare(displayKey(b));
      if (sortBy === "brand_desc") return displayKey(b).localeCompare(displayKey(a));
      const ar = a.ratingStars??0, br = b.ratingStars??0;
      if (sortBy === "rating_desc") return br-ar;
      if (sortBy === "rating_asc") return ar-br;
      return 0;
    });
  }, [items, tabStatusFilter, search, usageFilter, sortBy]);

  const tabStats = useMemo(() => {
    const list = tabStatusFilter==="wardrobe" ? wardrobeItems : tabStatusFilter==="wishlist" ? wishlistItems : tabStatusFilter==="archive" ? archiveItems : [];
    const ids = new Set(list.map((x) => x.id));
    const tp = purchases.filter((p) => ids.has(p.perfumeId));
    const currency = tp.find((x) => x.currency)?.currency ?? "AED";
    const total = tp.reduce((sum,p) => sum+safeNum(p.price,0), 0);
    const today = nowIso(), l30s = addDays(today,-30), p30s = addDays(today,-60), p30e = addDays(today,-31);
    const l30c = tp.filter((p) => withinRange(p.date,l30s,today) && safeNum(p.price,0)>0).length;
    const p30c = tp.filter((p) => withinRange(p.date,p30s,p30e) && safeNum(p.price,0)>0).length;
    return { count: list.length, currency, total, deltaPurchases: l30c-p30c };
  }, [tabStatusFilter, wardrobeItems, wishlistItems, archiveItems, purchases]);

  const recentPurchases = useMemo(() => [...purchases].sort((a,b) => b.date.localeCompare(a.date)), [purchases]);
  const purchasesLast12Months = useMemo(() => {
    const today = new Date(); const map = new Map<string,number>();
    for (const p of purchases) { if (safeNum(p.price,0)<=0) continue; map.set(monthKey(p.date),(map.get(monthKey(p.date))??0)+1); }
    const months = [];
    for (let i=11;i>=0;i--) { const dt = new Date(today.getFullYear(),today.getMonth()-i,1); const mk=`${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}`; months.push({month:mk,count:map.get(mk)??0}); }
    return months;
  }, [purchases]);

  const themeClass = theme === "dark" ? "themeDark" : "themeLight";

  function toast(message: string, kind: ToastKind = "info") {
    const id = uid("toast");
    setToasts((prev) => [...prev, { id, kind, message }]);
    const h = setTimeout(() => { setToasts((prev) => prev.filter((x) => x.id!==id)); delete toastTimers.current[id]; }, 2200);
    toastTimers.current[id] = h;
  }

  function openDetails(id: string) { setSelectedId(id); setIsEditMode(false); setNoteInput(""); setNoteManagerOpen(false); setWeatherManagerOpen(false); }
  function closeDetails() { setSelectedId(null); setIsEditMode(false); setIsArchivePromptOpen(false); setIsRemovePromptOpen(false); setIsPhotoPromptOpen(false); setNoteManagerOpen(false); setWeatherManagerOpen(false); }

  function openAddForDashboard() {
    const s: PerfumeStatus = activeTab==="wishlist" ? "wishlist" : activeTab==="archive" ? "archive" : "wardrobe";
    setAddForm({ mode:"perfume", status:s, brand:"", model:"", imageDataUrl:"", ratingStars:4, bottleType:"Full bottle", bottleSizeMl:"100", usage:"Office . Casual", price:"0", currency:"AED", shopName:"Unknown", shopLink:"", purchaseDate:nowIso() });
    setIsAddOpen(true);
  }

  function openAddBottleFor(perfume: AromaticaItem) {
    setAddForm({ mode:"bottle", status:perfume.status, brand:perfume.brand, model:perfume.model, imageDataUrl:"", ratingStars:clampRating(perfume.ratingStars??4), bottleType:"Decant", bottleSizeMl:"30", usage:perfume.bottles[0]?.usage??"Office . Casual", price:"0", currency:"AED", shopName:"Unknown", shopLink:"", purchaseDate:nowIso(), contextPerfumeId:perfume.id });
    setIsAddOpen(true);
  }

  async function onPickImage(file: File|null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { if (typeof reader.result==="string") setAddForm((f) => ({...f, imageDataUrl:reader.result as string})); };
    reader.readAsDataURL(file);
  }

  async function addPerfumeOrBottle() {
    if (!userId) return;
    if (addForm.mode === "perfume") {
      const brand = addForm.brand.trim(), model = addForm.model.trim();
      if (!brand || !model) { toast("Brand and model are required.", "error"); return; }
      const imageUrl = addForm.imageDataUrl || "https://images.pexels.com/photos/965989/pexels-photo-965989.jpeg?auto=compress&cs=tinysrgb&w=900";
      const { data: pd, error: pe } = await supabase.from("perfumes").insert({ user_id:userId, brand, model, status:addForm.status, image_url:imageUrl, rating_stars:clampRating(addForm.ratingStars), notes_tags:[], weather_tags:[], gender_scale:2, longevity:"Unknown", sillage:"Unknown", value_rating:"Neutral" }).select("*").single();
      if (pe || !pd) { toast("Failed to save.", "error"); return; }
      const newItem: AromaticaItem = { id:pd.id, status:addForm.status, brand, model, imageUrl:pd.image_url, ratingStars:pd.rating_stars, notesTags:[], weatherTags:[], genderScale:2, longevity:"Unknown", sillage:"Unknown", value:"Neutral", cloneSimilar:"", notesText:"", bottles:[] };
      if (addForm.status === "wardrobe") {
        const size = safeNum(addForm.bottleSizeMl, 100);
        const { data: bd } = await supabase.from("perfume_bottles").insert({ perfume_id:pd.id, user_id:userId, bottle_size_ml:size, bottle_type:addForm.bottleType, status:"In collection", usage:addForm.usage }).select("*").single();
        if (bd) {
          newItem.bottles.push({ id:bd.id, bottleSizeMl:bd.bottle_size_ml, bottleType:bd.bottle_type, status:bd.status, usage:bd.usage });
          const { data: pur } = await supabase.from("perfume_purchases").insert({ perfume_id:pd.id, bottle_id:bd.id, user_id:userId, date:addForm.purchaseDate||nowIso(), ml:size, price:safeNum(addForm.price,0), currency:addForm.currency, shop_name:addForm.shopName, shop_link:addForm.shopLink||null }).select("*").single();
          if (pur) setPurchases((prev) => [dbToPurchase(pur), ...prev]);
        }
      }
      setItems((prev) => [newItem, ...prev]);
      setIsAddOpen(false); toast("Added.", "success"); return;
    }
    const perfumeId = addForm.contextPerfumeId;
    if (!perfumeId) return;
    const size = safeNum(addForm.bottleSizeMl, 30);
    const { data: bd, error: be } = await supabase.from("perfume_bottles").insert({ perfume_id:perfumeId, user_id:userId, bottle_size_ml:size, bottle_type:addForm.bottleType, status:"In collection", usage:addForm.usage }).select("*").single();
    if (be || !bd) { toast("Failed to save bottle.", "error"); return; }
    const { data: pur } = await supabase.from("perfume_purchases").insert({ perfume_id:perfumeId, bottle_id:bd.id, user_id:userId, date:addForm.purchaseDate||nowIso(), ml:size, price:safeNum(addForm.price,0), currency:addForm.currency, shop_name:addForm.shopName, shop_link:addForm.shopLink||null }).select("*").single();
    setItems((prev) => prev.map((it) => it.id!==perfumeId ? it : {...it, bottles:[...it.bottles, {id:bd.id,bottleSizeMl:bd.bottle_size_ml,bottleType:bd.bottle_type,status:bd.status,usage:bd.usage}]}));
    if (pur) setPurchases((prev) => [dbToPurchase(pur), ...prev]);
    setIsAddOpen(false); toast("Bottle added.", "success");
  }

  async function confirmRemove() {
    if (!selected) return;
    await supabase.from("perfumes").delete().eq("id", selected.id);
    setItems((prev) => prev.filter((x) => x.id!==selected.id));
    setPurchases((prev) => prev.filter((p) => p.perfumeId!==selected.id));
    toast("Removed.", "success"); closeDetails();
  }

  async function confirmArchive() {
    if (!selected || selected.status==="wishlist") { setIsArchivePromptOpen(false); return; }
    await supabase.from("perfumes").update({ status:"archive", archive_reason:archiveChoice }).eq("id", selected.id);
    setItems((prev) => prev.map((x) => x.id===selected.id ? {...x,status:"archive",archiveReason:archiveChoice} : x));
    setIsArchivePromptOpen(false); toast(`Archived as ${archiveChoice}.`, "success");
  }

  async function addToWishlist() {
    if (!selected || !userId) return;
    if (selected.status==="wishlist") { toast("Already wishlisted.", "info"); return; }
    if (items.some((x) => x.status==="wishlist" && x.brand.toLowerCase()===selected.brand.toLowerCase() && x.model.toLowerCase()===selected.model.toLowerCase())) { toast("Already wishlisted.", "info"); return; }
    const { data } = await supabase.from("perfumes").insert({ user_id:userId, brand:selected.brand, model:selected.model, status:"wishlist", image_url:selected.imageUrl, rating_stars:selected.ratingStars, notes_tags:selected.notesTags, weather_tags:selected.weatherTags, gender_scale:selected.genderScale, longevity:selected.longevity, sillage:selected.sillage, value_rating:selected.value, clone_similar:selected.cloneSimilar, notes_text:selected.notesText }).select("*").single();
    if (data) { setItems((prev) => [...prev, {...selected,id:data.id,status:"wishlist",bottles:[],archiveReason:undefined}]); toast("Added to wishlist.", "success"); }
  }

  async function updateSelected(partial: Partial<AromaticaItem>) {
    if (!selected) return;
    setItems((prev) => prev.map((x) => x.id===selected.id ? {...x,...partial} : x));
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
    if (Object.keys(db).length>0) await supabase.from("perfumes").update(db).eq("id",selected.id);
  }

  async function handleUpdateBottle(perfumeId: string, bottleId: string, partial: Partial<Bottle>) {
    setItems((prev) => prev.map((x) => x.id!==perfumeId ? x : {...x, bottles:x.bottles.map((b) => b.id!==bottleId ? b : {...b,...partial})}));
    const db: Record<string,unknown> = {};
    if (partial.bottleType!==undefined) db.bottle_type=partial.bottleType;
    if (partial.bottleSizeMl!==undefined) db.bottle_size_ml=partial.bottleSizeMl;
    if (partial.status!==undefined) db.status=partial.status;
    if (partial.usage!==undefined) db.usage=partial.usage;
    if (Object.keys(db).length>0) await supabase.from("perfume_bottles").update(db).eq("id",bottleId);
  }

  function toggleMultiTag(list: string[], tag: string) { return list.includes(tag) ? list.filter((x) => x!==tag) : [...list,tag]; }

  function addGlobalNote() {
    const v = noteInput.trim();
    if (!v) return;
    if (globalNotes.some((x) => x.toLowerCase()===v.toLowerCase())) { setNoteInput(""); toast("Tag exists.", "info"); return; }
    setGlobalNotes((prev) => [...prev,v].sort((a,b) => a.localeCompare(b)));
    setNoteInput(""); toast("Tag added.", "success");
  }

  function downloadCsv() {
    const header = ["Status","Brand","Model","Rating","NotesTags","WeatherTags","Gender","Longevity","Sillage","Value","CloneSimilar","NotesText","BottleType","BottleSizeMl","BottleStatus","BottleUsage","PurchaseDate","PurchaseMl","PurchasePrice","Currency","ShopName","ShopLink","ArchiveReason"];
    const rows: string[] = [header.map(toCsvValue).join(",")];
    for (const it of items) {
      const itp = purchases.filter((p) => p.perfumeId===it.id);
      const btls = it.bottles.length ? it.bottles : [null];
      for (const b of btls) {
        const bp = b ? itp.filter((p) => p.bottleId===b.id) : itp.length ? itp : [null];
        for (const p of bp) rows.push([it.status,it.brand,it.model,it.ratingStars??"",it.notesTags.join("|"),it.weatherTags.join("|"),genderLabel(it.genderScale),it.longevity,it.sillage,it.value,it.cloneSimilar,it.notesText,b?.bottleType??"",b?.bottleSizeMl??"",b?.status??"",b?.usage??"",p?.date??"",p?.ml??"",p?.price??"",p?.currency??"",p?.shopName??"",p?.shopLink??"",it.archiveReason??""  ].map(toCsvValue).join(","));
      }
    }
    const blob = new Blob([rows.join("\n")], { type:"text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href=url; a.download=`aromatica_${nowIso()}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    toast("Downloaded.", "success");
  }

  async function shareSelected() {
    if (!selected) return;
    const text = `${selected.brand} ${selected.model}\nRating: ${selected.ratingStars??"n/a"}\nNotes: ${selected.notesTags.join(", ")||"none"}\nWeather: ${selected.weatherTags.join(", ")||"none"}\nGender: ${genderLabel(selected.genderScale)}\nLongevity: ${selected.longevity}\nSillage: ${selected.sillage}\nValue: ${selected.value}\nClone: ${selected.cloneSimilar||"none"}\n\n${selected.notesText||""}`;
    try { await navigator.clipboard.writeText(text); toast("Copied.", "success"); } catch { toast("Clipboard blocked.", "error"); }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key==="Escape") { closeDetails(); setIsAddOpen(false); } }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const delta = tabStats.deltaPurchases;
  const weatherOrder: ("Cold"|"Neutral"|"Hot")[] = ["Cold","Neutral","Hot"];

  if (dbLoading) return (
    <div style={{ minHeight:"60vh", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ width:28, height:28, border:"2.5px solid #F5A623", borderTopColor:"transparent", borderRadius:"50%", animation:"spin 0.7s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <main className={`page ${themeClass}`}>
      <div className="container">
        <header className="header">
          <div className="titleRow">
            <h1 className="title">Aromatica</h1>
            <div className="headerBtns">
              <button className="chipBtn" onClick={downloadCsv}>Download CSV</button>
            </div>
          </div>
          {tabStatusFilter && (
            <div className="statsBar">
              <div className="statsMain">{tabStatusFilter.charAt(0).toUpperCase()+tabStatusFilter.slice(1)}: {tabStats.count} perfumes · Total: {fmtMoney(tabStats.currency, tabStats.total)}</div>
              <div className={`statsDelta ${delta>=0?"deltaUp":"deltaDown"}`}>{delta>=0?"↑":"↓"} {Math.abs(delta)} paid purchases vs prev 30 days</div>
            </div>
          )}
        </header>

        <section className="controls">
          <div className="tabRow">
            <div className="tabs">
              {(["wardrobe","wishlist","archive","purchase_history"] as TabKey[]).map((t) => (
                <button key={t} className={activeTab===t?"tab tabActive":"tab"} onClick={() => setActiveTab(t)}>
                  {t==="purchase_history"?"Purchases":t.charAt(0).toUpperCase()+t.slice(1)}
                </button>
              ))}
            </div>
            <button className="addBtn" onClick={openAddForDashboard}>Add</button>
          </div>
          {activeTab!=="purchase_history" && (
            <div className="filters">
              <input className="search" placeholder="Search brand or model" value={search} onChange={(e) => setSearch(e.target.value)} />
              <select className="select" value={usageFilter} onChange={(e) => setUsageFilter(e.target.value)}>
                <option value="all">All usage</option>
                {allUsageOptions.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
              <select className="select" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                <option value="brand_asc">Brand A–Z</option>
                <option value="brand_desc">Brand Z–A</option>
                <option value="rating_desc">Rating high–low</option>
                <option value="rating_asc">Rating low–high</option>
              </select>
            </div>
          )}
        </section>

        {activeTab!=="purchase_history" ? (
          <section className="gridSection">
            {dashboardList.length===0 ? (
              <div className="emptyCard">{items.length===0?"No perfumes yet. Click Add to get started.":"Nothing matches your filters."}</div>
            ) : (
              <div className="grid">
                {dashboardList.map((item) => (
                  <button key={item.id} className="card" onClick={() => openDetails(item.id)}>
                    <div className="imgWrap">
                      <img className="img" src={item.imageUrl} alt={`${item.brand} ${item.model}`} />
                      <div className="badge">{item.status==="wardrobe"?"Owned":item.status==="wishlist"?"Wishlist":"Archive"}</div>
                    </div>
                    <div className="cardBody">
                      <div className="titleLine">
                        <div><div className="brand">{item.brand}</div><div className="model">{item.model}</div></div>
                        <div className="ratingRight">{ratingText(item.ratingStars)}</div>
                      </div>
                      <div className="row">
                        <div className="pill pillSoft">{item.bottles.length>0?item.bottles[0].usage:item.status==="wishlist"?"Wishlist item":"Archived item"}</div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>
        ) : (
          <section className="historySection">
            <div className="panel"><div className="panelTitle">Paid purchases last 12 months</div><LineChart data={purchasesLast12Months} /></div>
            <div className="historyGrid">
              <div className="panel">
                <div className="panelTitle">Recent purchases</div>
                <div className="historyList">
                  {recentPurchases.length===0 && <div className="emptyInline">No purchases yet.</div>}
                  {recentPurchases.map((p) => {
                    const perf = items.find((x) => x.id===p.perfumeId);
                    return (
                      <div key={p.id} className="historyRow">
                        <div className="hMain"><div className="hTitle">{perf?`${perf.brand} ${perf.model}`:"Unknown"}</div><div className="hMeta">{p.date} · {p.ml?`${p.ml}ml`:"n/a"} · {fmtMoney(p.currency,safeNum(p.price))}</div></div>
                        <div className="hShop">{p.shopLink?<a className="link" href={p.shopLink} target="_blank" rel="noreferrer">{p.shopName}</a>:<span>{p.shopName}</span>}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="panel"><div className="panelTitle">Notes</div><div className="panelHint">Only purchases with a real price are counted. Gifts are excluded from the chart.</div></div>
            </div>
          </section>
        )}
      </div>

      {toasts.length>0 && (
        <div className="toastStack">
          {toasts.map((t) => <div key={t.id} className={`toast ${t.kind==="success"?"toastSuccess":t.kind==="error"?"toastError":"toastInfo"}`}>{t.message}</div>)}
        </div>
      )}

      {selected && (
        <div className="backdrop" onMouseDown={closeDetails}>
          <div className="modal" onMouseDown={(e) => e.stopPropagation()} role="dialog">
            <div className="modalHeader">
              <div className="modalTitle">
                <div className="modalBrand">{selected.brand}</div>
                <div className="modalModel">{selected.model}</div>
                <div className="modalSub">{ratingText(selected.ratingStars)}</div>
              </div>
              <div className="modalActions">
                <button className="chipBtn" onClick={shareSelected}>Share</button>
                <button className="chipBtn" onClick={() => setIsEditMode((v) => !v)}>{isEditMode?"Done":"Edit"}</button>
                <button className="chipBtn" onClick={addToWishlist} disabled={selected.status==="wishlist"}>Wishlist</button>
                {selected.status!=="wishlist" && <button className="chipBtn" onClick={() => { setArchiveChoice("Emptied"); setIsArchivePromptOpen(true); }}>Archive</button>}
                <button className="dangerBtn" onClick={() => setIsRemovePromptOpen(true)}>Remove</button>
                <button className="closeBtn" onClick={closeDetails}>✕</button>
              </div>
            </div>

            <div className="modalBody">
              <div className="modalGrid">
                <div className="left">
                  <div className="hero"><img className="heroImg" src={selected.imageUrl} alt="" /></div>
                  <div className="section">
                    <div className="sectionTitle">Photo</div>
                    <button className="chipBtn" onClick={() => { setPhotoUrlInput(selected.imageUrl); setIsPhotoPromptOpen(true); }}>Change photo</button>
                    <div className="hint">Paste any image URL.</div>
                  </div>
                  <div className="section">
                    <div className="sectionTitle">Rating</div>
                    {!isEditMode ? <div className="textBlock">{ratingText(selected.ratingStars)}</div> : <StarPicker value={clampRating(selected.ratingStars??4)} onChange={(v) => updateSelected({ratingStars:v})} />}
                  </div>
                  {selected.status==="archive" && <div className="section"><div className="sectionTitle">Archive reason</div><div className="textBlock">{selected.archiveReason??"Unknown"}</div></div>}
                </div>

                <div className="right">
                  <div className="section">
                    <div className="rowBetween">
                      <div><div className="sectionTitle" style={{marginBottom:6}}>Notes tags</div><div className="hint">Select from the tag manager.</div></div>
                      {isEditMode && <button className="chipBtn" onClick={() => setNoteManagerOpen(true)}>Manage</button>}
                    </div>
                    {selected.notesTags.length===0 ? <div className="emptyInline">No tags.</div> : <div className="tagGrid">{selected.notesTags.map((t) => <span key={t} className={`tagChip ${tagStyleClass(t)}`}>{t}</span>)}</div>}
                  </div>

                  <div className="section">
                    <div className="rowBetween">
                      <div><div className="sectionTitle" style={{marginBottom:6}}>Weather</div><div className="hint">Cold · Neutral · Hot</div></div>
                      {isEditMode && <button className="chipBtn" onClick={() => setWeatherManagerOpen(true)}>Manage</button>}
                    </div>
                    {selected.weatherTags.length===0 ? <div className="emptyInline">No weather tags.</div> : <div className="tagGrid">{weatherOrder.filter((w) => selected.weatherTags.includes(w)).map((w) => <span key={w} className={`tagChip ${tagStyleClass(w)}`}>{w}</span>)}</div>}
                  </div>

                  <div className="section">
                    <div className="sectionTitle">Gender</div>
                    <div className="genderRow">
                      <input type="range" min={0} max={4} step={1} value={selected.genderScale} onChange={(e) => { if(isEditMode) updateSelected({genderScale:Number(e.target.value) as GenderScale}); }} />
                      <div className="genderLabel">{genderLabel(selected.genderScale)}</div>
                    </div>
                  </div>

                  <div className="section">
                    <div className="sectionTitle">Core</div>
                    <div className="coreGrid">
                      <div className="coreCard">
                        <div className="coreTitle">Performance</div>
                        <div className="formGrid">
                          <LabeledField label="Longevity" value={selected.longevity} editable={isEditMode} onChange={(v) => updateSelected({longevity:v})} />
                          <LabeledField label="Sillage" value={selected.sillage} editable={isEditMode} onChange={(v) => updateSelected({sillage:v})} />
                        </div>
                      </div>
                      <div className="coreCard">
                        <div className="coreTitle">Value & Similar</div>
                        <div className="formGrid">
                          <div>
                            <div className="labelText">Value</div>
                            {!isEditMode ? <div className="textBlock">{selected.value}</div> : (
                              <select className="selectInline" value={selected.value} onChange={(e) => updateSelected({value:e.target.value as AromaticaItem["value"]})}>
                                <option>Worth it</option><option>Neutral</option><option>Not worth it</option>
                              </select>
                            )}
                          </div>
                          <LabeledField label="Clone / similar" value={selected.cloneSimilar} editable={isEditMode} onChange={(v) => updateSelected({cloneSimilar:v})} />
                        </div>
                      </div>
                    </div>
                    <div className="coreCard" style={{marginTop:10}}>
                      <div className="coreTitle">Notes text</div>
                      {!isEditMode ? <div className="textBlock">{selected.notesText||"No notes yet."}</div> : <textarea className="textarea" rows={4} value={selected.notesText} onChange={(e) => updateSelected({notesText:e.target.value})} />}
                    </div>
                  </div>

                  <div className="section">
                    <div className="rowBetween">
                      <div><div className="sectionTitle" style={{marginBottom:4}}>Bottles</div><div className="hint">Track each bottle or decant separately.</div></div>
                      <button className="chipBtn" onClick={() => openAddBottleFor(selected)}>Add</button>
                    </div>
                    {selected.bottles.length===0 ? <div className="emptyInline">No bottles recorded.</div> : (
                      <div className="table">
                        <div className="tHead"><div>Type</div><div>Size</div><div>Status</div><div>Usage</div></div>
                        {selected.bottles.map((b) => (
                          <div className="tRow" key={b.id}>
                            <div className="tCell">{!isEditMode?b.bottleType:<select className="miniSelect" value={b.bottleType} onChange={(e) => handleUpdateBottle(selected.id,b.id,{bottleType:e.target.value as BottleType})}><option>Full bottle</option><option>Decant</option><option>Sample</option><option>Tester</option></select>}</div>
                            <div className="tCell">{!isEditMode?`${b.bottleSizeMl}ml`:<input className="miniInput" value={b.bottleSizeMl} onChange={(e) => handleUpdateBottle(selected.id,b.id,{bottleSizeMl:safeNum(e.target.value,0)})} />}</div>
                            <div className="tCell">{!isEditMode?b.status:<select className="miniSelect" value={b.status} onChange={(e) => handleUpdateBottle(selected.id,b.id,{status:e.target.value as BottleStatus})}><option>In collection</option><option>Emptied</option><option>Sold</option><option>Gifted</option></select>}</div>
                            <div className="tCell">{!isEditMode?b.usage:<input className="miniInputWide" value={b.usage} onChange={(e) => handleUpdateBottle(selected.id,b.id,{usage:e.target.value})} />}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="section">
                    <div className="sectionTitle">Purchase history</div>
                    {(() => {
                      const list = purchases.filter((p) => p.perfumeId===selected.id).sort((a,b) => b.date.localeCompare(a.date));
                      if (list.length===0) return <div className="emptyInline">No purchases recorded.</div>;
                      return (
                        <div className="table">
                          <div className="tHead purchasesHead"><div>Date</div><div>ML</div><div>Price</div><div>Place</div></div>
                          {list.map((p) => (
                            <div className="tRow purchasesRow" key={p.id}>
                              <div className="tCell">{p.date}</div>
                              <div className="tCell">{p.ml||"n/a"}</div>
                              <div className="tCell">{fmtMoney(p.currency,safeNum(p.price))}</div>
                              <div className="tCell">{p.shopLink?<a className="link" href={p.shopLink} target="_blank" rel="noreferrer">{p.shopName}</a>:<span>{p.shopName}</span>}</div>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>

            {isRemovePromptOpen && (
              <div className="inlinePrompt"><div className="promptBox">
                <div className="promptTitle">Remove this perfume?</div>
                <div className="promptText">Deletes the perfume and all its purchases.</div>
                <div className="promptBtns"><button className="chipBtn" onClick={() => setIsRemovePromptOpen(false)}>Cancel</button><button className="dangerBtn" onClick={confirmRemove}>Remove</button></div>
              </div></div>
            )}
            {isArchivePromptOpen && selected.status!=="wishlist" && (
              <div className="inlinePrompt"><div className="promptBox">
                <div className="promptTitle">Move to archive</div>
                <div className="promptText">What happened to it?</div>
                <div className="radioRow">{(["Sold","Emptied","Gifted"] as const).map((r) => <label key={r} className="radioItem"><input type="radio" checked={archiveChoice===r} onChange={() => setArchiveChoice(r)} /><span>{r}</span></label>)}</div>
                <div className="promptBtns"><button className="chipBtn" onClick={() => setIsArchivePromptOpen(false)}>Cancel</button><button className="chipBtn" onClick={confirmArchive}>Archive</button></div>
              </div></div>
            )}
            {isPhotoPromptOpen && (
              <div className="inlinePrompt"><div className="promptBox">
                <div className="promptTitle">Change photo</div>
                <div className="promptText">Paste an image URL below.</div>
                <input className="input" value={photoUrlInput} onChange={(e) => setPhotoUrlInput(e.target.value)} placeholder="https://..." />
                <div className="promptBtns"><button className="chipBtn" onClick={() => setIsPhotoPromptOpen(false)}>Cancel</button><button className="chipBtn" onClick={async()=>{const url=photoUrlInput.trim();if(!url)return;await updateSelected({imageUrl:url});setIsPhotoPromptOpen(false);toast("Photo updated.","success");}}>Apply</button></div>
              </div></div>
            )}
            {noteManagerOpen && (
              <div className="inlinePrompt"><div className="promptBox">
                <div className="promptTitle">Notes tags</div>
                <div className="promptText">Tap to select. Add new tags to the global list.</div>
                <div className="tagPicker">{globalNotes.map((t) => <button key={t} className={selected.notesTags.includes(t)?"tagPick tagPickActive":"tagPick"} onClick={() => updateSelected({notesTags:toggleMultiTag(selected.notesTags,t)})}>{t}</button>)}</div>
                <div className="tagAdder"><input className="input" value={noteInput} onChange={(e) => setNoteInput(e.target.value)} placeholder="New note tag" /><button className="chipBtn" onClick={addGlobalNote}>Add tag</button></div>
                <div className="promptBtns"><button className="chipBtn" onClick={() => setNoteManagerOpen(false)}>Done</button></div>
              </div></div>
            )}
            {weatherManagerOpen && (
              <div className="inlinePrompt"><div className="promptBox">
                <div className="promptTitle">Weather</div>
                <div className="tagPicker">{(["Cold","Neutral","Hot"] as const).map((w) => <button key={w} className={selected.weatherTags.includes(w)?"tagPick tagPickActive":"tagPick"} onClick={() => updateSelected({weatherTags:toggleMultiTag(selected.weatherTags as string[],w) as ("Cold"|"Neutral"|"Hot")[]})}>{w}</button>)}</div>
                <div className="promptBtns"><button className="chipBtn" onClick={() => setWeatherManagerOpen(false)}>Done</button></div>
              </div></div>
            )}
          </div>
        </div>
      )}

      {isAddOpen && (
        <div className="backdrop" onMouseDown={() => setIsAddOpen(false)}>
          <div className="modal smallModal" onMouseDown={(e) => e.stopPropagation()} role="dialog">
            <div className="modalHeader">
              <div className="modalTitle"><div className="modalBrand">{addForm.mode==="bottle"?"Add bottle / decant":"Add perfume"}</div><div className="modalModel">Saves to your database</div></div>
              <div className="modalActions"><button className="closeBtn" onClick={() => setIsAddOpen(false)}>✕</button></div>
            </div>
            <div className="modalBody">
              <div className="formGrid2">
                {addForm.mode==="perfume" && <label className="label">Add to<select className="selectInline" value={addForm.status} onChange={(e) => setAddForm((f) => ({...f,status:e.target.value as PerfumeStatus}))}><option value="wardrobe">Wardrobe</option><option value="wishlist">Wishlist</option><option value="archive">Archive</option></select></label>}
                <label className="label">Brand<input className="input" value={addForm.brand} onChange={(e) => setAddForm((f) => ({...f,brand:e.target.value}))} placeholder="Lattafa" disabled={addForm.mode==="bottle"} /></label>
                <label className="label">Model<input className="input" value={addForm.model} onChange={(e) => setAddForm((f) => ({...f,model:e.target.value}))} placeholder="Asad" disabled={addForm.mode==="bottle"} /></label>
                <label className="label">Rating<StarPicker value={clampRating(addForm.ratingStars)} onChange={(v) => setAddForm((f) => ({...f,ratingStars:v}))} /></label>
                {addForm.mode==="perfume" && <label className="label">Photo<input className="input" type="file" accept="image/*" onChange={(e) => onPickImage(e.target.files?.[0]??null)} /><div className="hint">Or paste URL after adding.</div></label>}
                {addForm.imageDataUrl && addForm.mode==="perfume" && <div className="previewWrap"><img className="previewImg" src={addForm.imageDataUrl} alt="preview" /></div>}
                <label className="label">Type<select className="selectInline" value={addForm.bottleType} onChange={(e) => setAddForm((f) => ({...f,bottleType:e.target.value as BottleType}))}><option>Full bottle</option><option>Decant</option><option>Sample</option><option>Tester</option></select></label>
                <label className="label">Size ml<input className="input" value={addForm.bottleSizeMl} onChange={(e) => setAddForm((f) => ({...f,bottleSizeMl:e.target.value}))} /></label>
                <label className="label">Usage<input className="input" value={addForm.usage} onChange={(e) => setAddForm((f) => ({...f,usage:e.target.value}))} /></label>
                <label className="label">Purchase date<input className="input" value={addForm.purchaseDate} onChange={(e) => setAddForm((f) => ({...f,purchaseDate:e.target.value}))} placeholder="YYYY-MM-DD" /></label>
                <label className="label">Price<input className="input" value={addForm.price} onChange={(e) => setAddForm((f) => ({...f,price:e.target.value}))} /></label>
                <label className="label">Currency<select className="selectInline" value={addForm.currency} onChange={(e) => setAddForm((f) => ({...f,currency:e.target.value}))}><option>AED</option><option>INR</option><option>USD</option><option>GBP</option><option>EUR</option></select></label>
                <label className="label">Shop name<input className="input" value={addForm.shopName} onChange={(e) => setAddForm((f) => ({...f,shopName:e.target.value}))} /></label>
                <label className="label">Shop link (optional)<input className="input" value={addForm.shopLink} onChange={(e) => setAddForm((f) => ({...f,shopLink:e.target.value}))} placeholder="https://..." /></label>
              </div>
              <div className="rowEnd"><button className="chipBtn" onClick={() => setIsAddOpen(false)}>Cancel</button><button className="addBtn" onClick={addPerfumeOrBottle}>Save</button></div>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .page{min-height:100vh;padding:22px 16px;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;transition:background 120ms ease,color 120ms ease}
        .themeDark{background:radial-gradient(circle at top left,#111827,#030712);color:#e5e7eb}
        .themeLight{background:radial-gradient(circle at top left,#f8fafc,#e2e8f0);color:#0f172a}
        .container{max-width:1120px;margin:0 auto}
        .header{margin-bottom:14px}
        .titleRow{display:flex;justify-content:space-between;align-items:center;gap:10px}
        .title{font-size:26px;font-weight:950;letter-spacing:.02em;margin:0}
        .headerBtns{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;align-items:center}
        .chipBtn{border-radius:12px;padding:9px 12px;border:1px solid rgba(148,163,184,.35);background:rgba(2,6,23,.18);color:inherit;cursor:pointer;font-weight:900;font-size:12px;height:38px;white-space:nowrap}
        .themeLight .chipBtn{background:rgba(255,255,255,.92)}
        .chipBtn:disabled{opacity:.5;cursor:not-allowed}
        .dangerBtn{border-radius:12px;padding:9px 12px;border:1px solid rgba(244,63,94,.55);background:rgba(244,63,94,.12);color:inherit;cursor:pointer;font-weight:950;font-size:12px;height:38px;white-space:nowrap}
        .closeBtn{border-radius:12px;padding:9px 12px;border:1px solid rgba(148,163,184,.35);background:rgba(2,6,23,.18);color:inherit;cursor:pointer;font-weight:950;height:38px}
        .themeLight .closeBtn{background:rgba(255,255,255,.92)}
        .statsBar{margin-top:10px;border-radius:14px;padding:10px 12px;border:1px solid rgba(148,163,184,.35);background:rgba(2,6,23,.14);display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap}
        .themeLight .statsBar{background:rgba(255,255,255,.85)}
        .statsMain{font-weight:900;font-size:13px}
        .statsDelta{font-weight:950;font-size:12px;padding:6px 10px;border-radius:999px;border:1px solid rgba(148,163,184,.35)}
        .deltaUp{background:rgba(59,130,246,.12);border-color:rgba(59,130,246,.35)}
        .deltaDown{background:rgba(244,63,94,.12);border-color:rgba(244,63,94,.35)}
        .controls{border-radius:16px;padding:12px;border:1px solid rgba(148,163,184,.35);background:rgba(2,6,23,.12);backdrop-filter:blur(10px)}
        .themeLight .controls{background:rgba(255,255,255,.85)}
        .tabRow{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
        .tabs{display:flex;gap:8px;flex-wrap:wrap}
        .tab{border-radius:999px;padding:8px 12px;border:1px solid rgba(148,163,184,.35);background:rgba(2,6,23,.14);color:inherit;cursor:pointer;font-size:13px;font-weight:800}
        .themeLight .tab{background:rgba(241,245,249,.95)}
        .tabActive{background:linear-gradient(135deg,#60a5fa,#93c5fd);border-color:transparent;color:#0b1220}
        .addBtn{border:none;border-radius:12px;padding:9px 14px;cursor:pointer;background:linear-gradient(135deg,#60a5fa,#93c5fd);color:#0b1220;font-weight:950;height:38px}
        .filters{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
        .search{flex:1 1 240px;padding:9px 12px;border-radius:999px;border:1px solid rgba(148,163,184,.4);background:rgba(2,6,23,.12);color:inherit;font-size:13px;outline:none;font-weight:750}
        .themeLight .search{background:rgba(241,245,249,.95)}
        .select{flex:0 0 180px;padding:9px 12px;border-radius:999px;border:1px solid rgba(148,163,184,.4);background:rgba(2,6,23,.12);color:inherit;font-size:13px;outline:none;font-weight:750}
        .themeLight .select{background:rgba(241,245,249,.95)}
        .selectInline{width:100%;border-radius:12px;padding:10px 12px;border:1px solid rgba(148,163,184,.45);background:rgba(2,6,23,.35);color:inherit;font-size:13px;font-weight:800;outline:none}
        .themeLight .selectInline{background:rgba(255,255,255,.95)}
        .gridSection{margin-top:14px}
        .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px}
        .card{border-radius:18px;border:1px solid rgba(148,163,184,.35);background:rgba(2,6,23,.10);overflow:hidden;cursor:pointer;padding:0;text-align:left;color:inherit;transition:transform 120ms ease,box-shadow 120ms ease,border-color 120ms ease}
        .themeLight .card{background:rgba(255,255,255,.95)}
        .card:hover{transform:translateY(-2px);box-shadow:0 18px 48px rgba(0,0,0,.22);border-color:rgba(147,197,253,.9)}
        .imgWrap{position:relative;padding:10px 10px 0 10px}
        .img{width:100%;height:190px;object-fit:cover;border-radius:16px}
        .badge{position:absolute;top:16px;left:16px;padding:4px 8px;border-radius:999px;border:1px solid rgba(148,163,184,.5);background:rgba(2,6,23,.55);font-size:11px;font-weight:950;letter-spacing:.08em;text-transform:uppercase}
        .themeLight .badge{background:rgba(255,255,255,.9)}
        .cardBody{padding:10px 12px 12px 12px}
        .titleLine{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
        .brand{font-size:12px;font-weight:950;letter-spacing:.14em;text-transform:uppercase;opacity:.7}
        .model{font-size:14px;font-weight:950;margin-top:2px}
        .ratingRight{font-size:12px;font-weight:950;opacity:.9;padding-top:2px;white-space:nowrap}
        .row{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}
        .pill{border-radius:999px;padding:5px 10px;border:1px solid rgba(148,163,184,.35);background:rgba(2,6,23,.08);font-size:12px;font-weight:850}
        .themeLight .pill{background:rgba(241,245,249,.95)}
        .pillSoft{border-color:rgba(147,197,253,.75)}
        .emptyCard{margin-top:14px;padding:22px;border-radius:16px;border:1px dashed rgba(148,163,184,.45);background:rgba(2,6,23,.08);text-align:center;font-weight:800;opacity:.85}
        .themeLight .emptyCard{background:rgba(255,255,255,.9)}
        .historySection{margin-top:14px;display:flex;flex-direction:column;gap:14px}
        .historyGrid{display:grid;grid-template-columns:1.2fr 1fr;gap:14px}
        .panel{border-radius:16px;border:1px solid rgba(148,163,184,.35);background:rgba(2,6,23,.10);padding:12px}
        .themeLight .panel{background:rgba(255,255,255,.9)}
        .panelTitle{font-weight:950;letter-spacing:.08em;text-transform:uppercase;font-size:12px;opacity:.75;margin-bottom:10px}
        .historyList{display:flex;flex-direction:column;gap:10px;max-height:420px;overflow:auto;padding-right:6px}
        .historyRow{display:flex;justify-content:space-between;gap:10px;padding:10px;border-radius:14px;border:1px solid rgba(148,163,184,.25);background:rgba(2,6,23,.06)}
        .themeLight .historyRow{background:rgba(241,245,249,.95)}
        .hTitle{font-weight:950;font-size:13px}
        .hMeta{margin-top:4px;font-size:12px;opacity:.75}
        .hShop{font-size:12px;font-weight:850;opacity:.9;text-align:right;min-width:110px}
        .panelHint{font-size:12px;opacity:.75;font-weight:750}
        .backdrop{position:fixed;inset:0;background:rgba(2,6,23,.72);backdrop-filter:blur(10px);display:flex;align-items:center;justify-content:center;padding:18px;z-index:50}
        .modal{width:min(1120px,100%);max-height:88vh;overflow:auto;border-radius:18px;border:1px solid rgba(148,163,184,.35);background:rgba(2,6,23,.92);box-shadow:0 22px 70px rgba(0,0,0,.55);color:#e5e7eb;position:relative}
        .themeLight .modal{background:rgba(255,255,255,.97);color:#0f172a}
        .smallModal{width:min(820px,100%)}
        .modalHeader{position:sticky;top:0;z-index:2;display:flex;justify-content:space-between;gap:10px;align-items:center;padding:12px;border-bottom:1px solid rgba(148,163,184,.25);background:rgba(2,6,23,.78);backdrop-filter:blur(10px)}
        .themeLight .modalHeader{background:rgba(255,255,255,.88)}
        .modalBrand{font-size:12px;font-weight:950;letter-spacing:.14em;text-transform:uppercase;opacity:.7}
        .modalModel{font-size:18px;font-weight:1000;margin-top:2px}
        .modalSub{font-size:12px;font-weight:900;opacity:.75;margin-top:4px}
        .modalActions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;align-items:center}
        .modalBody{padding:12px}
        .modalGrid{display:grid;grid-template-columns:340px 1fr;gap:12px}
        .hero{border-radius:16px;border:1px solid rgba(148,163,184,.25);background:rgba(2,6,23,.10);padding:10px}
        .themeLight .hero{background:rgba(241,245,249,.95)}
        .heroImg{width:100%;height:320px;object-fit:cover;border-radius:14px}
        .section{margin-top:12px;border-radius:16px;border:1px solid rgba(148,163,184,.25);background:rgba(2,6,23,.08);padding:12px}
        .themeLight .section{background:rgba(241,245,249,.95)}
        .sectionTitle{font-size:12px;font-weight:1000;letter-spacing:.12em;text-transform:uppercase;opacity:.7;margin-bottom:10px}
        .hint{font-size:12px;opacity:.75;font-weight:750;margin-top:8px}
        .textBlock{white-space:pre-wrap;font-size:13px;line-height:1.45;font-weight:700;opacity:.9}
        .input,.textarea{width:100%;border-radius:12px;padding:10px 12px;border:1px solid rgba(148,163,184,.35);background:rgba(2,6,23,.18);color:inherit;outline:none;font-size:13px;font-weight:750}
        .themeLight .input,.themeLight .textarea{background:rgba(255,255,255,.95)}
        .textarea{resize:vertical}
        .formGrid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
        .labelText{font-size:12px;font-weight:950;opacity:.8;margin-bottom:6px}
        .rowBetween{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px}
        .tagGrid{display:flex;flex-wrap:wrap;gap:8px}
        .tagChip{border-radius:999px;padding:8px 10px;border:1px solid rgba(148,163,184,.3);font-weight:900;font-size:12px;user-select:none}
        .tagA{background:rgba(96,165,250,.12);border-color:rgba(96,165,250,.35)}.tagB{background:rgba(167,139,250,.12);border-color:rgba(167,139,250,.35)}.tagC{background:rgba(251,146,60,.12);border-color:rgba(251,146,60,.35)}.tagD{background:rgba(244,114,182,.12);border-color:rgba(244,114,182,.35)}.tagE{background:rgba(148,163,184,.12);border-color:rgba(148,163,184,.35)}.tagF{background:rgba(34,211,238,.12);border-color:rgba(34,211,238,.35)}
        .tagPicker{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
        .tagPick{border-radius:999px;padding:8px 10px;border:1px solid rgba(148,163,184,.35);background:rgba(2,6,23,.12);color:inherit;cursor:pointer;font-weight:900;font-size:12px}
        .themeLight .tagPick{background:rgba(255,255,255,.95)}
        .tagPickActive{background:linear-gradient(135deg,#60a5fa,#93c5fd);border-color:transparent;color:#0b1220}
        .tagAdder{display:flex;gap:8px;margin-top:12px;flex-wrap:wrap}
        .genderRow{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
        .genderLabel{font-weight:900;opacity:.85}
        .coreGrid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
        .coreCard{border-radius:14px;border:1px solid rgba(148,163,184,.22);background:rgba(2,6,23,.06);padding:10px}
        .themeLight .coreCard{background:rgba(255,255,255,.75)}
        .coreTitle{font-size:12px;font-weight:950;opacity:.75;margin-bottom:8px;letter-spacing:.08em;text-transform:uppercase}
        .table{border-radius:14px;border:1px solid rgba(148,163,184,.25);overflow:hidden}
        .tHead,.tRow{display:grid;grid-template-columns:1.1fr .7fr .9fr 1.8fr;align-items:center}
        .purchasesHead,.purchasesRow{grid-template-columns:.9fr .6fr .9fr 1.6fr}
        .tHead{padding:10px;background:rgba(2,6,23,.08);font-size:12px;font-weight:1000;letter-spacing:.06em;text-transform:uppercase;opacity:.75}
        .tRow{padding:12px 10px;border-top:1px solid rgba(148,163,184,.18);font-size:13px;font-weight:700}
        .miniSelect,.miniInput,.miniInputWide{width:100%;border-radius:10px;padding:7px 8px;border:1px solid rgba(148,163,184,.3);background:rgba(2,6,23,.18);color:inherit;outline:none;font-weight:750;font-size:12px}
        .themeLight .miniSelect,.themeLight .miniInput,.themeLight .miniInputWide{background:rgba(255,255,255,.95)}
        .miniInput{max-width:90px}.miniInputWide{min-width:140px}
        .emptyInline{font-size:13px;opacity:.75;font-weight:750}
        .link{color:#60a5fa;text-decoration:none;font-weight:900}
        .themeLight .link{color:#2563eb}
        .formGrid2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
        .label{display:flex;flex-direction:column;gap:8px;font-size:12px;font-weight:900;opacity:.85}
        .previewWrap{grid-column:1/-1;border-radius:14px;border:1px solid rgba(148,163,184,.25);padding:10px;background:rgba(2,6,23,.06)}
        .themeLight .previewWrap{background:rgba(241,245,249,.95)}
        .previewImg{width:100%;height:260px;object-fit:cover;border-radius:12px}
        .rowEnd{display:flex;justify-content:flex-end;gap:8px;margin-top:12px}
        .inlinePrompt{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,.35)}
        .promptBox{width:min(560px,100%);border-radius:16px;border:1px solid rgba(148,163,184,.35);background:rgba(2,6,23,.95);color:#e5e7eb;padding:14px;box-shadow:0 20px 60px rgba(0,0,0,.4)}
        .themeLight .promptBox{background:rgba(255,255,255,.97);color:#0f172a}
        .promptTitle{font-weight:1000;margin-bottom:6px}
        .promptText{font-size:13px;opacity:.8;font-weight:750;margin-bottom:10px}
        .promptBtns{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;margin-top:10px}
        .radioRow{display:flex;gap:10px;flex-wrap:wrap;margin-top:6px}
        .radioItem{display:inline-flex;gap:8px;align-items:center;padding:8px 10px;border-radius:999px;border:1px solid rgba(148,163,184,.35);background:rgba(2,6,23,.08);font-weight:900;font-size:12px}
        .themeLight .radioItem{background:rgba(241,245,249,.95)}
        .toastStack{position:fixed;right:14px;bottom:14px;display:flex;flex-direction:column;gap:10px;z-index:80}
        .toast{border-radius:14px;padding:10px 12px;border:1px solid rgba(148,163,184,.35);background:rgba(2,6,23,.85);color:#e5e7eb;font-weight:900;font-size:13px;max-width:340px;box-shadow:0 18px 40px rgba(0,0,0,.35)}
        .themeLight .toast{background:rgba(255,255,255,.95);color:#0f172a}
        .toastSuccess{border-color:rgba(96,165,250,.6)}.toastError{border-color:rgba(244,63,94,.6)}.toastInfo{border-color:rgba(148,163,184,.5)}
        @media(max-width:920px){.historyGrid{grid-template-columns:1fr}}
        @media(max-width:900px){.modalGrid{grid-template-columns:1fr}.heroImg{height:260px}.formGrid{grid-template-columns:1fr}.formGrid2{grid-template-columns:1fr}.coreGrid{grid-template-columns:1fr}}
        @media(max-width:640px){.tHead{display:none}.tRow{grid-template-columns:1fr;row-gap:8px}}
      `}</style>
    </main>
  );
}

function LabeledField({label,value,editable,onChange}:{label:string;value:string;editable:boolean;onChange:(v:string)=>void}) {
  return <div><div className="labelText">{label}</div>{!editable?<div className="textBlock">{value||"n/a"}</div>:<input className="input" value={value} onChange={(e)=>onChange(e.target.value)} />}</div>;
}

function StarPicker({value,onChange}:{value:number;onChange:(v:number)=>void}) {
  const v = Math.max(1,Math.min(5,value));
  return <div style={{display:"inline-flex",gap:6,alignItems:"center"}}>{[1,2,3,4,5].map((s)=><button key={s} onClick={()=>onChange(s)} style={{border:"none",background:"transparent",cursor:"pointer",fontSize:16,lineHeight:"16px",padding:2,opacity:s<=v?1:0.35}} aria-label={`${s} star`}>★</button>)}</div>;
}

function LineChart({data}:{data:{month:string;count:number}[]}) {
  const w=900,h=220,pad=28;
  const maxY=Math.max(...data.map((d)=>d.count),1);
  const xStep=(w-pad*2)/Math.max(data.length-1,1);
  const pts=data.map((d,i)=>({x:pad+i*xStep,y:h-pad-(d.count/maxY)*(h-pad*2),label:d.month,value:d.count}));
  const path=pts.map((p,i)=>`${i===0?"M":"L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");
  return <div style={{width:"100%",overflowX:"auto"}}><svg viewBox={`0 0 ${w} ${h}`} style={{width:"100%",height:"auto"}}><line x1={pad} y1={h-pad} x2={w-pad} y2={h-pad} stroke="currentColor" opacity={0.25}/><line x1={pad} y1={pad} x2={pad} y2={h-pad} stroke="currentColor" opacity={0.25}/><path d={path} fill="none" stroke="currentColor" strokeWidth={2.5} opacity={0.9}/>{pts.map((p,i)=><g key={i}><circle cx={p.x} cy={p.y} r={3.5} fill="currentColor" opacity={0.9}/>{p.value>0&&<text x={p.x} y={p.y-8} fontSize="10" textAnchor="middle" fill="currentColor" opacity={0.75}>{p.value}</text>}</g>)}{pts.map((p,i)=>{if(i!==0&&i!==pts.length-1&&i%3!==0)return null;return <text key={`t-${i}`} x={p.x} y={h-10} fontSize="10" textAnchor="middle" fill="currentColor" opacity={0.6}>{p.label}</text>;})}</svg></div>;
}
