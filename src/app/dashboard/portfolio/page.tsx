"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { markSynced } from "@/hooks/useSyncStatus";

type AssetType = "gold"|"silver"|"stock"|"crypto"|"other";
type Currency = "AED"|"INR"|"USD"|"GBP"|"EUR";

type PortfolioItem = {
  id: string; symbol: string; name: string; assetType: AssetType;
  unitLabel: string; mainCurrency: Currency;
  currentPrice: number | null; currentPriceUpdatedAt: string | null;
  notes: string;
};

type Purchase = {
  id: string; itemId: string; purchasedAt: string;
  unitPrice: number; units: number; totalPaid: number;
  currency: Currency; source: string; notes: string;
  itemName?: string; itemSymbol?: string;
};

const ASSET_ICONS: Record<AssetType, string> = { gold:"🥇", silver:"🥈", stock:"📊", crypto:"₿", other:"💼" };
const FX_TO_AED: Record<string, number> = { AED:1, USD:3.67, INR:0.044, GBP:4.62, EUR:4.0 };

function toAed(amount: number, currency: Currency) {
  return amount * (FX_TO_AED[currency] ?? 1);
}
function fmtNum(n: number, dec = 2) { return n.toLocaleString("en-AE", { minimumFractionDigits:dec, maximumFractionDigits:dec }); }
function nowIso() { return new Date().toISOString(); }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dbToItem(r: any): PortfolioItem {
  return { id:r.id, symbol:r.symbol, name:r.name, assetType:(r.asset_type??"other") as AssetType, unitLabel:r.unit_label??"unit", mainCurrency:(r.main_currency??"AED") as Currency, currentPrice:r.current_price??null, currentPriceUpdatedAt:r.current_price_updated_at??null, notes:r.notes??"" };
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dbToPurchase(r: any, itemName?: string, itemSymbol?: string): Purchase {
  return { id:r.id, itemId:r.item_id, purchasedAt:r.purchased_at, unitPrice:r.unit_price, units:r.units, totalPaid:r.total_paid, currency:(r.currency??"AED") as Currency, source:r.source??"", notes:r.notes??"", itemName, itemSymbol };
}

export default function PortfolioPage() {
  const supabase = createClient();
  const router = useRouter();
  const [userId, setUserId] = useState<string|null>(null);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<PortfolioItem[]>([]);
  const [recentPurchases, setRecentPurchases] = useState<Purchase[]>([]);
  const [showAddItem, setShowAddItem] = useState(false);
  const [showUpdatePrice, setShowUpdatePrice] = useState<PortfolioItem|null>(null);
  const [newPrice, setNewPrice] = useState("");
  const [toast, setToast] = useState("");
  const [newItem, setNewItem] = useState({ symbol:"", name:"", assetType:"other" as AssetType, unitLabel:"unit", mainCurrency:"AED" as Currency, notes:"" });

  const isDark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");

  useEffect(() => {
    async function load() {
      const { data:{ user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      setUserId(user.id);
      const [itemsRes, purchasesRes] = await Promise.all([
        supabase.from("portfolio_items").select("*").eq("user_id", user.id).order("created_at"),
        supabase.from("portfolio_purchases").select("*, portfolio_items(name,symbol)").eq("user_id", user.id).order("purchased_at", { ascending:false }).limit(10),
      ]);
      const loadedItems = (itemsRes.data??[]).map(dbToItem);
      setItems(loadedItems);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setRecentPurchases((purchasesRes.data??[]).map((r:any) => dbToPurchase(r, r.portfolio_items?.name, r.portfolio_items?.symbol)));
      markSynced();
      setLoading(false);
    }
    load();
  }, []);

  // Per-item stats
  const itemStats = useMemo(() => {
    const map = new Map<string, { totalUnits:number; totalPaidAed:number; avgUnitPrice:number }>();
    for (const item of items) {
      map.set(item.id, { totalUnits:0, totalPaidAed:0, avgUnitPrice:0 });
    }
    // We need purchases per item — load from recentPurchases but we need all
    return map;
  }, [items]);

  async function loadItemStats(itemId: string) {
    const { data } = await supabase.from("portfolio_purchases").select("*").eq("item_id", itemId);
    if (!data) return { totalUnits:0, totalPaidAed:0, avgUnitPrice:0 };
    const totalUnits = data.reduce((s,r) => s + r.units, 0);
    const totalPaidAed = data.reduce((s,r) => s + toAed(r.total_paid, r.currency as Currency), 0);
    const avgUnitPrice = totalUnits > 0 ? totalPaidAed / totalUnits : 0;
    return { totalUnits, totalPaidAed, avgUnitPrice };
  }

  // Pre-load stats for all items
  const [allStats, setAllStats] = useState<Record<string, { totalUnits:number; totalPaidAed:number; avgUnitPrice:number }>>({});

  useEffect(() => {
    if (items.length === 0) return;
    async function loadAll() {
      const results: Record<string, { totalUnits:number; totalPaidAed:number; avgUnitPrice:number }> = {};
      for (const item of items) {
        results[item.id] = await loadItemStats(item.id);
      }
      setAllStats(results);
    }
    loadAll();
  }, [items]);

  async function addItem() {
    if (!userId || !newItem.symbol.trim() || !newItem.name.trim()) { showToast("Symbol and name required"); return; }
    const { data } = await supabase.from("portfolio_items").insert({ user_id:userId, symbol:newItem.symbol.trim().toUpperCase(), name:newItem.name.trim(), asset_type:newItem.assetType, unit_label:newItem.unitLabel, main_currency:newItem.mainCurrency, notes:newItem.notes }).select("*").single();
    if (data) { setItems(p => [...p, dbToItem(data)]); setShowAddItem(false); showToast("Item added"); }
  }

  async function updateCurrentPrice(item: PortfolioItem) {
    const price = parseFloat(newPrice);
    if (isNaN(price) || price <= 0) { showToast("Enter a valid price"); return; }
    await supabase.from("portfolio_items").update({ current_price:price, current_price_updated_at:nowIso() }).eq("id", item.id);
    setItems(p => p.map(x => x.id===item.id ? {...x, currentPrice:price, currentPriceUpdatedAt:nowIso()} : x));
    setShowUpdatePrice(null); setNewPrice(""); showToast("Price updated");
  }

  function showToast(msg: string) { setToast(msg); setTimeout(()=>setToast(""),2500); }

  // Total portfolio stats
  const totalStats = useMemo(() => {
    let totalCostAed = 0, totalCurrentAed = 0;
    for (const item of items) {
      const s = allStats[item.id];
      if (!s) continue;
      totalCostAed += s.totalPaidAed;
      if (item.currentPrice) totalCurrentAed += item.currentPrice * s.totalUnits;
      else totalCurrentAed += s.totalPaidAed;
    }
    return { totalCostAed, totalCurrentAed, plAed: totalCurrentAed - totalCostAed };
  }, [items, allStats]);

  const V = { bg:isDark?"#0d0f14":"#f9f8f5", card:isDark?"#16191f":"#ffffff", border:isDark?"rgba(255,255,255,0.07)":"rgba(0,0,0,0.07)", text:isDark?"#f0ede8":"#1a1a1a", muted:isDark?"#9ba3b2":"#6b7280", faint:isDark?"#5c6375":"#9ca3af", input:isDark?"#1e2130":"#f9fafb", accent:"#F5A623" };
  const btn = { padding:"8px 14px", borderRadius:10, border:`1px solid ${V.border}`, background:V.card, color:V.text, cursor:"pointer", fontSize:13, fontWeight:600 } as const;
  const btnPrimary = { ...btn, background:V.accent, border:"none", color:"#fff", fontWeight:700 } as const;
  const inp = { padding:"8px 12px", borderRadius:8, border:`1px solid ${V.border}`, background:V.input, color:V.text, fontSize:13, outline:"none", width:"100%", boxSizing:"border-box" as const };
  const lbl = { display:"flex" as const, flexDirection:"column" as const, gap:5, fontSize:12, fontWeight:700, color:V.muted, textTransform:"uppercase" as const, letterSpacing:"0.06em" };

  if (loading) return <div style={{ minHeight:"60vh", display:"flex", alignItems:"center", justifyContent:"center", background:V.bg }}><div style={{ width:28, height:28, border:`2.5px solid ${V.accent}`, borderTopColor:"transparent", borderRadius:"50%", animation:"spin 0.7s linear infinite" }}/><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style></div>;

  const plColor = totalStats.plAed >= 0 ? "#16a34a" : "#ef4444";
  const plSign  = totalStats.plAed >= 0 ? "+" : "";

  return (
    <div style={{ minHeight:"100vh", background:V.bg, color:V.text, fontFamily:"system-ui,sans-serif" }}>

      {/* Header */}
      <div style={{ padding:"22px 24px 0", display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:12 }}>
        <div>
          <div style={{ fontSize:22, fontWeight:800 }}>Port<span style={{ color:V.accent, fontStyle:"italic" }}>folio</span></div>
          <div style={{ fontSize:13, color:V.faint, marginTop:2 }}>Stocks · Gold · Metals</div>
        </div>
        <button style={btnPrimary} onClick={() => setShowAddItem(true)}>+ Add asset</button>
      </div>

      {/* Summary cards */}
      <div style={{ padding:"14px 24px 0", display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))", gap:10 }}>
        {[
          { label:"Total invested", value:`AED ${fmtNum(totalStats.totalCostAed)}`, color:V.accent },
          { label:"Current value",  value:`AED ${fmtNum(totalStats.totalCurrentAed)}`, color:V.text },
          { label:"P&L",            value:`${plSign}AED ${fmtNum(Math.abs(totalStats.plAed))}`, color:plColor },
          { label:"Assets",         value:items.length, color:V.muted },
        ].map(s => (
          <div key={s.label} style={{ background:V.card, border:`1px solid ${V.border}`, borderRadius:12, padding:"12px 14px" }}>
            <div style={{ fontSize:10, fontWeight:700, color:V.faint, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:4 }}>{s.label}</div>
            <div style={{ fontSize:17, fontWeight:800, color:s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Asset list */}
      <div style={{ padding:"16px 24px" }}>
        {items.length === 0 ? (
          <div style={{ padding:"60px 0", textAlign:"center" }}>
            <div style={{ fontSize:40, marginBottom:12 }}>📈</div>
            <div style={{ fontSize:16, fontWeight:600, color:V.muted }}>No assets yet</div>
            <div style={{ fontSize:13, color:V.faint, marginTop:6 }}>Click + Add asset to get started</div>
          </div>
        ) : (
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {items.map(item => {
              const s = allStats[item.id] ?? { totalUnits:0, totalPaidAed:0, avgUnitPrice:0 };
              const currentValueAed = item.currentPrice ? item.currentPrice * s.totalUnits : null;
              const pl = currentValueAed !== null ? currentValueAed - s.totalPaidAed : null;
              const plPct = pl !== null && s.totalPaidAed > 0 ? (pl / s.totalPaidAed) * 100 : null;
              const isUp = pl !== null && pl >= 0;

              return (
                <div key={item.id} onClick={() => router.push(`/dashboard/portfolio/${item.id}`)}
                  style={{ background:V.card, border:`1px solid ${V.border}`, borderRadius:14, padding:"16px 18px", cursor:"pointer", transition:"all 0.15s" }}
                  onMouseEnter={e=>(e.currentTarget as HTMLDivElement).style.borderColor="rgba(245,166,35,0.4)"}
                  onMouseLeave={e=>(e.currentTarget as HTMLDivElement).style.borderColor=V.border}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12, flexWrap:"wrap" }}>
                    <div style={{ display:"flex", gap:12, alignItems:"center" }}>
                      <div style={{ width:44, height:44, borderRadius:12, background:`${V.accent}15`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, flexShrink:0 }}>
                        {ASSET_ICONS[item.assetType]}
                      </div>
                      <div>
                        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                          <span style={{ fontSize:16, fontWeight:800 }}>{item.name}</span>
                          <span style={{ fontSize:11, fontWeight:700, padding:"2px 8px", borderRadius:999, background:"rgba(245,166,35,0.1)", color:V.accent }}>{item.symbol}</span>
                        </div>
                        <div style={{ fontSize:12, color:V.faint, marginTop:2 }}>{fmtNum(s.totalUnits, 4)} {item.unitLabel} · Avg AED {fmtNum(s.avgUnitPrice)}/{item.unitLabel}</div>
                      </div>
                    </div>
                    <div style={{ textAlign:"right" }}>
                      <div style={{ fontSize:15, fontWeight:800, color:V.text }}>
                        {currentValueAed !== null ? `AED ${fmtNum(currentValueAed)}` : <span style={{ color:V.faint }}>No price set</span>}
                      </div>
                      {pl !== null && (
                        <div style={{ fontSize:12, fontWeight:700, color:isUp?"#16a34a":"#ef4444", marginTop:2 }}>
                          {isUp?"+":""}{fmtNum(pl)} AED ({isUp?"+":""}{plPct?.toFixed(1)}%)
                        </div>
                      )}
                      <button onClick={e => { e.stopPropagation(); setShowUpdatePrice(item); setNewPrice(item.currentPrice?.toString()??""); }}
                        style={{ ...btn, padding:"3px 10px", fontSize:10, marginTop:4 }}>
                        Update price
                      </button>
                    </div>
                  </div>
                  {item.currentPrice && (
                    <div style={{ marginTop:10, paddingTop:10, borderTop:`1px solid ${V.border}`, display:"flex", gap:20, flexWrap:"wrap", fontSize:12 }}>
                      <span style={{ color:V.muted }}>Cost: <strong style={{ color:V.text }}>AED {fmtNum(s.totalPaidAed)}</strong></span>
                      <span style={{ color:V.muted }}>Current price: <strong style={{ color:V.text }}>AED {fmtNum(item.currentPrice)}/{item.unitLabel}</strong></span>
                      {item.currentPriceUpdatedAt && <span style={{ color:V.faint }}>Updated: {new Date(item.currentPriceUpdatedAt).toLocaleDateString("en-AE")}</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Recent purchases */}
      {recentPurchases.length > 0 && (
        <div style={{ margin:"0 24px 24px", background:V.card, border:`1px solid ${V.border}`, borderRadius:14, overflow:"hidden" }}>
          <div style={{ padding:"11px 16px", borderBottom:`1px solid ${V.border}`, fontSize:11, fontWeight:800, textTransform:"uppercase", letterSpacing:"0.1em", color:V.faint, background:isDark?"rgba(255,255,255,0.03)":"rgba(0,0,0,0.02)" }}>
            Last 10 purchases
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 0.7fr 0.7fr 0.8fr", gap:8, padding:"8px 16px", fontSize:10, fontWeight:800, textTransform:"uppercase", letterSpacing:"0.08em", color:V.faint, borderBottom:`1px solid ${V.border}` }}>
            <div>Asset</div><div>Units</div><div>Paid</div><div>Date</div>
          </div>
          {recentPurchases.map(p => (
            <div key={p.id} style={{ display:"grid", gridTemplateColumns:"1fr 0.7fr 0.7fr 0.8fr", gap:8, padding:"10px 16px", borderBottom:`1px solid ${V.border}`, fontSize:13, alignItems:"center" }}>
              <div style={{ fontWeight:700 }}>{p.itemName ?? "—"} <span style={{ fontSize:11, color:V.faint }}>({p.itemSymbol})</span></div>
              <div style={{ color:V.muted }}>{fmtNum(p.units, 4)}</div>
              <div style={{ fontWeight:700 }}>{p.currency} {fmtNum(p.totalPaid)}</div>
              <div style={{ fontSize:11, color:V.faint }}>{new Date(p.purchasedAt).toLocaleDateString("en-AE")}</div>
            </div>
          ))}
        </div>
      )}

      {/* Add item modal */}
      {showAddItem && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:50, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }} onClick={()=>setShowAddItem(false)}>
          <div style={{ background:V.card, border:`1px solid ${V.border}`, borderRadius:18, width:"min(520px,100%)", maxHeight:"90vh", overflow:"auto" }} onClick={e=>e.stopPropagation()}>
            <div style={{ padding:"18px 20px", borderBottom:`1px solid ${V.border}`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div style={{ fontSize:18, fontWeight:800 }}>Add asset</div>
              <button style={btn} onClick={()=>setShowAddItem(false)}>✕</button>
            </div>
            <div style={{ padding:20, display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
              <label style={lbl}>Symbol<input style={inp} value={newItem.symbol} onChange={e=>setNewItem(p=>({...p,symbol:e.target.value}))} placeholder="e.g. XAU, AAPL" /></label>
              <label style={lbl}>Name<input style={inp} value={newItem.name} onChange={e=>setNewItem(p=>({...p,name:e.target.value}))} placeholder="e.g. Gold, Apple Inc." /></label>
              <label style={lbl}>Type
                <select style={inp} value={newItem.assetType} onChange={e=>setNewItem(p=>({...p,assetType:e.target.value as AssetType}))}>
                  <option value="gold">Gold</option><option value="silver">Silver</option><option value="stock">Stock</option><option value="crypto">Crypto</option><option value="other">Other</option>
                </select>
              </label>
              <label style={lbl}>Unit label<input style={inp} value={newItem.unitLabel} onChange={e=>setNewItem(p=>({...p,unitLabel:e.target.value}))} placeholder="oz, share, coin…" /></label>
              <label style={lbl}>Main currency
                <select style={inp} value={newItem.mainCurrency} onChange={e=>setNewItem(p=>({...p,mainCurrency:e.target.value as Currency}))}>
                  <option>AED</option><option>USD</option><option>INR</option><option>GBP</option><option>EUR</option>
                </select>
              </label>
              <label style={{ ...lbl, gridColumn:"1/-1" }}>Notes (optional)<input style={inp} value={newItem.notes} onChange={e=>setNewItem(p=>({...p,notes:e.target.value}))} placeholder="Any notes…" /></label>
            </div>
            <div style={{ padding:"0 20px 20px", display:"flex", justifyContent:"flex-end", gap:8 }}>
              <button style={btn} onClick={()=>setShowAddItem(false)}>Cancel</button>
              <button style={btnPrimary} onClick={addItem}>Add</button>
            </div>
          </div>
        </div>
      )}

      {/* Update price modal */}
      {showUpdatePrice && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:50, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }} onClick={()=>setShowUpdatePrice(null)}>
          <div style={{ background:V.card, border:`1px solid ${V.border}`, borderRadius:18, width:"min(400px,100%)" }} onClick={e=>e.stopPropagation()}>
            <div style={{ padding:"18px 20px", borderBottom:`1px solid ${V.border}`, fontSize:18, fontWeight:800 }}>Update current price</div>
            <div style={{ padding:20 }}>
              <div style={{ fontSize:14, fontWeight:700, marginBottom:12, color:V.muted }}>{showUpdatePrice.name} ({showUpdatePrice.symbol}) — price per {showUpdatePrice.unitLabel}</div>
              <label style={lbl}>Current price ({showUpdatePrice.mainCurrency} per {showUpdatePrice.unitLabel})
                <input type="number" style={inp} value={newPrice} onChange={e=>setNewPrice(e.target.value)} placeholder="e.g. 9500" autoFocus />
              </label>
            </div>
            <div style={{ padding:"0 20px 20px", display:"flex", justifyContent:"flex-end", gap:8 }}>
              <button style={btn} onClick={()=>setShowUpdatePrice(null)}>Cancel</button>
              <button style={btnPrimary} onClick={()=>updateCurrentPrice(showUpdatePrice)}>Save</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div style={{ position:"fixed", bottom:20, right:16, background:isDark?"#1a3a2a":"#f0fdf4", color:"#16a34a", border:"1px solid rgba(22,163,74,0.3)", padding:"12px 18px", borderRadius:12, fontSize:13, fontWeight:700, boxShadow:"0 8px 24px rgba(0,0,0,0.2)", zIndex:200 }}>{toast}</div>}
    </div>
  );
}
