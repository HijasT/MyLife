"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";

type EventType = "work"|"birthday"|"event"|"due_paid"|"perfume_purchase"|"note";

type CalEvent = {
  id: string;
  date: string;
  title: string;
  eventType: EventType;
  sourceModule: string;
  workStart?: string;
  workEnd?: string;
  color: string;
  notes: string;
  isRecurring: boolean;
  recurType?: string;
};

type NewEvent = {
  title: string;
  date: string;
  eventType: EventType;
  workStart: string;
  workEnd: string;
  color: string;
  notes: string;
  isRecurring: boolean;
};

function nowMonth() { return new Date().toISOString().slice(0, 7); }
function daysInMonth(y: number, m: number) { return new Date(y, m, 0).getDate(); }
function firstDayOfMonth(y: number, m: number) { return new Date(y, m-1, 1).getDay(); }
function fmtMonth(m: string) { const [y,mo]=m.split("-"); return new Date(Number(y),Number(mo)-1,1).toLocaleDateString("en-AE",{month:"long",year:"numeric"}); }
function prevMonth(m: string) { const [y,mo]=m.split("-").map(Number); const d=new Date(y,mo-2,1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; }
function nextMonth(m: string) { const [y,mo]=m.split("-").map(Number); const d=new Date(y,mo,1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; }
function workHours(start?: string, end?: string) { if(!start||!end) return 0; const [sh,sm]=start.split(":").map(Number); const [eh,em]=end.split(":").map(Number); return Math.max(0,eh+(em/60)-sh-(sm/60)); }

const EVENT_COLORS: Record<EventType, string> = {
  work: "#3b82f6", birthday: "#ec4899", event: "#8b5cf6",
  due_paid: "#16a34a", perfume_purchase: "#f97316", note: "#6b7280",
};
const EVENT_LABELS: Record<EventType, string> = {
  work: "Work", birthday: "Birthday 🎂", event: "Event",
  due_paid: "Due paid ✓", perfume_purchase: "Perfume 🌸", note: "Note",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dbToEvent(r: any): CalEvent {
  return { id:r.id, date:r.date, title:r.title, eventType:r.event_type as EventType, sourceModule:r.source_module??"manual", workStart:r.work_start??undefined, workEnd:r.work_end??undefined, color:r.color??"#F5A623", notes:r.notes??"", isRecurring:r.is_recurring??false, recurType:r.recur_type??undefined };
}

export default function CalendarPage() {
  const supabase = createClient();
  const [userId, setUserId] = useState<string|null>(null);
  const [month, setMonth] = useState(nowMonth());
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string|null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [toast, setToast] = useState("");
  const [view, setView] = useState<"month"|"week">("month");
  const [newEvent, setNewEvent] = useState<NewEvent>({
    title:"", date:new Date().toISOString().slice(0,10), eventType:"event",
    workStart:"09:00", workEnd:"18:00", color:"#8b5cf6", notes:"", isRecurring:false,
  });

  const isDark = typeof document!=="undefined" && document.documentElement.classList.contains("dark");

  useEffect(() => {
    async function load() {
      const { data:{ user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      setUserId(user.id);
      await loadEvents(user.id, month);
      setLoading(false);
    }
    load();
  }, []);

  async function loadEvents(uid: string, m: string) {
    const [y,mo] = m.split("-").map(Number);
    const start = `${y}-${String(mo).padStart(2,"0")}-01`;
    const end = `${y}-${String(mo).padStart(2,"0")}-${String(daysInMonth(y,mo)).padStart(2,"0")}`;
    const { data } = await supabase.from("calendar_events").select("*").eq("user_id", uid)
      .or(`date.gte.${start},is_recurring.eq.true`).lte("date", end).order("date");
    setEvents((data??[]).map(dbToEvent));
  }

  async function changeMonth(m: string) {
    setMonth(m);
    if (userId) await loadEvents(userId, m);
  }

  async function addEvent() {
    if (!userId || !newEvent.title.trim()) return;
    const payload = {
      user_id: userId, date: newEvent.date, title: newEvent.title.trim(),
      event_type: newEvent.eventType, source_module: "manual",
      work_start: newEvent.eventType==="work" ? newEvent.workStart : null,
      work_end: newEvent.eventType==="work" ? newEvent.workEnd : null,
      color: EVENT_COLORS[newEvent.eventType] ?? newEvent.color,
      notes: newEvent.notes, is_recurring: newEvent.isRecurring,
      recur_type: newEvent.isRecurring ? "yearly" : null,
    };
    const { data } = await supabase.from("calendar_events").insert(payload).select("*").single();
    if (data) {
      setEvents(p=>[...p, dbToEvent(data)]);
      setShowAdd(false);
      showToastMsg("Event added");
    }
  }

  async function deleteEvent(id: string) {
    await supabase.from("calendar_events").delete().eq("id", id);
    setEvents(p=>p.filter(e=>e.id!==id));
    showToastMsg("Deleted");
  }

  function showToastMsg(msg: string) { setToast(msg); setTimeout(()=>setToast(""),2500); }

  // ── Calendar grid data ──────────────────────────────────────
  const [year, mo] = month.split("-").map(Number);
  const totalDays = daysInMonth(year, mo);
  const firstDay = firstDayOfMonth(year, mo);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalEvent[]>();
    for (const ev of events) {
      // Handle recurring yearly events
      let date = ev.date;
      if (ev.isRecurring && ev.recurType==="yearly") {
        const d = new Date(ev.date);
        date = `${year}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
      }
      if (!date.startsWith(month)) continue;
      if (!map.has(date)) map.set(date, []);
      map.get(date)!.push(ev);
    }
    return map;
  }, [events, month]);

  // ── Monthly stats ────────────────────────────────────────────
  const monthStats = useMemo(() => {
    const workEvents = events.filter(e=>e.eventType==="work");
    let totalHours = 0;
    const workDays = new Set<string>();
    for (const e of workEvents) {
      const h = workHours(e.workStart, e.workEnd);
      totalHours += h;
      workDays.add(e.date);
    }
    return { workDays: workDays.size, totalHours: Math.round(totalHours*10)/10, totalEvents: events.filter(e=>e.eventType==="event"||e.eventType==="birthday").length };
  }, [events]);

  const V = { bg:isDark?"#0d0f14":"#f9f8f5", card:isDark?"#16191f":"#ffffff", border:isDark?"rgba(255,255,255,0.07)":"rgba(0,0,0,0.07)", text:isDark?"#f0ede8":"#1a1a1a", muted:isDark?"#9ba3b2":"#6b7280", faint:isDark?"#5c6375":"#9ca3af", input:isDark?"#1e2130":"#f9fafb", accent:"#F5A623", today:isDark?"rgba(245,166,35,0.15)":"rgba(245,166,35,0.1)" };
  const btn = { padding:"8px 14px", borderRadius:10, border:`1px solid ${V.border}`, background:V.card, color:V.text, cursor:"pointer", fontSize:13, fontWeight:600 } as const;
  const btnPrimary = { ...btn, background:V.accent, border:"none", color:"#fff", fontWeight:700 } as const;
  const inp = { padding:"8px 12px", borderRadius:8, border:`1px solid ${V.border}`, background:V.input, color:V.text, fontSize:13, outline:"none" } as const;

  const todayStr = new Date().toISOString().slice(0,10);
  const dayEvents = selectedDate ? (eventsByDate.get(selectedDate)??[]) : [];

  if (loading) return <div style={{minHeight:"60vh",display:"flex",alignItems:"center",justifyContent:"center",background:V.bg}}><div style={{width:28,height:28,border:`2.5px solid ${V.accent}`,borderTopColor:"transparent",borderRadius:"50%",animation:"spin 0.7s linear infinite"}}/><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style></div>;

  return (
    <div style={{ minHeight:"100vh", background:V.bg, color:V.text, fontFamily:"system-ui,sans-serif" }}>

      {/* Header */}
      <div style={{ padding:"22px 24px 0", display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:12 }}>
        <div>
          <div style={{ fontSize:22, fontWeight:800 }}>My <span style={{ color:V.accent, fontStyle:"italic" }}>Calendar</span></div>
          <div style={{ fontSize:13, color:V.faint, marginTop:2 }}>Work hours · Events · Life log</div>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <div style={{ display:"flex", borderRadius:10, overflow:"hidden", border:`1px solid ${V.border}` }}>
            {(["month","week"] as const).map(v=>(
              <button key={v} onClick={()=>setView(v)} style={{ padding:"7px 14px", background:view===v?V.accent:"transparent", color:view===v?"#fff":V.muted, border:"none", cursor:"pointer", fontSize:13, fontWeight:600, textTransform:"capitalize" }}>{v}</button>
            ))}
          </div>
          <button style={btnPrimary} onClick={()=>{ setNewEvent(f=>({...f,date:selectedDate??todayStr})); setShowAdd(true); }}>+ Add event</button>
        </div>
      </div>

      {/* Stats bar */}
      <div style={{ padding:"12px 24px 0", display:"flex", gap:12, flexWrap:"wrap" }}>
        {[
          { label:"Work days",  value:monthStats.workDays,    color:"#3b82f6" },
          { label:"Work hours", value:`${monthStats.totalHours}h`, color:"#3b82f6" },
          { label:"Events",     value:monthStats.totalEvents, color:"#8b5cf6" },
        ].map(s=>(
          <div key={s.label} style={{ background:V.card, border:`1px solid ${V.border}`, borderRadius:10, padding:"8px 14px", display:"flex", gap:8, alignItems:"center" }}>
            <span style={{ fontSize:16, fontWeight:800, color:s.color }}>{s.value}</span>
            <span style={{ fontSize:12, color:V.faint }}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* Month nav */}
      <div style={{ padding:"14px 24px 0", display:"flex", alignItems:"center", gap:12 }}>
        <button style={btn} onClick={()=>changeMonth(prevMonth(month))}>‹</button>
        <span style={{ fontSize:18, fontWeight:700, minWidth:180, textAlign:"center" }}>{fmtMonth(month)}</span>
        <button style={btn} onClick={()=>changeMonth(nextMonth(month))}>›</button>
        <button style={{ ...btn, fontSize:12, padding:"6px 12px" }} onClick={()=>changeMonth(nowMonth())}>Today</button>
      </div>

      {/* Calendar grid */}
      <div style={{ padding:"14px 24px" }}>
        {/* Day headers */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", marginBottom:4 }}>
          {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d=>(
            <div key={d} style={{ textAlign:"center", fontSize:11, fontWeight:700, color:V.faint, padding:"4px 0", textTransform:"uppercase", letterSpacing:"0.06em" }}>{d}</div>
          ))}
        </div>
        {/* Days grid */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:2 }}>
          {/* Empty cells before first day */}
          {Array.from({length:firstDay}).map((_,i)=><div key={`empty-${i}`}/>)}
          {/* Day cells */}
          {Array.from({length:totalDays}).map((_,i)=>{
            const day = i+1;
            const dateStr = `${month}-${String(day).padStart(2,"0")}`;
            const dayEvs = eventsByDate.get(dateStr)??[];
            const isToday = dateStr===todayStr;
            const isSelected = dateStr===selectedDate;
            const hasWork = dayEvs.some(e=>e.eventType==="work");

            return (
              <div key={day} onClick={()=>setSelectedDate(isSelected?null:dateStr)}
                style={{ minHeight:72, borderRadius:10, border:`1px solid ${isSelected?"rgba(245,166,35,0.6)":V.border}`, background:isToday?V.today:isSelected?"rgba(245,166,35,0.05)":V.card, cursor:"pointer", padding:"6px 8px", transition:"all 0.15s", position:"relative" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:4 }}>
                  <span style={{ fontSize:13, fontWeight:isToday?800:600, color:isToday?V.accent:V.text, width:22, height:22, display:"flex", alignItems:"center", justifyContent:"center", borderRadius:"50%", background:isToday?`${V.accent}20`:"transparent" }}>{day}</span>
                  {hasWork && <span style={{ fontSize:9, fontWeight:700, padding:"1px 5px", borderRadius:999, background:"rgba(59,130,246,0.15)", color:"#3b82f6" }}>W</span>}
                </div>
                <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
                  {dayEvs.slice(0,3).map(ev=>(
                    <div key={ev.id} style={{ fontSize:10, fontWeight:600, padding:"1px 5px", borderRadius:4, background:`${ev.color}20`, color:ev.color, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                      {ev.title}
                    </div>
                  ))}
                  {dayEvs.length>3 && <div style={{ fontSize:9, color:V.faint }}>+{dayEvs.length-3} more</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected day panel */}
      {selectedDate && (
        <div style={{ margin:"0 24px 24px", background:V.card, border:`1px solid ${V.border}`, borderRadius:14, overflow:"hidden" }}>
          <div style={{ padding:"12px 16px", borderBottom:`1px solid ${V.border}`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <div style={{ fontWeight:800, fontSize:14 }}>{new Date(selectedDate+"T12:00:00").toLocaleDateString("en-AE",{weekday:"long",day:"numeric",month:"long"})}</div>
            <button style={{ ...btnPrimary, padding:"5px 12px", fontSize:12 }} onClick={()=>{ setNewEvent(f=>({...f,date:selectedDate})); setShowAdd(true); }}>+ Add</button>
          </div>
          {dayEvents.length===0
            ? <div style={{ padding:"20px 16px", color:V.faint, fontSize:13, textAlign:"center" }}>No events · Click + Add to log something</div>
            : dayEvents.map(ev=>(
              <div key={ev.id} style={{ padding:"12px 16px", borderBottom:`1px solid ${V.border}`, display:"flex", gap:12, alignItems:"flex-start" }}>
                <div style={{ width:4, alignSelf:"stretch", borderRadius:2, background:ev.color, flexShrink:0 }}/>
                <div style={{ flex:1 }}>
                  <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
                    <span style={{ fontSize:14, fontWeight:700 }}>{ev.title}</span>
                    <span style={{ fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:999, background:`${ev.color}20`, color:ev.color }}>{EVENT_LABELS[ev.eventType]}</span>
                    {ev.sourceModule!=="manual" && <span style={{ fontSize:10, color:V.faint }}>from {ev.sourceModule}</span>}
                    {ev.isRecurring && <span style={{ fontSize:10, color:V.faint }}>🔄 yearly</span>}
                  </div>
                  {ev.eventType==="work" && ev.workStart && ev.workEnd && (
                    <div style={{ fontSize:12, color:V.muted, marginTop:3 }}>
                      ⏰ {ev.workStart} – {ev.workEnd} ({workHours(ev.workStart,ev.workEnd).toFixed(1)}h)
                    </div>
                  )}
                  {ev.notes && <div style={{ fontSize:12, color:V.muted, marginTop:3 }}>{ev.notes}</div>}
                </div>
                {ev.sourceModule==="manual" && (
                  <button onClick={()=>deleteEvent(ev.id)} style={{ background:"none", border:"none", cursor:"pointer", color:V.faint, fontSize:16, padding:2 }}>×</button>
                )}
              </div>
            ))
          }
        </div>
      )}

      {/* Add event modal */}
      {showAdd && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:50, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }} onClick={()=>setShowAdd(false)}>
          <div style={{ background:V.card, border:`1px solid ${V.border}`, borderRadius:18, width:"min(540px,100%)", maxHeight:"90vh", overflow:"auto" }} onClick={e=>e.stopPropagation()}>
            <div style={{ padding:"18px 20px", borderBottom:`1px solid ${V.border}`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div style={{ fontSize:18, fontWeight:800 }}>Add event</div>
              <button style={btn} onClick={()=>setShowAdd(false)}>✕</button>
            </div>
            <div style={{ padding:20, display:"flex", flexDirection:"column", gap:14 }}>
              <label style={{ display:"flex", flexDirection:"column", gap:5, fontSize:12, fontWeight:700, color:V.muted, textTransform:"uppercase", letterSpacing:"0.06em" }}>
                Type
                <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                  {(Object.keys(EVENT_LABELS) as EventType[]).filter(t=>t!=="due_paid"&&t!=="perfume_purchase").map(t=>(
                    <button key={t} onClick={()=>setNewEvent(f=>({...f,eventType:t,color:EVENT_COLORS[t]}))}
                      style={{ padding:"6px 14px", borderRadius:999, border:"none", cursor:"pointer", fontSize:12, fontWeight:700, background:newEvent.eventType===t?EVENT_COLORS[t]:`${EVENT_COLORS[t]}20`, color:newEvent.eventType===t?"#fff":EVENT_COLORS[t] }}>
                      {EVENT_LABELS[t]}
                    </button>
                  ))}
                </div>
              </label>
              <label style={{ display:"flex", flexDirection:"column", gap:5, fontSize:12, fontWeight:700, color:V.muted, textTransform:"uppercase", letterSpacing:"0.06em" }}>
                Title
                <input style={{ ...inp, width:"100%", boxSizing:"border-box" }} value={newEvent.title} onChange={e=>setNewEvent(f=>({...f,title:e.target.value}))} placeholder={newEvent.eventType==="work"?"Work day":"Event title"} />
              </label>
              <label style={{ display:"flex", flexDirection:"column", gap:5, fontSize:12, fontWeight:700, color:V.muted, textTransform:"uppercase", letterSpacing:"0.06em" }}>
                Date
                <input type="date" style={{ ...inp, width:"100%", boxSizing:"border-box" }} value={newEvent.date} onChange={e=>setNewEvent(f=>({...f,date:e.target.value}))} />
              </label>
              {newEvent.eventType==="work" && (
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                  <label style={{ display:"flex", flexDirection:"column", gap:5, fontSize:12, fontWeight:700, color:V.muted, textTransform:"uppercase", letterSpacing:"0.06em" }}>
                    Start time
                    <input type="time" style={inp} value={newEvent.workStart} onChange={e=>setNewEvent(f=>({...f,workStart:e.target.value}))} />
                  </label>
                  <label style={{ display:"flex", flexDirection:"column", gap:5, fontSize:12, fontWeight:700, color:V.muted, textTransform:"uppercase", letterSpacing:"0.06em" }}>
                    End time
                    <input type="time" style={inp} value={newEvent.workEnd} onChange={e=>setNewEvent(f=>({...f,workEnd:e.target.value}))} />
                  </label>
                </div>
              )}
              {(newEvent.eventType==="birthday"||newEvent.isRecurring) && (
                <label style={{ display:"flex", alignItems:"center", gap:10, fontSize:13, fontWeight:600, cursor:"pointer" }}>
                  <input type="checkbox" checked={newEvent.isRecurring} onChange={e=>setNewEvent(f=>({...f,isRecurring:e.target.checked}))} />
                  Repeat yearly (birthday / anniversary)
                </label>
              )}
              <label style={{ display:"flex", flexDirection:"column", gap:5, fontSize:12, fontWeight:700, color:V.muted, textTransform:"uppercase", letterSpacing:"0.06em" }}>
                Notes (optional)
                <textarea style={{ ...inp, resize:"vertical", minHeight:60 }} value={newEvent.notes} onChange={e=>setNewEvent(f=>({...f,notes:e.target.value}))} placeholder="Any details…" />
              </label>
            </div>
            <div style={{ padding:"0 20px 20px", display:"flex", justifyContent:"flex-end", gap:8 }}>
              <button style={btn} onClick={()=>setShowAdd(false)}>Cancel</button>
              <button style={btnPrimary} onClick={addEvent}>Save</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div style={{ position:"fixed", bottom:20, right:16, background:isDark?"#1a3a2a":"#f0fdf4", color:"#16a34a", border:"1px solid rgba(22,163,74,0.3)", padding:"12px 18px", borderRadius:12, fontSize:13, fontWeight:700, boxShadow:"0 8px 24px rgba(0,0,0,0.2)", zIndex:200 }}>{toast}</div>}
    </div>
  );
}
