"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { markSynced } from "@/hooks/useSyncStatus";

type AssetType = "gold"|"silver"|"stock"|"crypto"|"other";
type Currency  = "AED"|"INR"|"USD"|"GBP"|"EUR";

type PortfolioItem = {
  id:string; symbol:string; name:string; assetType:AssetType;
  unitLabel:string; mainCurrency:Currency;
  currentPrice:number|null; currentPriceUpdatedAt:string|null; notes:string;
};
type Purchase = {
  id:string; itemId:string; purchasedAt:string; unitPrice:number;
  units:number; totalPaid:number; currency:Currency; source:string;
  itemName?:string; itemSymbol?:string;
};
type ItemStats = { totalUnits:number; totalPaidAed:number; avgUnitPrice:number };

const FX:Record<string,number> = { AED:1, USD:3.67, INR:0.044, GBP:4.62, EUR:4.0 };
const toAed = (a:number,c:Currency) => a*(FX[c]??1);
const fmtN = (n:number,d=2) => n.toLocaleString("en-AE",{minimumFractionDigits:d,maximumFractionDigits:d});
const ASSET_ICONS:Record<AssetType,string> = {gold:"🥇",silver:"🥈",stock:"📊",crypto:"₿",other:"💼"};

// Live price fetching
async function fetchLivePrice(symbol:string, assetType:AssetType): Promise<number|null> {
  const sym = symbol.toUpperCase();
  const proxy = (url:string) => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
  try {
    let usdToAed = FX["USD"];
    try {
      const fxRes = await fetch("https://api.frankfurter.app/latest?from=USD&to=AED");
      const fxData = await fxRes.json();
      if (fxData?.rates?.AED) usdToAed = fxData.rates.AED;
    } catch { /* use default */ }

    const tickerMap: Record<string,string> = {
      XAU:"XAUUSD=X", XAG:"XAGUSD=X", BTC:"BTC-USD", ETH:"ETH-USD"
    };
    const ticker = tickerMap[sym] ?? sym;
    const r = await fetch(proxy(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=5d`));
    const wrapper = await r.json();
    const data = JSON.parse(wrapper?.contents ?? "{}");
    const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
    if (!price || price <= 0) return null;
    const currency = data?.chart?.result?.[0]?.meta?.currency ?? "USD";
    return currency === "USD" ? price * usdToAed : price;
  } catch { return null; }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dbToItem = (r:any):PortfolioItem => ({
  id:r.id,symbol:r.symbol,name:r.name,assetType:(r.asset_type??"other") as AssetType,
  unitLabel:r.unit_label??"unit",mainCurrency:(r.main_currency??"AED") as Currency,
  currentPrice:r.current_price??null,currentPriceUpdatedAt:r.current_price_updated_at??null,notes:r.notes??""
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dbToPurchase = (r:any):Purchase => ({
  id:r.id,itemId:r.item_id,purchasedAt:r.purchased_at,unitPrice:r.unit_price,
  units:r.units,totalPaid:r.total_paid,currency:(r.currency??"AED") as Currency,
  source:r.source??"",itemName:r.portfolio_items?.name,itemSymbol:r.portfolio_items?.symbol
});

export default function PortfolioPage() {
  const supabase = createClient();
  const router   = useRouter();
  const [userId,  setUserId]  = useState<string|null>(null);
  const [loading, setLoading] = useState(true);
  const [items,   setItems]   = useState<PortfolioItem[]>([]);
  const [allStats,setAllStats]= useState<Record<string,ItemStats>>({});
  const [recent,  setRecent]  = useState<Purchase[]>([]);
  const [liveLoading, setLiveLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"assets"|"prices">("assets");
  const [livePrices, setLivePrices] = useState<Record<string,{bid:number;ask:number;updated:string}>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const stored = localStorage.getItem("portfolio_live_prices");
      if (stored) {
        const { prices, fetchedAt } = JSON.parse(stored);
        // Use stored prices if less than 4 hours old
        const age = Date.now() - new Date(fetchedAt).getTime();
        if (age < 4 * 60 * 60 * 1000) return prices;
      }
    } catch {}
    return {};
  });
  const [priceLoading, setPriceLoading] = useState(false);
  const [customSymbols, setCustomSymbols] = useState<string[]>(["PARKIN.DFM"]);
  const [newSymbol, setNewSymbol] = useState("");
  const [showAddItem, setShowAddItem] = useState(false);
  const [showDeleteItem, setShowDeleteItem] = useState<string|null>(null);
  const [showUpdatePrice, setShowUpdatePrice] = useState<PortfolioItem|null>(null);
  const [newPrice, setNewPrice] = useState("");
  const [toast,   setToast]   = useState("");
  const [newItem, setNewItem] = useState({symbol:"",name:"",assetType:"other" as AssetType,unitLabel:"unit",mainCurrency:"AED" as Currency,notes:"",livePriceLink:""});

  const isDark = typeof document!=="undefined"&&document.documentElement.classList.contains("dark");

  const loadStats = useCallback(async (uid:string, itemList:PortfolioItem[]) => {
    const results:Record<string,ItemStats> = {};
    await Promise.all(itemList.map(async item => {
      const {data} = await supabase.from("portfolio_purchases").select("units,total_paid,currency").eq("item_id",item.id);
      if (!data) { results[item.id]={totalUnits:0,totalPaidAed:0,avgUnitPrice:0}; return; }
      const totalUnits  = data.reduce((s:number,r:{units:number})=>s+r.units,0);
      const totalPaidAed= data.reduce((s:number,r:{total_paid:number;currency:string})=>s+toAed(r.total_paid,r.currency as Currency),0);
      results[item.id]  = {totalUnits,totalPaidAed,avgUnitPrice:totalUnits>0?totalPaidAed/totalUnits:0};
    }));
    setAllStats(results);
  },[supabase]);

  useEffect(()=>{
    async function load(){
      const {data:{user}} = await supabase.auth.getUser();
      if(!user){setLoading(false);return;}
      setUserId(user.id);
      const [ir,pr] = await Promise.all([
        supabase.from("portfolio_items").select("*").eq("user_id",user.id).order("created_at"),
        supabase.from("portfolio_purchases").select("*,portfolio_items(name,symbol)").eq("user_id",user.id).order("purchased_at",{ascending:false}).limit(10),
      ]);
      const loadedItems=(ir.data??[]).map(dbToItem);
      setItems(loadedItems);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setRecent((pr.data??[]).map((r:any)=>dbToPurchase(r)));
      await loadStats(user.id,loadedItems);
      markSynced();
      setLoading(false);
    }
    load();
  },[]);

  async function fetchAllLivePrices(){
    setLiveLoading(true);
    const updatable = items.filter(i=>["gold","silver","stock","crypto"].includes(i.assetType));
    const updates:PortfolioItem[] = [...items];
    await Promise.all(updatable.map(async item=>{
      const price = await fetchLivePrice(item.symbol, item.assetType);
      if(price&&price>0){
        await supabase.from("portfolio_items").update({current_price:price,current_price_updated_at:new Date().toISOString()}).eq("id",item.id);
        const idx = updates.findIndex(x=>x.id===item.id);
        if(idx>=0) updates[idx]={...updates[idx],currentPrice:price,currentPriceUpdatedAt:new Date().toISOString()};
      }
    }));
    setItems([...updates]);
    setLiveLoading(false);
    showToast("Live prices updated");
  }

  async function fetchSpotPrices() {
    setPriceLoading(true);
    const results: Record<string,{bid:number;ask:number;updated:string}> = {};
    const now = new Date().toLocaleTimeString("en-AE",{timeZone:"Asia/Dubai"});
    // Use AllOrigins CORS proxy to bypass browser CORS restrictions
    const proxy = (url:string) => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;

    // Get live USD→AED exchange rate
    let usdToAed = FX["USD"];
    try {
      const fxRes = await fetch("https://api.frankfurter.app/latest?from=USD&to=AED");
      const fxData = await fxRes.json();
      if (fxData?.rates?.AED) usdToAed = fxData.rates.AED;
    } catch { /* use default 3.67 */ }

    // Fetch Yahoo Finance price — DO NOT encode the ticker (= sign must stay literal)
    const getYahooAed = async (ticker: string): Promise<number|null> => {
      try {
        // Build URL without encoding the ticker itself
        const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=5d`;
        const r = await fetch(proxy(yahooUrl));
        const wrapper = await r.json();
        const text = wrapper?.contents;
        if (!text) return null;
        const data = JSON.parse(text);
        const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
        const currency = data?.chart?.result?.[0]?.meta?.currency ?? "USD";
        if (!price || price <= 0) return null;
        return currency === "USD" ? price * usdToAed : price;
      } catch { return null; }
    };

    // Gold — Yahoo Finance spot price XAUUSD=X (USD per troy oz)
    let goldOzAed = 0;
    try {
      const goldUrl = "https://query1.finance.yahoo.com/v8/finance/chart/XAUUSD=X?interval=1d&range=5d";
      const r = await fetch(proxy(goldUrl));
      const w = await r.json();
      const parsed = JSON.parse(w?.contents ?? "{}");
      const p = parsed?.chart?.result?.[0]?.meta?.regularMarketPrice ?? 0;
      if (p > 0) goldOzAed = p * usdToAed;
    } catch { /* skip */ }
    // Fallback: try GC=F futures
    if (!goldOzAed) {
      try {
        const r2 = await fetch(proxy("https://query1.finance.yahoo.com/v8/finance/chart/GC=F?interval=1d&range=5d"));
        const w2 = await r2.json();
        const parsed2 = JSON.parse(w2?.contents ?? "{}");
        const p2 = parsed2?.chart?.result?.[0]?.meta?.regularMarketPrice ?? 0;
        if (p2 > 0) goldOzAed = p2 * usdToAed;
      } catch { /* skip */ }
    }
    if (goldOzAed > 0) {
      const gAed = goldOzAed / 31.1035;
      results["XAU_OZ"] = { bid: goldOzAed * 0.999, ask: goldOzAed, updated: now };
      results["XAU_G"]  = { bid: gAed * 0.999,       ask: gAed,       updated: now };
    }

    // Silver — Yahoo Finance spot price XAGUSD=X (USD per troy oz)
    let silverOzAed = 0;
    try {
      const silverUrl = "https://query1.finance.yahoo.com/v8/finance/chart/XAGUSD=X?interval=1d&range=5d";
      const r = await fetch(proxy(silverUrl));
      const w = await r.json();
      const parsed = JSON.parse(w?.contents ?? "{}");
      const p = parsed?.chart?.result?.[0]?.meta?.regularMarketPrice ?? 0;
      if (p > 0) silverOzAed = p * usdToAed;
    } catch { /* skip */ }
    // Fallback: try SI=F futures
    if (!silverOzAed) {
      try {
        const r2 = await fetch(proxy("https://query1.finance.yahoo.com/v8/finance/chart/SI=F?interval=1d&range=5d"));
        const w2 = await r2.json();
        const parsed2 = JSON.parse(w2?.contents ?? "{}");
        const p2 = parsed2?.chart?.result?.[0]?.meta?.regularMarketPrice ?? 0;
        if (p2 > 0) silverOzAed = p2 * usdToAed;
      } catch { /* skip */ }
    }
    if (silverOzAed > 0) {
      const gAed = silverOzAed / 31.1035;
      results["XAG_OZ"] = { bid: silverOzAed * 0.999, ask: silverOzAed, updated: now };
      results["XAG_G"]  = { bid: gAed * 0.999,         ask: gAed,         updated: now };
    }

    // Parkin (DFM) — fetch from parkin.ae/stock-price
    try {
      const r = await fetch(proxy("https://parkin.ae/stock-price"));
      const wrapper = await r.json();
      const html: string = wrapper?.contents ?? "";
      // Multiple fallback patterns
      let parkinPrice = 0;
      const pats = [
        /TickerValueTD_LastPrice[^>]*>([\d.]+)/,
        /TickerValueTD[^>]*LastPrice[^>]*>([\d.]+)/,
        /"lastPrice"\s*:\s*"?([\d.]+)"?/,
        /"last"\s*:\s*([\d.]+)/,
        /PARK[A-Z.]*[^<]{0,30}([\d]{1,3}\.[\d]{1,4})/,
      ];
      for (const pat of pats) {
        const m = html.match(pat);
        if (m) { parkinPrice = parseFloat(m[1]); if (parkinPrice > 0) break; }
      }
      if (parkinPrice > 0) {
        results["PARKIN.DFM"] = { bid: parkinPrice*0.999, ask: parkinPrice, updated: now };
      }
    } catch { /* skip parkin */ }

    // Custom symbols via Yahoo Finance
    for (const sym of customSymbols.filter(s => s !== "PARKIN.DFM")) {
      const price = await getYahooAed(sym);
      if (price && price > 0) {
        results[sym] = { bid: price*0.999, ask: price, updated: now };
      }
    }

    setLivePrices(results);
    // Persist to localStorage so prices survive page reload
    try { localStorage.setItem("portfolio_live_prices", JSON.stringify({ prices: results, fetchedAt: new Date().toISOString() })); } catch {}
    setPriceLoading(false);

    // Auto-update current_price for linked assets using BID (sell) price
    if (userId && Object.keys(results).length > 0) {
      const { data: allItems } = await supabase.from("portfolio_items").select("id,notes,current_price").eq("user_id", userId);
      for (const item of allItems ?? []) {
        const notesStr = item.notes ?? "";
        if (notesStr.startsWith("liveprice:")) {
          const link = notesStr.split("||")[0].replace("liveprice:","").trim();
          const lp = results[link];
          if (lp && Math.abs(lp.bid - (item.current_price ?? 0)) > 0.001) {
            await supabase.from("portfolio_items").update({ current_price: lp.bid, current_price_updated_at: new Date().toISOString() }).eq("id", item.id);
          }
        }
      }
      // Reload items to reflect updated prices
      const { data: updated } = await supabase.from("portfolio_items").select("*").eq("user_id", userId).order("created_at");
      if (updated) setItems(updated.map(dbToItem));
    }

    if (Object.keys(results).length > 0) showToast(`Updated ${Object.keys(results).length} price${Object.keys(results).length > 1 ? "s" : ""}`);
    else showToast("⚠ No prices — Yahoo Finance may be rate-limiting, try again in 30s");
  }

  async function addItem(){
    if(!userId||!newItem.symbol.trim()||!newItem.name.trim()){showToast("Symbol and name required");return;}
    const notesVal = newItem.livePriceLink ? `liveprice:${newItem.livePriceLink}||${newItem.notes}` : newItem.notes;
    const {data}=await supabase.from("portfolio_items").insert({user_id:userId,symbol:newItem.symbol.trim().toUpperCase(),name:newItem.name.trim(),asset_type:newItem.assetType,unit_label:newItem.unitLabel,main_currency:newItem.mainCurrency,notes:notesVal}).select("*").single();
    if(data){
      const added=dbToItem(data);
      setItems(p=>[...p,added]);
      setAllStats(p=>({...p,[added.id]:{totalUnits:0,totalPaidAed:0,avgUnitPrice:0}}));
      setShowAddItem(false);showToast("Asset added");
    }
  }

  async function deleteItem(id: string) {
    await supabase.from("portfolio_items").delete().eq("id", id);
    setItems(p => p.filter(x => x.id !== id));
    setAllStats(p => { const n = {...p}; delete n[id]; return n; });
    setShowDeleteItem(null);
    showToast("Asset deleted");
  }

  async function updateCurrentPrice(item:PortfolioItem){
    const price=parseFloat(newPrice);
    if(isNaN(price)||price<=0){showToast("Enter a valid price");return;}
    await supabase.from("portfolio_items").update({current_price:price,current_price_updated_at:new Date().toISOString()}).eq("id",item.id);
    setItems(p=>p.map(x=>x.id===item.id?{...x,currentPrice:price,currentPriceUpdatedAt:new Date().toISOString()}:x));
    setShowUpdatePrice(null);setNewPrice("");showToast("Price updated");
  }

  function showToast(msg:string){setToast(msg);setTimeout(()=>setToast(""),2500);}

  const totals=useMemo(()=>{
    let cost=0,current=0;
    for(const item of items){
      const s=allStats[item.id];
      if(!s)continue;
      cost+=s.totalPaidAed;
      current+=item.currentPrice?item.currentPrice*s.totalUnits:s.totalPaidAed;
    }
    return {cost,current,pl:current-cost,plPct:cost>0?((current-cost)/cost)*100:0};
  },[items,allStats]);

  const V={bg:isDark?"#0d0f14":"#f9f8f5",card:isDark?"#16191f":"#ffffff",border:isDark?"rgba(255,255,255,0.07)":"rgba(0,0,0,0.07)",text:isDark?"#f0ede8":"#1a1a1a",muted:isDark?"#9ba3b2":"#6b7280",faint:isDark?"#5c6375":"#9ca3af",input:isDark?"#1e2130":"#f9fafb",accent:"#F5A623"};
  const btn={padding:"8px 14px",borderRadius:10,border:`1px solid ${V.border}`,background:V.card,color:V.text,cursor:"pointer",fontSize:13,fontWeight:600}as const;
  const btnP={...btn,background:V.accent,border:"none",color:"#fff",fontWeight:700}as const;
  const inp={padding:"8px 12px",borderRadius:8,border:`1px solid ${V.border}`,background:V.input,color:V.text,fontSize:13,outline:"none",width:"100%",boxSizing:"border-box" as const};
  const lbl={display:"flex" as const,flexDirection:"column" as const,gap:5,fontSize:12,fontWeight:700,color:V.muted,textTransform:"uppercase" as const,letterSpacing:"0.06em"};

  if(loading) return <div style={{minHeight:"60vh",display:"flex",alignItems:"center",justifyContent:"center",background:V.bg}}><div style={{width:28,height:28,border:`2.5px solid ${V.accent}`,borderTopColor:"transparent",borderRadius:"50%",animation:"spin 0.7s linear infinite"}}/><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style></div>;

  const isUp=totals.pl>=0;
  const plColor=isUp?"#16a34a":"#ef4444";

  return (
    <div style={{minHeight:"100vh",background:V.bg,color:V.text,fontFamily:"system-ui,sans-serif"}}>
      {/* Header */}
      <div style={{padding:"22px 24px 0",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12}}>
        <div>
          <div style={{fontSize:22,fontWeight:800}}>Port<span style={{color:V.accent,fontStyle:"italic"}}>folio</span></div>
          <div style={{fontSize:13,color:V.faint,marginTop:2}}>Stocks · Gold · Metals</div>
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
          <div style={{display:"flex",borderRadius:10,overflow:"hidden",border:`1px solid ${V.border}`}}>
            {(["assets","prices"] as const).map(t=>(
              <button key={t} onClick={()=>setActiveTab(t)}
                style={{padding:"7px 14px",background:activeTab===t?V.accent:"transparent",color:activeTab===t?"#fff":V.muted,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,textTransform:"capitalize"}}>
                {t==="prices"?"📊 Live Prices":t==="assets"?"My Assets":""}
              </button>
            ))}
          </div>
          {activeTab==="assets"&&<button style={btn} onClick={fetchAllLivePrices} disabled={liveLoading}>{liveLoading?"Fetching…":"🔄 Update prices"}</button>}
          {activeTab==="assets"&&<button style={btnP} onClick={()=>setShowAddItem(true)}>+ Add asset</button>}
          {activeTab==="prices"&&<button style={btnP} onClick={fetchSpotPrices} disabled={priceLoading}>{priceLoading?"Loading…":"🔄 Refresh"}</button>}
        </div>
      </div>

      {activeTab==="prices" && (
        <div style={{padding:"14px 24px"}}>
          {/* Spot price table */}
          <div style={{background:V.card,border:`1px solid ${V.border}`,borderRadius:14,overflow:"hidden",marginBottom:16}}>
            <div style={{padding:"12px 16px",borderBottom:`1px solid ${V.border}`,display:"flex",justifyContent:"space-between",alignItems:"center",background:isDark?"rgba(255,255,255,0.03)":"rgba(0,0,0,0.02)"}}>
              <span style={{fontSize:14,fontWeight:800}}>Spot Prices — AED</span>
              {Object.keys(livePrices).length===0&&<span style={{fontSize:12,color:V.faint}}>Click Refresh to load</span>}
            </div>
            {/* Headers */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 0.7fr",gap:8,padding:"8px 16px",fontSize:10,fontWeight:800,textTransform:"uppercase",letterSpacing:"0.08em",color:V.faint,borderBottom:`1px solid ${V.border}`}}>
              <div>Asset</div><div>Buy (Ask)</div><div>Sell (Bid)</div><div>Updated</div>
            </div>
            {[
              {key:"XAU_OZ",label:"24K Gold",sub:"1 oz"},
              {key:"XAU_G", label:"24K Gold",sub:"1 g"},
              {key:"XAG_OZ",label:"999 Silver",sub:"1 oz"},
              {key:"XAG_G", label:"999 Silver",sub:"1 g"},
              ...customSymbols.map(s=>({key:s,label:s,sub:""})),
            ].map(row=>{
              const p=livePrices[row.key];
              return (
                <div key={row.key} style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 0.7fr",gap:8,padding:"11px 16px",borderBottom:`1px solid ${V.border}`,alignItems:"center"}}>
                  <div><div style={{fontSize:13,fontWeight:700}}>{row.label}</div><div style={{fontSize:11,color:V.faint}}>{row.sub}</div></div>
                  <div style={{fontSize:14,fontWeight:800,color:"#16a34a"}}>{p?`AED ${fmtN(p.ask)}`:<span style={{color:V.faint}}>—</span>}</div>
                  <div style={{fontSize:14,fontWeight:700,color:"#ef4444"}}>{p?`AED ${fmtN(p.bid)}`:<span style={{color:V.faint}}>—</span>}</div>
                  <div style={{fontSize:11,color:V.faint}}>{p?.updated??"—"}</div>
                </div>
              );
            })}
          </div>
          {/* Add custom symbol */}
          <div style={{background:V.card,border:`1px solid ${V.border}`,borderRadius:12,padding:"14px 16px"}}>
            <div style={{fontSize:13,fontWeight:700,marginBottom:10}}>Custom symbols</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:10}}>
              {customSymbols.map(s=>(
                <div key={s} style={{display:"flex",alignItems:"center",gap:4,padding:"4px 10px",borderRadius:999,background:isDark?"rgba(255,255,255,0.08)":"rgba(0,0,0,0.06)",fontSize:12,fontWeight:600}}>
                  {s}
                  <button onClick={()=>setCustomSymbols(p=>p.filter(x=>x!==s))} style={{background:"none",border:"none",cursor:"pointer",color:V.faint,fontSize:14,lineHeight:1,padding:0,marginLeft:2}}>×</button>
                </div>
              ))}
            </div>
            <div style={{display:"flex",gap:8}}>
              <input style={{...inp,flex:1}} value={newSymbol} onChange={e=>setNewSymbol(e.target.value)} placeholder="e.g. AAPL, PARKIN.DFM, BTC-USD" onKeyDown={e=>e.key==="Enter"&&newSymbol.trim()&&!customSymbols.includes(newSymbol.trim())&&(setCustomSymbols(p=>[...p,newSymbol.trim()]),setNewSymbol(""))} />
              <button style={btnP} onClick={()=>{if(newSymbol.trim()&&!customSymbols.includes(newSymbol.trim())){setCustomSymbols(p=>[...p,newSymbol.trim()]);setNewSymbol("");}}}>Add</button>
            </div>
            <div style={{fontSize:11,color:V.faint,marginTop:8}}>Yahoo Finance symbols: stocks use ticker (AAPL), DFM stocks add .DFM (PARKIN.DFM), crypto add -USD (BTC-USD)</div>
          </div>
        </div>
      )}

      {activeTab==="assets" && <>
      {/* Summary */}
      <div style={{padding:"12px 24px 0",display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(155px,1fr))",gap:10}}>
        {[
          {label:"Total invested", value:`AED ${fmtN(totals.cost)}`,   color:V.accent},
          {label:"Current value",  value:`AED ${fmtN(totals.current)}`, color:V.text},
          {label:"P&L",            value:`${isUp?"+":""}AED ${fmtN(Math.abs(totals.pl))}`, color:plColor},
          {label:"Return",         value:`${isUp?"+":""}${totals.plPct.toFixed(2)}%`, color:plColor},
        ].map(s=>(
          <div key={s.label} style={{background:V.card,border:`1px solid ${V.border}`,borderRadius:12,padding:"12px 14px"}}>
            <div style={{fontSize:10,fontWeight:700,color:V.faint,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:4}}>{s.label}</div>
            <div style={{fontSize:17,fontWeight:800,color:s.color}}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Asset list */}
      <div style={{padding:"14px 24px"}}>
        {items.length===0?(
          <div style={{padding:"60px 0",textAlign:"center"}}>
            <div style={{fontSize:40,marginBottom:12}}>📈</div>
            <div style={{fontSize:16,fontWeight:600,color:V.muted}}>No assets yet</div>
            <div style={{fontSize:13,color:V.faint,marginTop:6}}>Click + Add asset to start</div>
          </div>
        ):(
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {items.map(item=>{
              const s=allStats[item.id]??{totalUnits:0,totalPaidAed:0,avgUnitPrice:0};
              const curVal=item.currentPrice?item.currentPrice*s.totalUnits:null;
              const pl=curVal!==null?curVal-s.totalPaidAed:null;
              const plPct=pl!==null&&s.totalPaidAed>0?(pl/s.totalPaidAed)*100:null;
              const up=pl!==null&&pl>=0;
              return (
                <div key={item.id} onClick={()=>router.push(`/dashboard/portfolio/${item.id}`)}
                  style={{background:V.card,border:`1px solid ${V.border}`,borderRadius:14,padding:"16px 18px",cursor:"pointer",transition:"border-color 0.15s"}}
                  onMouseEnter={e=>(e.currentTarget as HTMLDivElement).style.borderColor="rgba(245,166,35,0.4)"}
                  onMouseLeave={e=>(e.currentTarget as HTMLDivElement).style.borderColor=V.border}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,flexWrap:"wrap"}}>
                    <div style={{display:"flex",gap:12,alignItems:"center"}}>
                      <div style={{width:44,height:44,borderRadius:12,background:`${V.accent}15`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>
                        {ASSET_ICONS[item.assetType]}
                      </div>
                      <div>
                        <div style={{display:"flex",gap:8,alignItems:"center"}}>
                          <span style={{fontSize:16,fontWeight:800}}>{item.name}</span>
                          <span style={{fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:999,background:"rgba(245,166,35,0.1)",color:V.accent}}>{item.symbol}</span>
                        </div>
                        <div style={{fontSize:12,color:V.faint,marginTop:2}}>
                          {fmtN(s.totalUnits,4)} {item.unitLabel} · Avg AED {fmtN(s.avgUnitPrice)} / {item.unitLabel}
                        </div>
                        {item.currentPrice&&<div style={{fontSize:12,color:V.muted,marginTop:1}}>
                          Price: <strong style={{color:V.text}}>AED {fmtN(item.currentPrice)}</strong>
                          {item.currentPriceUpdatedAt&&<span style={{color:V.faint,marginLeft:6}}>{new Date(item.currentPriceUpdatedAt).toLocaleDateString("en-AE")}</span>}
                        </div>}
                      </div>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <div style={{fontSize:16,fontWeight:800,color:V.text}}>
                        {curVal!==null?`AED ${fmtN(curVal)}`:<span style={{color:V.faint}}>No price</span>}
                      </div>
                      {pl!==null&&(
                        <div style={{fontSize:13,fontWeight:700,color:up?"#16a34a":"#ef4444",marginTop:2}}>
                          {up?"+":""}{fmtN(pl)} ({up?"+":""}{plPct?.toFixed(2)}%)
                        </div>
                      )}
                      <div style={{fontSize:11,color:V.faint,marginTop:2}}>Cost: AED {fmtN(s.totalPaidAed)}</div>
                      <button onClick={e=>{e.stopPropagation();setShowUpdatePrice(item);setNewPrice(item.currentPrice?.toString()??"");}}
                        style={{...btn,padding:"3px 10px",fontSize:10,marginTop:4}}>Update price</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Recent purchases */}
      {recent.length>0&&(
        <div style={{margin:"0 24px 24px",background:V.card,border:`1px solid ${V.border}`,borderRadius:14,overflow:"hidden"}}>
          <div style={{padding:"11px 16px",borderBottom:`1px solid ${V.border}`,fontSize:11,fontWeight:800,textTransform:"uppercase",letterSpacing:"0.1em",color:V.faint,background:isDark?"rgba(255,255,255,0.03)":"rgba(0,0,0,0.02)"}}>Last 10 purchases</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 0.6fr 0.7fr 0.8fr",gap:8,padding:"8px 16px",fontSize:10,fontWeight:800,textTransform:"uppercase",letterSpacing:"0.08em",color:V.faint,borderBottom:`1px solid ${V.border}`}}>
            <div>Asset</div><div>Units</div><div>Paid</div><div>Date</div>
          </div>
          {recent.map(p=>(
            <div key={p.id} style={{display:"grid",gridTemplateColumns:"1fr 0.6fr 0.7fr 0.8fr",gap:8,padding:"10px 16px",borderBottom:`1px solid ${V.border}`,fontSize:13,alignItems:"center"}}>
              <div style={{fontWeight:700}}>{p.itemName} <span style={{fontSize:11,color:V.faint}}>({p.itemSymbol})</span></div>
              <div style={{color:V.muted}}>{fmtN(p.units,4)}</div>
              <div style={{fontWeight:700}}>{p.currency} {fmtN(p.totalPaid)}</div>
              <div style={{fontSize:11,color:V.faint}}>{new Date(p.purchasedAt).toLocaleDateString("en-AE")}</div>
            </div>
          ))}
        </div>
      )}

      </> }

      {/* Add item modal */}
      {showAddItem&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:50,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setShowAddItem(false)}>
          <div style={{background:V.card,border:`1px solid ${V.border}`,borderRadius:18,width:"min(520px,100%)",maxHeight:"90vh",overflow:"auto"}} onClick={e=>e.stopPropagation()}>
            <div style={{padding:"18px 20px",borderBottom:`1px solid ${V.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{fontSize:18,fontWeight:800}}>Add asset</div>
              <button style={btn} onClick={()=>setShowAddItem(false)}>✕</button>
            </div>
            <div style={{padding:20,display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
              <label style={lbl}>Symbol<input style={inp} value={newItem.symbol} onChange={e=>setNewItem(p=>({...p,symbol:e.target.value}))} placeholder="e.g. XAU" /></label>
              <label style={lbl}>Name<input style={inp} value={newItem.name} onChange={e=>setNewItem(p=>({...p,name:e.target.value}))} placeholder="e.g. Gold" /></label>
              <label style={lbl}>Type<select style={inp} value={newItem.assetType} onChange={e=>setNewItem(p=>({...p,assetType:e.target.value as AssetType}))}>
                <option value="gold">Gold</option><option value="silver">Silver</option><option value="stock">Stock</option><option value="crypto">Crypto</option><option value="other">Other</option>
              </select></label>
              <label style={lbl}>Unit<input style={inp} value={newItem.unitLabel} onChange={e=>setNewItem(p=>({...p,unitLabel:e.target.value}))} placeholder="oz, share…" /></label>
              <label style={lbl}>Currency<select style={inp} value={newItem.mainCurrency} onChange={e=>setNewItem(p=>({...p,mainCurrency:e.target.value as Currency}))}>
                <option>AED</option><option>USD</option><option>INR</option><option>GBP</option><option>EUR</option>
              </select></label>
              <label style={{...lbl,gridColumn:"1/-1"}}>
                Live price link
                <select style={inp} value={newItem.livePriceLink} onChange={e=>setNewItem(p=>({...p,livePriceLink:e.target.value}))}>
                  <option value="">None — manual price update</option>
                  <option value="XAU_OZ">24K Gold — 1 oz (AED)</option>
                  <option value="XAU_G">24K Gold — 1 g (AED)</option>
                  <option value="XAG_OZ">999 Silver — 1 oz (AED)</option>
                  <option value="XAG_G">999 Silver — 1 g (AED)</option>
                  <option value="PARKIN.DFM">Parkin (DFM)</option>
                  {customSymbols.map(s=><option key={s} value={s}>{s}</option>)}
                </select>
                <span style={{fontSize:11,color:V.faint,marginTop:2}}>Asset current price will auto-update from live prices tab (Bid/Sell rate)</span>
              </label>
              <label style={{...lbl,gridColumn:"1/-1"}}>Notes<input style={inp} value={newItem.notes} onChange={e=>setNewItem(p=>({...p,notes:e.target.value}))} /></label>
            </div>
            <div style={{padding:"0 20px 20px",display:"flex",justifyContent:"flex-end",gap:8}}>
              <button style={btn} onClick={()=>setShowAddItem(false)}>Cancel</button>
              <button style={btnP} onClick={addItem}>Add</button>
            </div>
          </div>
        </div>
      )}

      {/* Update price modal */}
      {showUpdatePrice&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:50,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setShowUpdatePrice(null)}>
          <div style={{background:V.card,border:`1px solid ${V.border}`,borderRadius:18,width:"min(380px,100%)"}} onClick={e=>e.stopPropagation()}>
            <div style={{padding:"18px 20px",borderBottom:`1px solid ${V.border}`,fontSize:18,fontWeight:800}}>Update price — {showUpdatePrice.name}</div>
            <div style={{padding:20}}>
              <label style={lbl}>{showUpdatePrice.mainCurrency} per {showUpdatePrice.unitLabel}
                <input type="number" style={inp} value={newPrice} onChange={e=>setNewPrice(e.target.value)} placeholder="e.g. 9500" autoFocus />
              </label>
            </div>
            <div style={{padding:"0 20px 20px",display:"flex",justifyContent:"flex-end",gap:8}}>
              <button style={btn} onClick={()=>setShowUpdatePrice(null)}>Cancel</button>
              <button style={btnP} onClick={()=>updateCurrentPrice(showUpdatePrice)}>Save</button>
            </div>
          </div>
        </div>
      )}

      {showDeleteItem && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:50,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setShowDeleteItem(null)}>
          <div style={{background:V.card,border:`1px solid ${V.border}`,borderRadius:16,padding:22,width:"min(360px,100%)"}} onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:16,fontWeight:800,marginBottom:8}}>Delete asset?</div>
            <div style={{fontSize:13,color:V.muted,marginBottom:16}}>All purchases for this asset will also be deleted.</div>
            <div style={{display:"flex",justifyContent:"flex-end",gap:8}}>
              <button style={btn} onClick={()=>setShowDeleteItem(null)}>Cancel</button>
              <button style={{...btn,borderColor:"rgba(239,68,68,0.4)",color:"#ef4444"}} onClick={()=>deleteItem(showDeleteItem)}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {toast&&<div style={{position:"fixed",bottom:20,right:16,background:isDark?"#1a3a2a":"#f0fdf4",color:"#16a34a",border:"1px solid rgba(22,163,74,0.3)",padding:"12px 18px",borderRadius:12,fontSize:13,fontWeight:700,boxShadow:"0 8px 24px rgba(0,0,0,0.2)",zIndex:200}}>{toast}</div>}
    </div>
  );
}