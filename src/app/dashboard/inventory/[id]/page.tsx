"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { todayDubai } from "@/lib/timezone";

type Category = "Food" | "Clothing" | "Household" | "Electronics" | "Other";
type Item = {
  id: string; name: string; category: Category; subcategory: string; location: string;
  quantity: number; unit: string; expiryDate: string | null; brand: string;
  imageUrl: string; notes: string; isFinished: boolean; lowThreshold: number | null;
  purchaseDate: string | null; purchasePrice: number | null; currency: string;
};

const CAT_ICONS: Record<Category, string> = {
  Food:"🥗", Clothing:"👕", Household:"🏠", Electronics:"📱", Other:"📦"
};
const CAT_COLORS: Record<Category, string> = {
  Food:"#16a34a", Clothing:"#6366f1", Household:"#f59e0b", Electronics:"#3b82f6", Other:"#9ca3af"
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dbToItem = (r: any): Item => ({
  id:r.id, name:r.name, category:r.category??"Other", subcategory:r.subcategory??"",
  location:r.location??"", quantity:r.quantity??1, unit:r.unit??"pcs",
  expiryDate:r.expiry_date??null, brand:r.brand??"", imageUrl:r.image_url??"",
  notes:r.notes??"", isFinished:r.is_finished??false, lowThreshold:r.low_threshold??null,
  purchaseDate:r.purchase_date??null, purchasePrice:r.purchase_price??null, currency:r.currency??"AED",
});

function daysLeft(d: string | null) {
  if (!d) return null;
  return Math.ceil((new Date(d).getTime() - new Date(todayDubai()).getTime()) / 86400000);
}

export default function InventoryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const supabase = createClient();
  const router = useRouter();
  const [item, setItem] = useState<Item | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEdit, setIsEdit] = useState(false);
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [quantity, setQuantity] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [brand, setBrand] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [lowThreshold, setLowThreshold] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [toast, setToast] = useState("");
  const [showDelete, setShowDelete] = useState(false);

  const isDark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      const { data } = await supabase.from("inventory_items").select("*").eq("id", id).single();
      if (data) {
        const it = dbToItem(data);
        setItem(it);
        setName(it.name); setLocation(it.location); setQuantity(it.quantity.toString());
        setExpiryDate(it.expiryDate ?? ""); setBrand(it.brand);
        setImageUrl(it.imageUrl); setNotes(it.notes);
        setLowThreshold(it.lowThreshold?.toString() ?? "");
        setPurchasePrice(it.purchasePrice?.toString() ?? "");
      }
      setLoading(false);
    }
    load();
  }, [id]);

  function showMsg(msg: string) { setToast(msg); setTimeout(() => setToast(""), 2500); }

  async function saveEdit() {
    if (!item) return;
    const payload = {
      name, location: location||null, quantity: parseFloat(quantity)||0,
      expiry_date: expiryDate||null, brand: brand||null, image_url: imageUrl||null,
      notes: notes||null, low_threshold: lowThreshold?parseFloat(lowThreshold):null,
      purchase_price: purchasePrice?parseFloat(purchasePrice):null,
      updated_at: new Date().toISOString(),
    };
    await supabase.from("inventory_items").update(payload).eq("id", item.id);
    setItem(p => p ? { ...p, name, location, quantity:parseFloat(quantity)||0,
      expiryDate:expiryDate||null, brand, imageUrl, notes,
      lowThreshold:lowThreshold?parseFloat(lowThreshold):null,
      purchasePrice:purchasePrice?parseFloat(purchasePrice):null } : p);
    setIsEdit(false); showMsg("Saved");
  }

  async function updateQty(delta: number) {
    if (!item) return;
    const newQty = Math.max(0, item.quantity + delta);
    await supabase.from("inventory_items").update({ quantity: newQty }).eq("id", item.id);
    setItem(p => p ? { ...p, quantity: newQty } : p);
    setQuantity(newQty.toString());
  }

  async function toggleFinished() {
    if (!item) return;
    await supabase.from("inventory_items").update({ is_finished: !item.isFinished }).eq("id", item.id);
    setItem(p => p ? { ...p, isFinished: !p.isFinished } : p);
  }

  async function deleteItem() {
    if (!item) return;
    await supabase.from("inventory_items").delete().eq("id", item.id);
    router.push("/dashboard/inventory");
  }

  const V = { bg:isDark?"#0d0f14":"#f9f8f5", card:isDark?"#16191f":"#ffffff", border:isDark?"rgba(255,255,255,0.07)":"rgba(0,0,0,0.07)", text:isDark?"#f0ede8":"#1a1a1a", muted:isDark?"#9ba3b2":"#6b7280", faint:isDark?"#5c6375":"#9ca3af", input:isDark?"#1e2130":"#f9fafb", accent:"#F5A623" };
  const btn = { padding:"7px 13px", borderRadius:9, border:`1px solid ${V.border}`, background:V.card, color:V.text, cursor:"pointer", fontSize:12, fontWeight:600 } as const;
  const btnP = { ...btn, background:V.accent, border:"none", color:"#fff", fontWeight:700 } as const;
  const inp = { padding:"8px 12px", borderRadius:8, border:`1px solid ${V.border}`, background:V.input, color:V.text, fontSize:13, outline:"none", width:"100%", boxSizing:"border-box" as const };
  const section = { background:V.card, border:`1px solid ${V.border}`, borderRadius:14, overflow:"hidden" as const, marginBottom:14 };
  const sHead = { padding:"10px 16px", borderBottom:`1px solid ${V.border}`, fontSize:11, fontWeight:800, textTransform:"uppercase" as const, letterSpacing:"0.1em", color:V.faint, background:isDark?"rgba(255,255,255,0.03)":"rgba(0,0,0,0.02)" };

  if (loading) return <div style={{minHeight:"60vh",display:"flex",alignItems:"center",justifyContent:"center",background:V.bg}}><div style={{width:28,height:28,border:`2.5px solid ${V.accent}`,borderTopColor:"transparent",borderRadius:"50%",animation:"spin 0.7s linear infinite"}}/><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style></div>;
  if (!item) return <div style={{padding:40,background:V.bg,minHeight:"100vh",color:V.muted}}>Not found. <Link href="/dashboard/inventory" style={{color:V.accent}}>Back</Link></div>;

  const days = daysLeft(item.expiryDate);
  const catColor = CAT_COLORS[item.category];
  const isLow = item.lowThreshold !== null && item.quantity <= item.lowThreshold;

  return (
    <div style={{minHeight:"100vh",background:V.bg,color:V.text,fontFamily:"system-ui,sans-serif"}}>
      {/* Nav */}
      <div style={{position:"sticky",top:0,zIndex:20,background:isDark?"rgba(13,15,20,0.9)":"rgba(249,248,245,0.9)",backdropFilter:"blur(12px)",borderBottom:`1px solid ${V.border}`,padding:"12px 24px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <Link href="/dashboard/inventory" style={{display:"flex",alignItems:"center",gap:8,color:V.muted,textDecoration:"none",fontWeight:600,fontSize:13}}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          Inventory
        </Link>
        <div style={{display:"flex",gap:6}}>
          <button style={{...btn,borderColor:"rgba(239,68,68,0.3)",color:"#ef4444"}} onClick={()=>setShowDelete(true)}>Delete</button>
          <button style={isEdit?btnP:btn} onClick={()=>isEdit?saveEdit():setIsEdit(true)}>{isEdit?"Save":"Edit"}</button>
        </div>
      </div>

      <div style={{maxWidth:720,margin:"0 auto",padding:"24px 20px"}}>
        {/* Hero */}
        <div style={{background:V.card,border:`1px solid ${item.isFinished?"#16a34a44":days!==null&&days<=7?"#ef444444":V.border}`,borderRadius:18,overflow:"hidden",marginBottom:16}}>
          {item.imageUrl && <img src={item.imageUrl} alt="" style={{width:"100%",height:200,objectFit:"cover",display:"block"}} />}
          <div style={{padding:"18px 20px"}}>
            <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:6}}>
              <span style={{fontSize:24}}>{CAT_ICONS[item.category]}</span>
              <span style={{fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:999,background:catColor+"20",color:catColor}}>{item.category}</span>
              {item.subcategory&&<span style={{fontSize:11,color:V.faint}}>{item.subcategory}</span>}
              {item.isFinished&&<span style={{fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:999,background:"rgba(22,163,74,0.12)",color:"#16a34a"}}>✓ Finished</span>}
            </div>
            <h1 style={{fontSize:24,fontWeight:800,margin:"0 0 4px",textDecoration:item.isFinished?"line-through":"none"}}>{isEdit?<input style={{...inp,fontSize:22,fontWeight:800}}value={name}onChange={e=>setName(e.target.value)}/>:item.name}</h1>
            {item.brand&&<div style={{fontSize:13,color:V.muted,marginBottom:8}}>{item.brand}</div>}
            {item.location&&<div style={{fontSize:12,color:V.faint}}>📍 {isEdit?<input style={{...inp,display:"inline",width:"auto"}}value={location}onChange={e=>setLocation(e.target.value)}/>:item.location}</div>}

            {/* Expiry alert */}
            {days !== null && (
              <div style={{marginTop:12,padding:"10px 14px",borderRadius:10,background:days<0?"rgba(239,68,68,0.1)":days<=3?"rgba(239,68,68,0.08)":days<=7?"rgba(245,158,11,0.08)":"rgba(22,163,74,0.06)",border:`1px solid ${days<0?"rgba(239,68,68,0.3)":days<=7?"rgba(245,158,11,0.3)":"rgba(22,163,74,0.2)"}`}}>
                <div style={{fontSize:13,fontWeight:700,color:days<0?"#ef4444":days<=7?"#f59e0b":"#16a34a"}}>
                  {days<0?`⚠️ Expired ${Math.abs(days)} day${Math.abs(days)>1?"s":""} ago`:days===0?"⚠️ Expires today!":days===1?"🔔 Expires tomorrow":`📅 ${days} days until expiry`}
                </div>
                {isEdit&&<input type="date" style={{...inp,marginTop:8}} value={expiryDate} onChange={e=>setExpiryDate(e.target.value)} />}
                {!isEdit&&<div style={{fontSize:11,color:V.faint,marginTop:2}}>Expiry: {item.expiryDate}</div>}
              </div>
            )}
            {isEdit&&!item.expiryDate&&item.category==="Food"&&(
              <div style={{marginTop:8}}><label style={{fontSize:12,color:V.faint}}>Add expiry date</label><input type="date" style={{...inp,marginTop:4}} value={expiryDate} onChange={e=>setExpiryDate(e.target.value)}/></div>
            )}
          </div>
        </div>

        {/* Quantity */}
        <div style={section}>
          <div style={sHead}>Quantity</div>
          <div style={{padding:"16px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
            <div style={{display:"flex",alignItems:"center",gap:16}}>
              <button onClick={()=>updateQty(-1)} style={{width:36,height:36,borderRadius:8,border:`1px solid ${V.border}`,background:V.input,cursor:"pointer",fontSize:20,display:"flex",alignItems:"center",justifyContent:"center",color:V.text}}>−</button>
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:28,fontWeight:800,color:isLow?"#6366f1":V.text}}>{item.quantity}</div>
                <div style={{fontSize:12,color:V.faint}}>{item.unit}</div>
              </div>
              <button onClick={()=>updateQty(1)} style={{width:36,height:36,borderRadius:8,border:`1px solid ${V.border}`,background:V.input,cursor:"pointer",fontSize:20,display:"flex",alignItems:"center",justifyContent:"center",color:V.text}}>+</button>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:4}}>
              {isLow&&<div style={{fontSize:12,fontWeight:700,color:"#6366f1"}}>⚠ Running low!</div>}
              {item.lowThreshold!==null&&<div style={{fontSize:11,color:V.faint}}>Alert below: {item.lowThreshold} {item.unit}</div>}
              {isEdit&&<div><label style={{fontSize:11,color:V.faint}}>Low stock threshold</label><input type="number" style={{...inp,width:100,marginTop:4}} value={lowThreshold} onChange={e=>setLowThreshold(e.target.value)}/></div>}
            </div>
          </div>
        </div>

        {/* Details */}
        <div style={section}>
          <div style={sHead}>Details</div>
          <div style={{padding:"14px 20px",display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
            {[
              {label:"Brand",value:item.brand,edit:<input style={inp} value={brand} onChange={e=>setBrand(e.target.value)}/>},
              {label:"Location",value:item.location,edit:<input style={inp} value={location} onChange={e=>setLocation(e.target.value)}/>},
              {label:"Purchase date",value:item.purchaseDate,edit:<input type="date" style={inp} value={item.purchaseDate??""} onChange={()=>{}}/>},
              {label:"Purchase price",value:item.purchasePrice?`${item.currency} ${item.purchasePrice}`:null,edit:<input type="number" style={inp} value={purchasePrice} onChange={e=>setPurchasePrice(e.target.value)}/>},
            ].map(row=>(
              <div key={row.label}>
                <div style={{fontSize:10,fontWeight:700,color:V.faint,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:4}}>{row.label}</div>
                {isEdit?row.edit:<div style={{fontSize:13,fontWeight:600,color:row.value?V.text:V.faint}}>{row.value||"—"}</div>}
              </div>
            ))}
          </div>
        </div>

        {/* Photo */}
        {isEdit&&(
          <div style={section}>
            <div style={sHead}>Photo URL</div>
            <div style={{padding:"12px 16px"}}><input style={inp} value={imageUrl} onChange={e=>setImageUrl(e.target.value)} placeholder="https://…"/></div>
          </div>
        )}

        {/* Notes */}
        <div style={section}>
          <div style={sHead}>Notes</div>
          <div style={{padding:"12px 16px"}}>
            {isEdit
              ? <textarea style={{...inp,minHeight:80,resize:"vertical"}} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Any notes…"/>
              : <div style={{fontSize:13,color:item.notes?V.text:V.faint,lineHeight:1.6}}>{item.notes||"No notes"}</div>
            }
          </div>
        </div>

        {/* Actions */}
        <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
          <button onClick={toggleFinished} style={{...btn,flex:1,justifyContent:"center",display:"flex",color:item.isFinished?"#16a34a":V.muted}}>
            {item.isFinished?"↩ Mark as active":"✓ Mark as finished"}
          </button>
          {isEdit&&<button style={{...btn,color:V.faint}} onClick={()=>setIsEdit(false)}>Cancel</button>}
        </div>
      </div>

      {/* Delete confirm */}
      {showDelete&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:50,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setShowDelete(false)}>
          <div style={{background:V.card,border:`1px solid ${V.border}`,borderRadius:16,padding:22,width:"min(380px,100%)"}} onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:16,fontWeight:800,marginBottom:8}}>Delete {item.name}?</div>
            <div style={{fontSize:13,color:V.muted,marginBottom:16}}>This cannot be undone.</div>
            <div style={{display:"flex",justifyContent:"flex-end",gap:8}}>
              <button style={btn} onClick={()=>setShowDelete(false)}>Cancel</button>
              <button style={{...btn,borderColor:"rgba(239,68,68,0.4)",color:"#ef4444"}} onClick={deleteItem}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {toast&&<div style={{position:"fixed",bottom:20,right:16,background:isDark?"#1a3a2a":"#f0fdf4",color:"#16a34a",border:"1px solid rgba(22,163,74,0.3)",padding:"12px 18px",borderRadius:12,fontSize:13,fontWeight:700,boxShadow:"0 8px 24px rgba(0,0,0,0.2)",zIndex:200}}>{toast}</div>}
    </div>
  );
}
