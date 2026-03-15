"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { markSynced } from "@/hooks/useSyncStatus";

// ── Types ──────────────────────────────────────────────────────────────────
type BottleType   = "Full bottle" | "Decant" | "Sample" | "Tester";
type BottleStatus = "In collection" | "Emptied" | "Sold" | "Gifted";
type GenderScale  = 0 | 1 | 2 | 3 | 4;

type Bottle = { id: string; bottleSizeMl: number; bottleType: BottleType; status: BottleStatus; usage: string };
type Purchase = { id: string; bottleId: string; date: string; ml: number; price: number; currency: string; shopName: string; shopLink?: string };
type Perfume = {
  id: string; status: "wardrobe"|"wishlist"|"archive"; brand: string; model: string; imageUrl: string;
  ratingStars: number|null; notesTags: string[]; weatherTags: ("Cold"|"Neutral"|"Hot")[];
  genderScale: GenderScale; longevity: string; sillage: string;
  value: "Worth it"|"Neutral"|"Not worth it"; cloneSimilar: string; notesText: string;
  bottles: Bottle[]; archiveReason?: string;
};

// ── Helpers ────────────────────────────────────────────────────────────────
function safeNum(x: unknown, fb = 0) { const n = typeof x === "number" ? x : Number(x); return Number.isFinite(n) ? n : fb; }
function fmtMoney(c: string, a: number) { return `${c} ${a.toFixed(2)}`; }
function genderLabel(v: GenderScale) { return ["Masculine","Lean masc.","Unisex","Lean fem.","Feminine"][v]; }

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
    bottles: (row.perfume_bottles ?? []).map((b: any): Bottle => ({
      id: b.id, bottleSizeMl: b.bottle_size_ml ?? 100,
      bottleType: b.bottle_type ?? "Full bottle",
      status: b.status ?? "In collection", usage: b.usage ?? "",
    })),
    archiveReason: row.archive_reason ?? undefined,
  };
}

function tagColor(tag: string) {
  const p = [["#dbeafe","#1e40af"],["#ede9fe","#5b21b6"],["#fce7f3","#9d174d"],["#fff7ed","#9a3412"],["#ecfdf5","#065f46"],["#f0f9ff","#0c4a6e"]];
  let h = 0; for (let i = 0; i < tag.length; i++) h = (h*31+tag.charCodeAt(i))>>>0;
  return p[h % p.length];
}

function Tag({ label, onRemove }: { label: string; onRemove?: () => void }) {
  const [bg, text] = tagColor(label);
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:4, padding:"4px 12px", borderRadius:999, fontSize:12, fontWeight:600, background:bg, color:text, border:`1px solid ${text}25` }}>
      {label}
      {onRemove && <button onClick={onRemove} style={{ background:"none",border:"none",cursor:"pointer",color:text,padding:0,lineHeight:1,fontSize:14 }}>×</button>}
    </span>
  );
}

function Stars({ value, size = 16 }: { value: number | null; size?: number }) {
  if (!value) return <span style={{ fontSize:12, color:"#9ca3af" }}>No rating</span>;
  return (
    <span style={{ display:"inline-flex", gap:2, alignItems:"center" }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <span key={i} style={{ color: i < value ? "#F5A623" : "#e5e7eb", fontSize: size }}>★</span>
      ))}
      <span style={{ fontSize:12, color:"#9ca3af", marginLeft:4 }}>{value.toFixed(1)}</span>
    </span>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────
export default function PerfumeDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const router = useRouter();
  const [item, setItem] = useState<Perfume | null>(null);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEdit, setIsEdit] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [globalNotes, setGlobalNotes] = useState<string[]>([]);
  const [noteInput, setNoteInput] = useState("");
  const [noteManager, setNoteManager] = useState(false);
  const [weatherManager, setWeatherManager] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [archiveChoice, setArchiveChoice] = useState<"Sold"|"Emptied"|"Gifted">("Emptied");
  const [showRemove, setShowRemove] = useState(false);
  const [toast, setToast] = useState("");
  const [photoMode, setPhotoMode] = useState<"url"|"upload">("url");
  const [photoInput, setPhotoInput] = useState("");
  const [showPhoto, setShowPhoto] = useState(false);

  const isDark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      setUserId(user.id);

      const [itemRes, purRes, allRes] = await Promise.all([
        supabase.from("perfumes").select("*, perfume_bottles(*)").eq("id", params.id).single(),
        supabase.from("perfume_purchases").select("*").eq("perfume_id", params.id).order("date", { ascending: false }),
        supabase.from("perfumes").select("notes_tags").eq("user_id", user.id),
      ]);

      if (itemRes.data) setItem(dbToItem(itemRes.data));
      if (purRes.data) setPurchases(purRes.data.map((p: Purchase & { perfume_id?: string; shop_name?: string; shop_link?: string; bottle_id?: string }) => ({ id: p.id, bottleId: p.bottle_id ?? "none", date: p.date, ml: p.ml ?? 0, price: p.price ?? 0, currency: p.currency ?? "AED", shopName: p.shop_name ?? "Unknown", shopLink: p.shop_link })));
      if (allRes.data) {
        const tags = Array.from(new Set(allRes.data.flatMap((r: { notes_tags: string[] }) => r.notes_tags ?? []))).sort() as string[];
        setGlobalNotes(tags);
      }
      setLoading(false);
      markSynced();
    }
    load();
  }, [params.id]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  }

  async function update(partial: Partial<Perfume>) {
    if (!item) return;
    setItem(prev => prev ? { ...prev, ...partial } : prev);
    const db: Record<string, unknown> = {};
    if (partial.ratingStars  !== undefined) db.rating_stars  = partial.ratingStars;
    if (partial.notesTags    !== undefined) db.notes_tags    = partial.notesTags;
    if (partial.weatherTags  !== undefined) db.weather_tags  = partial.weatherTags;
    if (partial.genderScale  !== undefined) db.gender_scale  = partial.genderScale;
    if (partial.longevity    !== undefined) db.longevity     = partial.longevity;
    if (partial.sillage      !== undefined) db.sillage       = partial.sillage;
    if (partial.value        !== undefined) db.value_rating  = partial.value;
    if (partial.cloneSimilar !== undefined) db.clone_similar = partial.cloneSimilar;
    if (partial.notesText    !== undefined) db.notes_text    = partial.notesText;
    if (partial.imageUrl     !== undefined) db.image_url     = partial.imageUrl;
    if (Object.keys(db).length) await supabase.from("perfumes").update(db).eq("id", item.id);
  }

  async function updateBottle(bottleId: string, partial: Partial<Bottle>) {
    if (!item) return;
    setItem(prev => prev ? { ...prev, bottles: prev.bottles.map(b => b.id === bottleId ? { ...b, ...partial } : b) } : prev);
    const db: Record<string, unknown> = {};
    if (partial.bottleType  !== undefined) db.bottle_type   = partial.bottleType;
    if (partial.bottleSizeMl!== undefined) db.bottle_size_ml= partial.bottleSizeMl;
    if (partial.status      !== undefined) db.status        = partial.status;
    if (partial.usage       !== undefined) db.usage         = partial.usage;
    if (Object.keys(db).length) await supabase.from("perfume_bottles").update(db).eq("id", bottleId);
  }

  async function doRemove() {
    if (!item) return;
    await supabase.from("perfumes").delete().eq("id", item.id);
    router.push("/dashboard/perfumes");
  }

  async function doArchive() {
    if (!item || item.status === "wishlist") return;
    await supabase.from("perfumes").update({ status:"archive", archive_reason: archiveChoice }).eq("id", item.id);
    setItem(prev => prev ? { ...prev, status:"archive", archiveReason: archiveChoice } : prev);
    setShowArchive(false);
    showToast(`Archived as ${archiveChoice}`);
  }

  async function uploadPhoto(file: File) {
    if (!userId || !item) return;
    showToast("Uploading…");
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `${userId}/${item.id}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("aromatica").upload(path, file, { upsert: true });
    if (error) { showToast("Upload failed"); return; }
    const { data } = supabase.storage.from("aromatica").getPublicUrl(path);
    await update({ imageUrl: data.publicUrl });
    setShowPhoto(false);
    showToast("Photo updated");
  }

  async function copyToClipboard() {
    if (!item) return;
    const text = `${item.brand} — ${item.model}\n⭐ ${item.ratingStars?.toFixed(1) ?? "n/a"}/5\n🌿 ${item.notesTags.join(", ") || "—"}\n🌦 ${item.weatherTags.join(", ") || "—"}\n💨 ${item.sillage} · ⏱ ${item.longevity}\n💰 ${item.value}\n🔗 Similar: ${item.cloneSimilar || "—"}`;
    try { await navigator.clipboard.writeText(text); showToast("Copied to clipboard"); }
    catch { showToast("Clipboard blocked"); }
  }

  const V = { bg: isDark ? "#0d0f14" : "#f9f8f5", card: isDark ? "#16191f" : "#ffffff", border: isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)", text: isDark ? "#f0ede8" : "#1a1a1a", muted: isDark ? "#9ba3b2" : "#6b7280", faint: isDark ? "#5c6375" : "#9ca3af", inputBg: isDark ? "#1e2130" : "#f9fafb", accent: "#F5A623" };

  if (loading) return (
    <div style={{ minHeight:"60vh", display:"flex", alignItems:"center", justifyContent:"center", background: V.bg }}>
      <div style={{ width:28, height:28, border:`2.5px solid ${V.accent}`, borderTopColor:"transparent", borderRadius:"50%", animation:"spin 0.7s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (!item) return (
    <div style={{ padding:40, textAlign:"center", background: V.bg, minHeight:"60vh", color: V.muted }}>
      <div style={{ fontSize:40, marginBottom:12 }}>🔍</div>
      <div style={{ fontSize:16, fontWeight:600 }}>Perfume not found</div>
      <Link href="/dashboard/perfumes" style={{ color: V.accent, textDecoration:"none", fontWeight:600, display:"inline-block", marginTop:16 }}>← Back to Aromatica</Link>
    </div>
  );

  const sectionStyle = { background: isDark?"rgba(255,255,255,0.03)":"rgba(0,0,0,0.02)", border:`1px solid ${V.border}`, borderRadius:12, padding:"16px 18px", marginBottom:14 };
  const labelStyle = { fontSize:10, fontWeight:800, letterSpacing:"0.1em", textTransform:"uppercase" as const, color: V.faint, marginBottom:6, display:"block" };
  const valueStyle = { fontSize:14, fontWeight:600, color: V.text };
  const inputStyle = { width:"100%", padding:"9px 12px", borderRadius:8, border:`1px solid ${V.border}`, background: V.inputBg, color: V.text, fontSize:13, outline:"none", boxSizing:"border-box" as const };
  const btnStyle = { padding:"8px 16px", borderRadius:10, border:`1px solid ${V.border}`, background: V.card, color: V.text, cursor:"pointer", fontSize:13, fontWeight:600 };
  const primaryBtnStyle = { ...btnStyle, background: V.accent, border:"none", color:"#fff", fontWeight:700 };
  const dangerBtnStyle = { ...btnStyle, borderColor:"rgba(239,68,68,0.4)", color:"#ef4444" };

  return (
    <div style={{ background: V.bg, minHeight:"100vh", color: V.text, fontFamily:"system-ui,sans-serif" }}>

      {/* Top nav bar */}
      <div style={{ position:"sticky", top:0, zIndex:20, background: isDark?"rgba(13,15,20,0.9)":"rgba(249,248,245,0.9)", backdropFilter:"blur(12px)", borderBottom:`1px solid ${V.border}`, padding:"12px 24px", display:"flex", alignItems:"center", justifyContent:"space-between", gap:12 }}>
        <Link href="/dashboard/perfumes" style={{ display:"flex", alignItems:"center", gap:8, color: V.muted, textDecoration:"none", fontWeight:600, fontSize:13, transition:"color 0.15s" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          Aromatica
        </Link>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          <button style={btnStyle} onClick={copyToClipboard}>Share</button>
          <button style={isEdit ? { ...primaryBtnStyle } : btnStyle} onClick={() => setIsEdit(v => !v)}>{isEdit ? "✓ Done" : "Edit"}</button>
          {item.status !== "wishlist" && <button style={btnStyle} onClick={() => { setArchiveChoice("Emptied"); setShowArchive(true); }}>Archive</button>}
          <button style={dangerBtnStyle} onClick={() => setShowRemove(true)}>Remove</button>
        </div>
      </div>

      {/* Main content */}
      <div style={{ maxWidth:900, margin:"0 auto", padding:"28px 20px" }}>

        {/* Hero row */}
        <div style={{ display:"grid", gridTemplateColumns:"240px 1fr", gap:24, marginBottom:28, alignItems:"start" }}>
          {/* Image */}
          <div>
            {item.imageUrl
              ? <img src={item.imageUrl} alt="" style={{ width:"100%", aspectRatio:"1", objectFit:"cover", borderRadius:16, border:`1px solid ${V.border}` }} />
              : <div style={{ width:"100%", aspectRatio:"1", borderRadius:16, background: V.inputBg, display:"flex", alignItems:"center", justifyContent:"center", fontSize:64, border:`1px solid ${V.border}` }}>🌸</div>
            }
            <button style={{ ...btnStyle, width:"100%", marginTop:10, textAlign:"center" }} onClick={() => { setPhotoInput(item.imageUrl); setPhotoMode("url"); setShowPhoto(true); }}>
              📷 Change photo
            </button>
          </div>

          {/* Header info */}
          <div>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:10 }}>
              <span style={{ fontSize:10, fontWeight:800, letterSpacing:"0.12em", textTransform:"uppercase", background: V.inputBg, color: V.faint, padding:"4px 10px", borderRadius:999 }}>
                {item.brand}
              </span>
              <span style={{ fontSize:10, fontWeight:700, padding:"4px 10px", borderRadius:999,
                background: item.status==="wardrobe"?"rgba(245,166,35,0.12)":item.status==="wishlist"?"rgba(99,102,241,0.1)":"rgba(107,114,128,0.1)",
                color: item.status==="wardrobe"?"#d97706":item.status==="wishlist"?"#6366f1":"#6b7280"
              }}>{item.status}</span>
              {item.archiveReason && <span style={{ fontSize:10, fontWeight:700, padding:"4px 10px", borderRadius:999, background:"rgba(107,114,128,0.1)", color:"#6b7280" }}>{item.archiveReason}</span>}
            </div>
            <h1 style={{ fontSize:28, fontWeight:800, letterSpacing:"-0.5px", margin:"0 0 12px", lineHeight:1.2 }}>{item.model}</h1>
            <div style={{ marginBottom:16 }}><Stars value={item.ratingStars} size={20} /></div>

            {isEdit && (
              <div style={{ marginBottom:16 }}>
                <span style={labelStyle}>Rating</span>
                <div style={{ display:"flex", gap:4 }}>
                  {[1,2,3,4,5].map(s => (
                    <button key={s} onClick={() => update({ ratingStars: s })}
                      style={{ background:"none", border:"none", cursor:"pointer", fontSize:24, color: s <= (item.ratingStars ?? 0) ? "#F5A623" : V.border, padding:2 }}>★</button>
                  ))}
                </div>
              </div>
            )}

            {/* Quick stats */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))", gap:10 }}>
              {[["Longevity", item.longevity], ["Sillage", item.sillage], ["Gender", genderLabel(item.genderScale)], ["Value", item.value]].map(([k, v]) => (
                <div key={k} style={{ background: V.inputBg, borderRadius:10, padding:"10px 12px", border:`1px solid ${V.border}` }}>
                  <span style={labelStyle}>{k}</span>
                  <span style={{ fontSize:13, fontWeight:700, color: k==="Value" ? (v==="Worth it"?"#16a34a":v==="Not worth it"?"#dc2626":V.muted) : V.text }}>{v || "—"}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Notes tags */}
        <div style={sectionStyle}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
            <span style={labelStyle}>Notes tags</span>
            {isEdit && <button style={{ ...btnStyle, padding:"4px 10px", fontSize:11 }} onClick={() => setNoteManager(true)}>Manage</button>}
          </div>
          {item.notesTags.length === 0
            ? <span style={{ fontSize:13, color: V.faint }}>No tags set</span>
            : <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>{item.notesTags.map(t => <Tag key={t} label={t} onRemove={isEdit ? () => update({ notesTags: item.notesTags.filter(x => x !== t) }) : undefined} />)}</div>
          }
        </div>

        {/* Weather */}
        <div style={sectionStyle}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
            <span style={labelStyle}>Weather</span>
            {isEdit && <button style={{ ...btnStyle, padding:"4px 10px", fontSize:11 }} onClick={() => setWeatherManager(true)}>Manage</button>}
          </div>
          {item.weatherTags.length === 0
            ? <span style={{ fontSize:13, color: V.faint }}>Not set</span>
            : <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>{item.weatherTags.map(w => <Tag key={w} label={w} />)}</div>
          }
        </div>

        {/* Details grid */}
        <div style={sectionStyle}>
          <span style={labelStyle}>Details</span>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))", gap:16 }}>
            {([["Longevity","longevity"],["Sillage","sillage"],["Clone / similar","cloneSimilar"]] as const).map(([label, key]) => (
              <div key={key}>
                <span style={labelStyle}>{label}</span>
                {!isEdit
                  ? <div style={{ ...valueStyle, color: item[key] ? V.text : V.faint }}>{item[key] || "—"}</div>
                  : <input style={inputStyle} value={item[key] ?? ""} onChange={e => update({ [key]: e.target.value })} />
                }
              </div>
            ))}
            <div>
              <span style={labelStyle}>Value</span>
              {!isEdit
                ? <div style={{ ...valueStyle, color: item.value==="Worth it"?"#16a34a":item.value==="Not worth it"?"#dc2626":V.muted }}>{item.value}</div>
                : <select style={{ ...inputStyle, cursor:"pointer" }} value={item.value} onChange={e => update({ value: e.target.value as Perfume["value"] })}>
                    <option>Worth it</option><option>Neutral</option><option>Not worth it</option>
                  </select>
              }
            </div>
            <div>
              <span style={labelStyle}>Gender</span>
              {!isEdit
                ? <div style={valueStyle}>{genderLabel(item.genderScale)}</div>
                : <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                    <input type="range" min={0} max={4} step={1} value={item.genderScale} onChange={e => update({ genderScale: Number(e.target.value) as GenderScale })} style={{ flex:1 }} />
                    <span style={{ fontSize:12, color: V.muted, minWidth:80 }}>{genderLabel(item.genderScale)}</span>
                  </div>
              }
            </div>
          </div>
        </div>

        {/* Notes text */}
        <div style={sectionStyle}>
          <span style={labelStyle}>Notes</span>
          {!isEdit
            ? <div style={{ fontSize:14, lineHeight:1.7, color: item.notesText ? V.text : V.faint, whiteSpace:"pre-wrap" }}>{item.notesText || "No notes yet"}</div>
            : <textarea style={{ ...inputStyle, resize:"vertical", minHeight:100, lineHeight:1.6 }} value={item.notesText} onChange={e => update({ notesText: e.target.value })} placeholder="Your thoughts on this fragrance…" />
          }
        </div>

        {/* Bottles */}
        <div style={sectionStyle}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
            <span style={labelStyle}>Bottles</span>
            <Link href={`/dashboard/perfumes/${item.id}/add-bottle`} style={{ ...btnStyle, textDecoration:"none", fontSize:12, padding:"5px 12px" }}>+ Add bottle</Link>
          </div>
          {item.bottles.length === 0
            ? <span style={{ fontSize:13, color: V.faint }}>No bottles recorded</span>
            : (
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {item.bottles.map(b => (
                  <div key={b.id} style={{ display:"grid", gridTemplateColumns:"1fr 80px 120px 1fr", gap:10, padding:"10px 14px", background: V.inputBg, borderRadius:10, border:`1px solid ${V.border}`, alignItems:"center", fontSize:13 }}>
                    <div>
                      {!isEdit
                        ? <span style={{ fontWeight:700 }}>{b.bottleType}</span>
                        : <select style={{ ...inputStyle, padding:"5px 8px", fontSize:12 }} value={b.bottleType} onChange={e => updateBottle(b.id, { bottleType: e.target.value as BottleType })}>
                            <option>Full bottle</option><option>Decant</option><option>Sample</option><option>Tester</option>
                          </select>
                      }
                    </div>
                    <div>
                      {!isEdit
                        ? <span style={{ color: V.muted }}>{b.bottleSizeMl}ml</span>
                        : <input style={{ ...inputStyle, padding:"5px 8px", fontSize:12 }} value={b.bottleSizeMl} onChange={e => updateBottle(b.id, { bottleSizeMl: safeNum(e.target.value, 0) })} />
                      }
                    </div>
                    <div>
                      {!isEdit
                        ? <span style={{ color: b.status==="In collection"?"#16a34a":V.muted, fontWeight:600, fontSize:12 }}>{b.status}</span>
                        : <select style={{ ...inputStyle, padding:"5px 8px", fontSize:12 }} value={b.status} onChange={e => updateBottle(b.id, { status: e.target.value as BottleStatus })}>
                            <option>In collection</option><option>Emptied</option><option>Sold</option><option>Gifted</option>
                          </select>
                      }
                    </div>
                    <div>
                      {!isEdit
                        ? <span style={{ color: V.muted, fontSize:12 }}>{b.usage}</span>
                        : <input style={{ ...inputStyle, padding:"5px 8px", fontSize:12 }} value={b.usage} onChange={e => updateBottle(b.id, { usage: e.target.value })} />
                      }
                    </div>
                  </div>
                ))}
              </div>
            )
          }
        </div>

        {/* Purchase history */}
        <div style={sectionStyle}>
          <span style={labelStyle}>Purchase history</span>
          {purchases.length === 0
            ? <span style={{ fontSize:13, color: V.faint }}>No purchases recorded</span>
            : (
              <div style={{ display:"flex", flexDirection:"column", gap:8, marginTop:4 }}>
                {purchases.map(p => (
                  <div key={p.id} style={{ display:"grid", gridTemplateColumns:"0.8fr 0.6fr 0.7fr 1fr", gap:10, padding:"10px 14px", background: V.inputBg, borderRadius:10, border:`1px solid ${V.border}`, alignItems:"center", fontSize:13 }}>
                    <span style={{ color: V.muted, fontSize:12 }}>{p.date}</span>
                    <span style={{ fontWeight:700 }}>{p.price > 0 ? fmtMoney(p.currency, p.price) : <span style={{ color: V.faint }}>Free</span>}</span>
                    <span style={{ color: V.muted, fontSize:12 }}>{p.ml ? `${p.ml}ml` : "—"}</span>
                    <span>{p.shopLink
                      ? <a href={p.shopLink} target="_blank" rel="noreferrer" style={{ color: V.accent, textDecoration:"none", fontWeight:600, fontSize:12 }}>{p.shopName}</a>
                      : <span style={{ color: V.muted, fontSize:12 }}>{p.shopName}</span>
                    }</span>
                  </div>
                ))}
              </div>
            )
          }
        </div>
      </div>

      {/* ── Overlays ─────────────────────────────────────── */}
      {/* Note manager */}
      {noteManager && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:100, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
          <div style={{ background: V.card, border:`1px solid ${V.border}`, borderRadius:16, padding:22, width:"min(520px,100%)", maxHeight:"80vh", overflow:"auto" }}>
            <div style={{ fontSize:16, fontWeight:800, marginBottom:6 }}>Notes tags</div>
            <div style={{ fontSize:13, color: V.muted, marginBottom:14 }}>Tap to toggle. Type below to add new global tags.</div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginBottom:14 }}>
              {globalNotes.map(t => (
                <button key={t} onClick={() => update({ notesTags: item.notesTags.includes(t) ? item.notesTags.filter(x=>x!==t) : [...item.notesTags, t] })}
                  style={{ padding:"6px 14px", borderRadius:999, fontSize:12, fontWeight:700, cursor:"pointer", border:"none",
                    background: item.notesTags.includes(t) ? V.accent : V.inputBg,
                    color: item.notesTags.includes(t) ? "#fff" : V.text }}>
                  {t}
                </button>
              ))}
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <input style={{ ...inputStyle, flex:1 }} value={noteInput} onChange={e => setNoteInput(e.target.value)} placeholder="New tag…" onKeyDown={e => { if (e.key==="Enter") { const v=noteInput.trim(); if(v&&!globalNotes.includes(v)){setGlobalNotes(p=>[...p,v].sort());setNoteInput("");showToast("Tag added");} }}} />
              <button style={primaryBtnStyle} onClick={() => { const v=noteInput.trim(); if(v&&!globalNotes.includes(v)){setGlobalNotes(p=>[...p,v].sort());setNoteInput("");showToast("Tag added");} }}>Add</button>
            </div>
            <div style={{ display:"flex", justifyContent:"flex-end", marginTop:14 }}>
              <button style={primaryBtnStyle} onClick={() => setNoteManager(false)}>Done</button>
            </div>
          </div>
        </div>
      )}

      {/* Weather manager */}
      {weatherManager && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:100, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
          <div style={{ background: V.card, border:`1px solid ${V.border}`, borderRadius:16, padding:22, width:"min(400px,100%)" }}>
            <div style={{ fontSize:16, fontWeight:800, marginBottom:14 }}>Weather</div>
            <div style={{ display:"flex", gap:10 }}>
              {(["Cold","Neutral","Hot"] as const).map(w => (
                <button key={w} onClick={() => update({ weatherTags: item.weatherTags.includes(w) ? item.weatherTags.filter(x=>x!==w) : [...item.weatherTags, w] as ("Cold"|"Neutral"|"Hot")[] })}
                  style={{ flex:1, padding:"10px", borderRadius:10, fontSize:13, fontWeight:700, cursor:"pointer", border:"none",
                    background: item.weatherTags.includes(w) ? V.accent : V.inputBg,
                    color: item.weatherTags.includes(w) ? "#fff" : V.text }}>
                  {w}
                </button>
              ))}
            </div>
            <div style={{ display:"flex", justifyContent:"flex-end", marginTop:14 }}>
              <button style={primaryBtnStyle} onClick={() => setWeatherManager(false)}>Done</button>
            </div>
          </div>
        </div>
      )}

      {/* Archive prompt */}
      {showArchive && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:100, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
          <div style={{ background: V.card, border:`1px solid ${V.border}`, borderRadius:16, padding:22, width:"min(420px,100%)" }}>
            <div style={{ fontSize:16, fontWeight:800, marginBottom:6 }}>Move to archive</div>
            <div style={{ fontSize:13, color: V.muted, marginBottom:14 }}>What happened to it?</div>
            <div style={{ display:"flex", gap:8 }}>
              {(["Sold","Emptied","Gifted"] as const).map(r => (
                <button key={r} onClick={() => setArchiveChoice(r)}
                  style={{ flex:1, padding:"10px", borderRadius:10, fontSize:13, fontWeight:700, cursor:"pointer", border:`1px solid ${V.border}`,
                    background: archiveChoice===r ? V.accent : V.inputBg,
                    color: archiveChoice===r ? "#fff" : V.text }}>
                  {r}
                </button>
              ))}
            </div>
            <div style={{ display:"flex", justifyContent:"flex-end", gap:8, marginTop:14 }}>
              <button style={btnStyle} onClick={() => setShowArchive(false)}>Cancel</button>
              <button style={primaryBtnStyle} onClick={doArchive}>Archive</button>
            </div>
          </div>
        </div>
      )}

      {/* Remove prompt */}
      {showRemove && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:100, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
          <div style={{ background: V.card, border:`1px solid ${V.border}`, borderRadius:16, padding:22, width:"min(420px,100%)" }}>
            <div style={{ fontSize:16, fontWeight:800, marginBottom:6 }}>Remove {item.brand} {item.model}?</div>
            <div style={{ fontSize:13, color: V.muted, marginBottom:14 }}>This permanently deletes the perfume and all its purchase records.</div>
            <div style={{ display:"flex", justifyContent:"flex-end", gap:8 }}>
              <button style={btnStyle} onClick={() => setShowRemove(false)}>Cancel</button>
              <button style={dangerBtnStyle} onClick={doRemove}>Remove</button>
            </div>
          </div>
        </div>
      )}

      {/* Photo prompt */}
      {showPhoto && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:100, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
          <div style={{ background: V.card, border:`1px solid ${V.border}`, borderRadius:16, padding:22, width:"min(480px,100%)" }}>
            <div style={{ fontSize:16, fontWeight:800, marginBottom:14 }}>Change photo</div>
            <div style={{ display:"flex", gap:0, marginBottom:14, borderRadius:10, overflow:"hidden", border:`1px solid ${V.border}` }}>
              {(["upload","url"] as const).map(m => (
                <button key={m} onClick={() => setPhotoMode(m)} style={{ flex:1, padding:"9px", fontSize:13, fontWeight:700, cursor:"pointer", border:"none", background: photoMode===m ? V.accent : V.inputBg, color: photoMode===m ? "#fff" : V.muted }}>
                  {m==="upload" ? "📱 Upload" : "🔗 URL"}
                </button>
              ))}
            </div>
            {photoMode==="upload"
              ? <div>
                  <input type="file" accept="image/*" style={{ fontSize:13, color: V.muted, width:"100%" }}
                    onChange={e => { const f=e.target.files?.[0]; if(f) uploadPhoto(f); }} />
                  <div style={{ fontSize:12, color: V.faint, marginTop:8 }}>Stored in Supabase Storage (free up to 1GB)</div>
                </div>
              : <div>
                  <input style={inputStyle} value={photoInput} onChange={e => setPhotoInput(e.target.value)} placeholder="https://…" />
                  <div style={{ display:"flex", justifyContent:"flex-end", gap:8, marginTop:12 }}>
                    <button style={btnStyle} onClick={() => setShowPhoto(false)}>Cancel</button>
                    <button style={primaryBtnStyle} onClick={async () => { await update({ imageUrl: photoInput.trim() }); setShowPhoto(false); showToast("Photo updated"); }}>Apply</button>
                  </div>
                </div>
            }
            {photoMode==="upload" && (
              <div style={{ display:"flex", justifyContent:"flex-end", marginTop:12 }}>
                <button style={btnStyle} onClick={() => setShowPhoto(false)}>Cancel</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{ position:"fixed", bottom:20, right:16, background: isDark?"#1a3a2a":"#f0fdf4", color:"#16a34a", border:"1px solid rgba(22,163,74,0.3)", padding:"12px 18px", borderRadius:12, fontSize:13, fontWeight:700, boxShadow:"0 8px 24px rgba(0,0,0,0.2)", zIndex:200 }}>
          {toast}
        </div>
      )}
    </div>
  );
}
