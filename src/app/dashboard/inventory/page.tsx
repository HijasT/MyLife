"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { todayDubai } from "@/lib/timezone";

type Category = "Food" | "Clothing" | "Household" | "Electronics" | "Other";
type SpecialCategory = "Aromatica";

type Item = {
  id: string;
  name: string;
  category: Category;
  subcategory: string;
  location: string;
  quantity: number;
  unit: string;
  expiryDate: string | null;
  brand: string;
  imageUrl: string;
  notes: string;
  isFinished: boolean;
  lowThreshold: number | null;
  purchaseDate: string | null;
  purchasePrice: number | null;
  currency: string;
  createdAt: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dbToItem = (r: any): Item => ({
  id: r.id, name: r.name, category: r.category ?? "Other",
  subcategory: r.subcategory ?? "", location: r.location ?? "",
  quantity: r.quantity ?? 1, unit: r.unit ?? "pcs",
  expiryDate: r.expiry_date ?? null, brand: r.brand ?? "",
  imageUrl: r.image_url ?? "", notes: r.notes ?? "",
  isFinished: r.is_finished ?? false, lowThreshold: r.low_threshold ?? null,
  purchaseDate: r.purchase_date ?? null, purchasePrice: r.purchase_price ?? null,
  currency: r.currency ?? "AED", createdAt: r.created_at,
});

const CAT_META: Record<Category, { icon: string; color: string; subcategories: string[]; units: string[]; locations: string[] }> = {
  Food:        { icon:"🥗", color:"#16a34a", subcategories:["Dairy","Meat","Vegetables","Fruits","Grains","Snacks","Beverages","Condiments","Frozen","Canned"], units:["pcs","kg","g","L","mL","pack","bottle","can","box"], locations:["Fridge","Freezer","Pantry","Kitchen Cabinet","Counter"] },
  Clothing:    { icon:"👕", color:"#6366f1", subcategories:["T-Shirts","Shirts","Pants","Shorts","Shoes","Accessories","Jackets","Formal","Sports","Undergarments"], units:["pcs","pairs","sets"], locations:["Wardrobe","Bedroom","Storage Room","Drawer"] },
  Household:   { icon:"🏠", color:"#f59e0b", subcategories:["Cleaning","Bedding","Kitchen Tools","Bathroom","Furniture","Decor","Tools","Garden","Stationery"], units:["pcs","pack","bottle","roll","set","box"], locations:["Living Room","Bedroom","Bathroom","Kitchen","Storage Room","Garage"] },
  Electronics: { icon:"📱", color:"#3b82f6", subcategories:["Phones","Laptops","Tablets","TV & Audio","Cables & Accessories","Gaming","Cameras","Wearables","Smart Home"], units:["pcs","set"], locations:["Living Room","Bedroom","Office","Storage Room"] },
  Other:       { icon:"📦", color:"#9ca3af", subcategories:["Miscellaneous"], units:["pcs","set","pack"], locations:["Storage Room","Other"] },
};

// Aromatica is a special linked module within Inventory
const AROMATICA_META = { icon:"🌸", color:"#D85A30", label:"Aromatica", description:"Fragrance collection · Bottles · Wear logs", href:"/dashboard/aromatica" };

function daysUntilExpiry(d: string | null): number | null {
  if (!d) return null;
  return Math.ceil((new Date(d).getTime() - new Date(todayDubai()).getTime()) / 86400000);
}

function expiryColor(days: number | null): string {
  if (days === null) return "";
  if (days < 0) return "#ef4444";
  if (days <= 3) return "#ef4444";
  if (days <= 7) return "#f59e0b";
  if (days <= 30) return "#eab308";
  return "#16a34a";
}

function expiryLabel(days: number | null): string {
  if (days === null) return "";
  if (days < 0) return `Expired ${Math.abs(days)}d ago`;
  if (days === 0) return "Expires today!";
  if (days === 1) return "Expires tomorrow";
  return `${days}d left`;
}

const EMPTY_FORM = {
  name: "", category: "Food" as Category, subcategory: "", location: "",
  quantity: "1", unit: "pcs", expiryDate: "", brand: "",
  imageUrl: "", notes: "", lowThreshold: "", purchaseDate: "", purchasePrice: "", currency: "AED",
};

export default function InventoryPage() {
  const supabase = createClient();
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<Category | "All">("All");
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showFinished, setShowFinished] = useState(false);
  const [toast, setToast] = useState("");
  const [sortBy, setSortBy] = useState<"name"|"expiry"|"quantity"|"location">("name");

  const isDark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      setUserId(user.id);
      const { data } = await supabase.from("inventory_items").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
      setItems((data ?? []).map(dbToItem));
      setLoading(false);
    }
    load();
  }, []);

  function showMsg(msg: string) { setToast(msg); setTimeout(() => setToast(""), 2500); }

  async function saveItem() {
    if (!userId || !form.name.trim()) { showMsg("Name is required"); return; }
    const payload = {
      user_id: userId, name: form.name.trim(), category: form.category,
      subcategory: form.subcategory || null, location: form.location || null,
      quantity: parseFloat(form.quantity) || 1, unit: form.unit,
      expiry_date: form.expiryDate || null, brand: form.brand || null,
      image_url: form.imageUrl || null, notes: form.notes || null,
      low_threshold: form.lowThreshold ? parseFloat(form.lowThreshold) : null,
      purchase_date: form.purchaseDate || null,
      purchase_price: form.purchasePrice ? parseFloat(form.purchasePrice) : null,
      currency: form.currency,
    };
    const { data, error } = await supabase.from("inventory_items").insert(payload).select("*").single();
    if (error) { showMsg("Failed to save"); return; }
    setItems(p => [dbToItem(data), ...p]);
    setShowAdd(false); setForm(EMPTY_FORM);
    showMsg("✓ Item added");
  }

  async function toggleFinished(item: Item) {
    await supabase.from("inventory_items").update({ is_finished: !item.isFinished }).eq("id", item.id);
    setItems(p => p.map(x => x.id === item.id ? { ...x, isFinished: !x.isFinished } : x));
  }

  async function updateQty(item: Item, delta: number) {
    const newQty = Math.max(0, item.quantity + delta);
    await supabase.from("inventory_items").update({ quantity: newQty }).eq("id", item.id);
    setItems(p => p.map(x => x.id === item.id ? { ...x, quantity: newQty } : x));
  }

  // Stats
  const stats = useMemo(() => {
    const today = todayDubai();
    const soon = new Date(today); soon.setDate(soon.getDate() + 7);
    const expiring = items.filter(x => !x.isFinished && x.expiryDate && x.expiryDate <= soon.toISOString().slice(0, 10));
    const expired  = items.filter(x => !x.isFinished && x.expiryDate && x.expiryDate < today);
    const low      = items.filter(x => !x.isFinished && x.lowThreshold !== null && x.quantity <= x.lowThreshold);
    return { total: items.filter(x => !x.isFinished).length, expiring: expiring.length, expired: expired.length, low: low.length };
  }, [items]);

  const filtered = useMemo(() => {
    let list = items.filter(x => showFinished ? true : !x.isFinished);
    if (activeCategory !== "All") list = list.filter(x => x.category === activeCategory);
    if (search.trim()) list = list.filter(x => `${x.name} ${x.brand} ${x.location} ${x.subcategory}`.toLowerCase().includes(search.toLowerCase()));
    return [...list].sort((a, b) => {
      if (sortBy === "expiry") {
        if (!a.expiryDate && !b.expiryDate) return 0;
        if (!a.expiryDate) return 1;
        if (!b.expiryDate) return -1;
        return a.expiryDate.localeCompare(b.expiryDate);
      }
      if (sortBy === "quantity") return a.quantity - b.quantity;
      if (sortBy === "location") return (a.location || "").localeCompare(b.location || "");
      return a.name.localeCompare(b.name);
    });
  }, [items, activeCategory, search, showFinished, sortBy]);

  // Group by location
  const byLocation = useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const item of filtered) {
      const loc = item.location || "Unassigned";
      if (!map.has(loc)) map.set(loc, []);
      map.get(loc)!.push(item);
    }
    return map;
  }, [filtered]);

  const meta = form.category in CAT_META ? CAT_META[form.category as Category] : CAT_META.Other;

  const V = {
    bg:    isDark ? "#0d0f14" : "#f9f8f5",
    card:  isDark ? "#16191f" : "#ffffff",
    border:isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)",
    text:  isDark ? "#f0ede8" : "#1a1a1a",
    muted: isDark ? "#9ba3b2" : "#6b7280",
    faint: isDark ? "#5c6375" : "#9ca3af",
    input: isDark ? "#1e2130" : "#f9fafb",
    accent:"#F5A623",
  };
  const btn = { padding:"8px 14px", borderRadius:10, border:`1px solid ${V.border}`, background:V.card, color:V.text, cursor:"pointer", fontSize:13, fontWeight:600 } as const;
  const btnP = { ...btn, background:V.accent, border:"none", color:"#fff", fontWeight:700 } as const;
  const inp = { padding:"8px 12px", borderRadius:8, border:`1px solid ${V.border}`, background:V.input, color:V.text, fontSize:13, outline:"none", width:"100%", boxSizing:"border-box" as const };
  const lbl = { display:"flex" as const, flexDirection:"column" as const, gap:5, fontSize:12, fontWeight:700, color:V.faint, textTransform:"uppercase" as const, letterSpacing:"0.06em" };

  if (loading) return <div style={{ minHeight:"60vh", display:"flex", alignItems:"center", justifyContent:"center", background:V.bg }}><div style={{ width:28, height:28, border:`2.5px solid ${V.accent}`, borderTopColor:"transparent", borderRadius:"50%", animation:"spin 0.7s linear infinite" }}/><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style></div>;

  return (
    <div style={{ minHeight:"100vh", background:V.bg, color:V.text, fontFamily:"system-ui,sans-serif" }}>

      {/* Header */}
      <div style={{ padding:"22px 24px 0", display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:12 }}>
        <div>
          <div style={{ fontSize:22, fontWeight:800 }}>Home <span style={{ color:V.accent, fontStyle:"italic" }}>Inventory</span></div>
          <div style={{ fontSize:13, color:V.faint, marginTop:2 }}>Food · Clothes · Household · Electronics</div>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <button style={btn} onClick={() => setShowFinished(v => !v)}>{showFinished ? "Hide finished" : "Show finished"}</button>
          <button style={btnP} onClick={() => setShowAdd(true)}>+ Add item</button>
        </div>
      </div>

      {/* Alert stats */}
      <div style={{ padding:"12px 24px 0", display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))", gap:10 }}>
        {[
          { label:"Total items", value:stats.total, color:V.muted },
          { label:"Expiring soon", value:stats.expiring, color:"#f59e0b", alert: stats.expiring > 0 },
          { label:"Expired", value:stats.expired, color:"#ef4444", alert: stats.expired > 0 },
          { label:"Running low", value:stats.low, color:"#6366f1", alert: stats.low > 0 },
        ].map(s => (
          <div key={s.label} style={{ background:V.card, border:`1px solid ${s.alert ? s.color + "44" : V.border}`, borderRadius:12, padding:"11px 14px" }}>
            <div style={{ fontSize:10, fontWeight:700, color:V.faint, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:4 }}>{s.label}</div>
            <div style={{ fontSize:20, fontWeight:800, color:s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Category tabs */}
      <div style={{ padding:"14px 24px 0", display:"flex", gap:6, flexWrap:"wrap" }}>
        {/* Aromatica shortcut */}
        <button onClick={() => router.push(AROMATICA_META.href)}
          style={{ padding:"7px 14px", borderRadius:999, border:`1px solid ${AROMATICA_META.color}44`, background:`${AROMATICA_META.color}12`, color:AROMATICA_META.color, cursor:"pointer", fontSize:12, fontWeight:700, display:"flex", gap:5, alignItems:"center" }}>
          <span>{AROMATICA_META.icon}</span>
          Aromatica ↗
        </button>
        <div style={{ width:1, background:V.border, margin:"0 2px" }} />
        {(["All", ...Object.keys(CAT_META)] as (Category | "All")[]).map(cat => {
          const m = cat !== "All" ? CAT_META[cat as Category] : null;
          const count = cat === "All" ? items.filter(x => !x.isFinished).length : items.filter(x => x.category === cat && !x.isFinished).length;
          return (
            <button key={cat} onClick={() => setActiveCategory(cat)}
              style={{ padding:"7px 14px", borderRadius:999, border:`1px solid ${activeCategory === cat ? (m?.color ?? V.accent) : V.border}`, background: activeCategory === cat ? (m?.color ?? V.accent) + "20" : "transparent", color: activeCategory === cat ? (m?.color ?? V.accent) : V.muted, cursor:"pointer", fontSize:12, fontWeight:700, display:"flex", gap:5, alignItems:"center" }}>
              {m && <span>{m.icon}</span>}
              {cat}
              <span style={{ fontSize:10, opacity:0.7 }}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* Search + sort */}
      <div style={{ padding:"10px 24px 0", display:"flex", gap:10, flexWrap:"wrap" }}>
        <input style={{ ...inp, borderRadius:999, flex:1, minWidth:160 }} placeholder="Search items, brands, locations…" value={search} onChange={e => setSearch(e.target.value)} />
        <select style={{ ...inp, width:"auto", borderRadius:999, cursor:"pointer" }} value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)}>
          <option value="name">Name A–Z</option>
          <option value="expiry">Expiry date</option>
          <option value="quantity">Quantity</option>
          <option value="location">Location</option>
        </select>
      </div>

      {/* Aromatica featured card */}
      {activeCategory === "All" && (
        <div style={{ margin:"10px 24px 0" }}>
          <button onClick={() => router.push(AROMATICA_META.href)}
            style={{ width:"100%", display:"flex", alignItems:"center", gap:14, padding:"14px 18px", background:V.card, border:`1px solid ${AROMATICA_META.color}33`, borderRadius:14, cursor:"pointer", textAlign:"left" }}>
            <div style={{ width:44, height:44, borderRadius:12, background:`${AROMATICA_META.color}18`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:24, flexShrink:0 }}>{AROMATICA_META.icon}</div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:14, fontWeight:800, color:V.text }}>Aromatica <span style={{ fontSize:11, color:AROMATICA_META.color, fontWeight:700 }}>↗</span></div>
              <div style={{ fontSize:12, color:V.muted, marginTop:1 }}>{AROMATICA_META.description}</div>
            </div>
            <div style={{ fontSize:11, color:AROMATICA_META.color, fontWeight:700, flexShrink:0 }}>Open →</div>
          </button>
        </div>
      )}

      {/* Items grouped by location */}
      <div style={{ padding:"14px 24px 32px" }}>
        {filtered.length === 0 ? (
          <div style={{ padding:"60px 0", textAlign:"center" }}>
            <div style={{ fontSize:48, marginBottom:12 }}>📦</div>
            <div style={{ fontSize:16, fontWeight:600, color:V.muted }}>{search ? "No results" : "Nothing here yet"}</div>
            <div style={{ fontSize:13, color:V.faint, marginTop:6 }}>Click + Add item to start tracking</div>
          </div>
        ) : sortBy === "location" ? (
          Array.from(byLocation.entries()).map(([loc, locItems]) => (
            <div key={loc} style={{ marginBottom:20 }}>
              <div style={{ fontSize:11, fontWeight:800, textTransform:"uppercase", letterSpacing:"0.1em", color:V.faint, marginBottom:8, display:"flex", alignItems:"center", gap:8 }}>
                <span>📍 {loc}</span>
                <span style={{ opacity:0.5 }}>{locItems.length} item{locItems.length > 1 ? "s" : ""}</span>
              </div>
              <ItemGrid items={locItems} V={V} btn={btn} router={router} onToggle={toggleFinished} onQty={updateQty} />
            </div>
          ))
        ) : (
          <ItemGrid items={filtered} V={V} btn={btn} router={router} onToggle={toggleFinished} onQty={updateQty} />
        )}
      </div>

      {/* Add modal */}
      {showAdd && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:50, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }} onClick={() => setShowAdd(false)}>
          <div style={{ background:V.card, border:`1px solid ${V.border}`, borderRadius:18, width:"min(620px,100%)", maxHeight:"92vh", overflow:"auto" }} onClick={e => e.stopPropagation()}>
            <div style={{ padding:"18px 20px", borderBottom:`1px solid ${V.border}`, display:"flex", justifyContent:"space-between", alignItems:"center", position:"sticky", top:0, background:V.card, zIndex:1 }}>
              <div style={{ fontSize:18, fontWeight:800 }}>Add inventory item</div>
              <button style={btn} onClick={() => setShowAdd(false)}>✕</button>
            </div>
            <div style={{ padding:20, display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>

              {/* Category selector */}
              <div style={{ gridColumn:"1/-1" }}>
                <div style={{ fontSize:12, fontWeight:700, color:V.faint, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:8 }}>Category</div>
                <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                  {Object.entries(CAT_META).map(([cat, m]) => (
                    <button key={cat} onClick={() => setForm(f => ({ ...f, category: cat as Category, subcategory:"", unit: m.units[0], location:"" }))}
                      style={{ padding:"7px 14px", borderRadius:999, border:`1px solid ${form.category === cat ? m.color : V.border}`, background: form.category === cat ? m.color + "20" : "transparent", color: form.category === cat ? m.color : V.muted, cursor:"pointer", fontSize:12, fontWeight:700 }}>
                      {m.icon} {cat}
                    </button>
                  ))}
                </div>
              </div>

              <label style={{ ...lbl, gridColumn:"1/-1" }}>Item name <input style={inp} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Chicken breast, White T-shirt…" autoFocus /></label>

              <label style={lbl}>Subcategory
                <select style={inp} value={form.subcategory} onChange={e => setForm(f => ({ ...f, subcategory: e.target.value }))}>
                  <option value="">Select…</option>
                  {meta.subcategories.map(s => <option key={s}>{s}</option>)}
                </select>
              </label>

              <label style={lbl}>Location
                <select style={inp} value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))}>
                  <option value="">Select…</option>
                  {meta.locations.map(l => <option key={l}>{l}</option>)}
                  <option value="__custom">Other…</option>
                </select>
                {form.location === "__custom" && <input style={{ ...inp, marginTop:6 }} placeholder="Type location…" onChange={e => setForm(f => ({ ...f, location: e.target.value }))} />}
              </label>

              <label style={lbl}>Quantity
                <input type="number" style={inp} value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} min="0" step="0.1" />
              </label>

              <label style={lbl}>Unit
                <select style={inp} value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}>
                  {meta.units.map(u => <option key={u}>{u}</option>)}
                </select>
              </label>

              {form.category === "Food" && (
                <label style={lbl}>Expiry date
                  <input type="date" style={inp} value={form.expiryDate} onChange={e => setForm(f => ({ ...f, expiryDate: e.target.value }))} />
                </label>
              )}

              <label style={lbl}>Brand <input style={inp} value={form.brand} onChange={e => setForm(f => ({ ...f, brand: e.target.value }))} placeholder="Optional" /></label>

              <label style={lbl}>Low stock alert (qty)
                <input type="number" style={inp} value={form.lowThreshold} onChange={e => setForm(f => ({ ...f, lowThreshold: e.target.value }))} placeholder="e.g. 2 — alert when below this" />
              </label>

              <label style={lbl}>Purchase date
                <input type="date" style={inp} value={form.purchaseDate} onChange={e => setForm(f => ({ ...f, purchaseDate: e.target.value }))} />
              </label>

              <label style={lbl}>Purchase price
                <div style={{ display:"flex", gap:6 }}>
                  <input type="number" style={{ ...inp, flex:1 }} value={form.purchasePrice} onChange={e => setForm(f => ({ ...f, purchasePrice: e.target.value }))} placeholder="0" />
                  <select style={{ ...inp, width:70 }} value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}>
                    <option>AED</option><option>USD</option><option>INR</option>
                  </select>
                </div>
              </label>

              <label style={{ ...lbl, gridColumn:"1/-1" }}>Photo URL
                <input style={inp} value={form.imageUrl} onChange={e => setForm(f => ({ ...f, imageUrl: e.target.value }))} placeholder="https://… (optional)" />
              </label>

              <label style={{ ...lbl, gridColumn:"1/-1" }}>Notes
                <input style={inp} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional" />
              </label>
            </div>
            <div style={{ padding:"0 20px 20px", display:"flex", justifyContent:"flex-end", gap:8, position:"sticky", bottom:0, background:V.card, borderTop:`1px solid ${V.border}`, paddingTop:14 }}>
              <button style={btn} onClick={() => setShowAdd(false)}>Cancel</button>
              <button style={btnP} onClick={saveItem}>Save item</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div style={{ position:"fixed", bottom:20, right:16, background:isDark?"#1a3a2a":"#f0fdf4", color:"#16a34a", border:"1px solid rgba(22,163,74,0.3)", padding:"12px 18px", borderRadius:12, fontSize:13, fontWeight:700, boxShadow:"0 8px 24px rgba(0,0,0,0.2)", zIndex:200 }}>{toast}</div>}
    </div>
  );
}

// ── Item grid component ────────────────────────────────────────────────────
function ItemGrid({ items, V, btn, router, onToggle, onQty }: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  items: Item[]; V: any; btn: any; router: any;
  onToggle: (i: Item) => void;
  onQty: (i: Item, d: number) => void;
}) {
  return (
    <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))", gap:12 }}>
      {items.map(item => {
        const m = CAT_META[item.category];
        const days = daysUntilExpiry(item.expiryDate);
        const expColor = expiryColor(days);
        const isLow = item.lowThreshold !== null && item.quantity <= item.lowThreshold;
        return (
          <div key={item.id}
            style={{ background:V.card, border:`1px solid ${days !== null && days <= 7 ? expColor + "66" : isLow ? "#6366f155" : V.border}`, borderRadius:14, overflow:"hidden", opacity: item.isFinished ? 0.5 : 1, transition:"all 0.15s" }}>
            {/* Image or icon */}
            {item.imageUrl ? (
              <img src={item.imageUrl} alt="" style={{ width:"100%", height:120, objectFit:"cover", display:"block" }} />
            ) : (
              <div style={{ width:"100%", height:80, background: m.color + "15", display:"flex", alignItems:"center", justifyContent:"center", fontSize:36 }}>{m.icon}</div>
            )}
            <div style={{ padding:"10px 12px 12px" }}>
              {/* Category badge */}
              <div style={{ display:"flex", gap:6, marginBottom:4, alignItems:"center" }}>
                <span style={{ fontSize:10, fontWeight:700, padding:"2px 7px", borderRadius:999, background: m.color + "20", color: m.color }}>{item.category}</span>
                {item.subcategory && <span style={{ fontSize:10, color:V.faint }}>{item.subcategory}</span>}
              </div>
              {/* Name */}
              <button onClick={() => router.push(`/dashboard/inventory/${item.id}`)}
                style={{ background:"none", border:"none", padding:0, cursor:"pointer", textAlign:"left", fontSize:14, fontWeight:700, color:V.text, textDecoration: item.isFinished ? "line-through" : "none", marginBottom:3 }}>
                {item.name}
              </button>
              {item.brand && <div style={{ fontSize:11, color:V.faint, marginBottom:4 }}>{item.brand}</div>}
              {item.location && <div style={{ fontSize:11, color:V.muted, marginBottom:6 }}>📍 {item.location}</div>}

              {/* Expiry */}
              {days !== null && (
                <div style={{ fontSize:11, fontWeight:700, color: expColor, marginBottom:6 }}>
                  {days < 0 ? "⚠️" : days <= 7 ? "🔔" : "📅"} {expiryLabel(days)}
                </div>
              )}

              {/* Quantity controls */}
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginTop:6 }}>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <button onClick={() => onQty(item, -1)} style={{ width:26, height:26, borderRadius:6, border:`1px solid ${V.border}`, background:V.input, cursor:"pointer", fontSize:16, display:"flex", alignItems:"center", justifyContent:"center", color:V.text }}>−</button>
                  <span style={{ fontSize:14, fontWeight:700, color: isLow ? "#6366f1" : V.text, minWidth:30, textAlign:"center" }}>{item.quantity}<span style={{ fontSize:10, fontWeight:400, color:V.faint, marginLeft:2 }}>{item.unit}</span></span>
                  <button onClick={() => onQty(item, 1)} style={{ width:26, height:26, borderRadius:6, border:`1px solid ${V.border}`, background:V.input, cursor:"pointer", fontSize:16, display:"flex", alignItems:"center", justifyContent:"center", color:V.text }}>+</button>
                  {isLow && <span style={{ fontSize:10, fontWeight:700, color:"#6366f1" }}>Low!</span>}
                </div>
                <button onClick={() => onToggle(item)}
                  style={{ ...btn, padding:"4px 9px", fontSize:11, color: item.isFinished ? "#16a34a" : V.faint }}>
                  {item.isFinished ? "✓ Done" : "Finish"}
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
