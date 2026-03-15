"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";

type EventType = "work"|"birthday"|"event"|"due_paid"|"perfume_purchase"|"note";

type CalEvent = {
  id: string; date: string; title: string; eventType: EventType;
  sourceModule: string; workStart?: string; workEnd?: string;
  color: string; notes: string; isRecurring: boolean; recurType?: string;
};

const SHIFTS: Record<string, { start: string; end: string; label: string }> = {
  "Morning":     { start:"07:00", end:"15:00", label:"Morning (7am–3pm)" },
  "Mid1":        { start:"09:00", end:"17:00", label:"Mid 1 (9am–5pm)" },
  "Mid2":        { start:"10:00", end:"18:00", label:"Mid 2 (10am–6pm)" },
  "Afternoon":   { start:"14:00", end:"22:00", label:"Afternoon (2pm–10pm)" },
  "F.Morning":   { start:"07:30", end:"12:00", label:"F.Morning (7:30am–12pm)" },
  "F.Afternoon": { start:"14:00", end:"19:00", label:"F.Afternoon (2pm–7pm)" },
  "Custom":      { start:"09:00", end:"17:00", label:"Custom" },
};

const EVENT_COLORS: Record<EventType, string> = {
  work:"#3b82f6", birthday:"#ec4899", event:"#8b5cf6",
  due_paid:"#16a34a", perfume_purchase:"#f97316", note:"#6b7280",
};
const EVENT_LABELS: Record<EventType, string> = {
  work:"Work", birthday:"Birthday 🎂", event:"Event",
  due_paid:"Due paid ✓", perfume_purchase:"Perfume 🌸", note:"Note",
};

function nowMonth() { return new Date().toISOString().slice(0,7); }
function daysInMonth(y: number, m: number) { return new Date(y, m, 0).getDate(); }
function firstDayOfMonth(y: number, m: number) { return new Date(y, m-1, 1).getDay(); }
function fmtMonth(m: string) { const [y,mo]=m.split("-"); return new Date(Number(y),Number(mo)-1,1).toLocaleDateString("en-AE",{month:"long",year:"numeric"}); }
function prevMonth(m: string) { const [y,mo]=m.split("-").map(Number); const d=new Date(y,mo-2,1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; }
function nextMonth(m: string) { const [y,mo]=m.split("-").map(Number); const d=new Date(y,mo,1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; }
function workHours(start?: string, end?: string) { if(!start||!end) return 0; const [sh,sm]=start.split(":").map(Number); const [eh,em]=end.split(":").map(Number); return Math.max(0,eh+(em/60)-sh-(sm/60)); }
function datesBetween(from: string, to: string): string[] {
  const result: string[] = [];
  const start = new Date(from); const end = new Date(to);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate()+1)) {
    result.push(d.toISOString().slice(0,10));
  }
  return result;
}

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

  // Add form state
  const [addType, setAddType] = useState<EventType>("work");
  const [addTitle, setAddTitle] = useState("");
  const [addShift, setAddShift] = useState("Morning");
  const [addStart, setAddStart] = useState("07:00");
  const [addEnd, setAddEnd] = useState("15:00");
  const [addDateFrom, setAddDateFrom] = useState(new Date().toISOString().slice(0,10));
  const [addDateTo, setAddDateTo] = useState(new Date().toISOString().slice(0,10));
  const [addNotes, setAddNotes] = useState("");
  const [addRecurring, setAddRecurring] = useState(false);
  const [addSaving, setAddSaving] = useState(false);

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
    const end   = `${y}-${String(mo).padStart(2,"0")}-${String(daysInMonth(y,mo)).padStart(2,"0")}`;
    const { data } = await supabase.from("calendar_events").select("*").eq("user_id", uid)
      .gte("date", start).lte("date", end).order("date");
    // Also load recurring events
    const { data: recurring } = await supabase.from("calendar_events").select("*").eq("user_id", uid).eq("is_recurring", true);
    const all = [...(data??[]), ...(recurring??[]).filter(r => !(data??[]).some((d: {id:string}) => d.id === r.id))];
    setEvents(all.map(dbToEvent));
  }

  async function changeMonth(m: string) {
    setMonth(m);
    if (userId) await loadEvents(userId, m);
  }

  function selectShift(shiftName: string) {
    setAddShift(shiftName);
    if (shiftName !== "Custom") {
      const s = SHIFTS[shiftName];
      setAddStart(s.start);
      setAddEnd(s.end);
      if (addType === "work" && shiftName !== "Custom") {
        setAddTitle(shiftName);
      }
    }
  }

  async function addEvent() {
    if (!userId) return;
    const title = addTitle.trim() || (addType==="work" ? addShift : "");
    if (!title) return;
    setAddSaving(true);

    const dates = addType === "work" ? datesBetween(addDateFrom, addDateTo) : [addDateFrom];
    const color = EVENT_COLORS[addType];
    const inserts = dates.map(date => ({
      user_id: userId, date, title,
      event_type: addType, source_module: "manual",
      work_start: addType==="work" ? addStart : null,
      work_end: addType==="work" ? addEnd : null,
      color, notes: addNotes,
      is_recurring: addRecurring,
      recur_type: addRecurring ? "yearly" : null,
    }));

    const { data } = await supabase.from("calendar_events").insert(inserts).select("*");
    if (data) {
      setEvents(p => [...p, ...data.map(dbToEvent)]);
      setShowAdd(false);
      setAddTitle(""); setAddNotes("");
      showToastMsg(`Added ${dates.length} event${dates.length>1?"s":""}`);
    }
    setAddSaving(false);
  }

  async function deleteEvent(id: string) {
    await supabase.from("calendar_events").delete().eq("id", id);
    setEvents(p => p.filter(e => e.id !== id));
    showToastMsg("Deleted");
  }

  function showToastMsg(msg: string) { setToast(msg); setTimeout(()=>setToast(""),2500); }

  const [year, mo] = month.split("-").map(Number);
  const totalDays = daysInMonth(year, mo);
  const firstDay = firstDayOfMonth(year, mo);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalEvent[]>();
    for (const ev of events) {
      let date = ev.date;
      // monthly recurring (statement dates)
      if (ev.isRecurring && ev.recurType==="monthly") {
        const d = new Date(ev.date);
        date = `${year}-${String(mo).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
      }
      // yearly recurring (birthdays)
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

  const monthStats = useMemo(() => {
    const workEvents = events.filter(e => e.eventType==="work" && e.date.startsWith(month));
    let totalHours = 0;
    const workDays = new Set<string>();
    for (const e of workEvents) {
      totalHours += workHours(e.workStart, e.workEnd);
      workDays.add(e.date);
    }
    // Weekly breakdown
    const weekMap = new Map<number, { days: number; hours: number }>();
    for (const e of workEvents) {
      const d = new Date(e.date);
      const week = Math.ceil(d.getDate() / 7);
      const prev = weekMap.get(week) ?? { days:0, hours:0 };
      weekMap.set(week, { days: prev.days + (workDays.has(e.date)?1:0), hours: prev.hours + workHours(e.workStart, e.workEnd) });
    }
    return { workDays: workDays.size, totalHours: Math.round(totalHours*10)/10, weeks: weekMap };
  }, [events, month]);

  const todayStr = new Date().toISOString().slice(0,10);
  const dayEvents = selectedDate ? (eventsByDate.get(selectedDate)??[]) : [];

  const V = { bg:isDark?"#0d0f14":"#f9f8f5", card:isDark?"#16191f":"#ffffff", border:isDark?"rgba(255,255,255,0.07)":"rgba(0,0,0,0.07)", text:isDark?"#f0ede8":"#1a1a1a", muted:isDark?"#9ba3b2":"#6b7280", faint:isDark?"#5c6375":"#9ca3af", input:isDark?"#1e2130":"#f9fafb", accent:"#F5A623" };
  const btn = { padding:"8px 14px", borderRadius:10, border:`1px solid ${V.border}`, background:V.card, color:V.text, cursor:"pointer", fontSize:13, fontWeight:600 } as const;
  const btnPrimary = { ...btn, background:V.accent, border:"none", color:"#fff", fontWeight:700 } as const;
  const inp = { padding:"8px 12px", borderRadius:8, border:`1px solid ${V.border}`, background:V.input, color:V.text, fontSize:13, outline:"none" } as const;
  const lbl = { display:"flex" as const, flexDirection:"column" as const, gap:5, fontSize:12, fontWeight:700, color:V.muted, textTransform:"uppercase" as const, letterSpacing:"0.06em" };

  if (loading) return <div style={{minHeight:"60vh",display:"flex",alignItems:"center",justifyContent:"center",background:V.bg}}><div style={{width:28,height:28,border:`2.5px solid ${V.accent}`,borderTopColor:"transparent",borderRadius:"50%",animation:"spin 0.7s linear infinite"}}/><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style></div>;

  return (
    <div style={{ minHeight:"100vh", background:V.bg, color:V.text, fontFamily:"system-ui,sans-serif" }}>

      {/* Header */}
      <div style={{ padding:"22px 24px 0", display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:12 }}>
        <div>
          <div style={{ fontSize:22, fontWeight:800 }}>My <span style={{ color:V.accent, fontStyle:"italic" }}>Calendar</span></div>
          <div style={{ fontSize:13, color:V.faint, marginTop:2 }}>Work hours · Events · Life log</div>
        </div>
        <button style={btnPrimary} onClick={() => { setAddDateFrom(selectedDate??todayStr); setAddDateTo(selectedDate??todayStr); setShowAdd(true); }}>+ Add event</button>
      </div>

      {/* Stats */}
      <div style={{ padding:"12px 24px 0", display:"flex", gap:10, flexWrap:"wrap" }}>
        {[
          { label:"Work days",  value:monthStats.workDays, color:"#3b82f6" },
          { label:"Work hours", value:`${monthStats.totalHours}h`, color:"#3b82f6" },
          { label:"Events",     value:events.filter(e=>e.date.startsWith(month)&&(e.eventType==="event"||e.eventType==="birthday")).length, color:"#8b5cf6" },
        ].map(s => (
          <div key={s.label} style={{ background:V.card, border:`1px solid ${V.border}`, borderRadius:10, padding:"8px 14px", display:"flex", gap:8, alignItems:"center" }}>
            <span style={{ fontSize:16, fontWeight:800, color:s.color }}>{s.value}</span>
            <span style={{ fontSize:12, color:V.faint }}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* Month nav */}
      <div style={{ padding:"12px 24px 0", display:"flex", alignItems:"center", gap:12 }}>
        <button style={btn} onClick={() => changeMonth(prevMonth(month))}>‹</button>
        <span style={{ fontSize:18, fontWeight:700, minWidth:180, textAlign:"center" }}>{fmtMonth(month)}</span>
        <button style={btn} onClick={() => changeMonth(nextMonth(month))}>›</button>
        <button style={{ ...btn, fontSize:12, padding:"6px 12px" }} onClick={() => changeMonth(nowMonth())}>Today</button>
      </div>

      {/* Calendar grid */}
      <div style={{ padding:"14px 24px" }}>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", marginBottom:4 }}>
          {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d => (
            <div key={d} style={{ textAlign:"center", fontSize:11, fontWeight:700, color:V.faint, padding:"4px 0", textTransform:"uppercase", letterSpacing:"0.06em" }}>{d}</div>
          ))}
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:2 }}>
          {Array.from({length:firstDay}).map((_,i) => <div key={`e${i}`}/>)}
          {Array.from({length:totalDays}).map((_,i) => {
            const day = i+1;
            const dateStr = `${month}-${String(day).padStart(2,"0")}`;
            const dayEvs = eventsByDate.get(dateStr)??[];
            const isToday = dateStr===todayStr;
            const isSelected = dateStr===selectedDate;
            const hasWork = dayEvs.some(e=>e.eventType==="work");
            const workH = dayEvs.filter(e=>e.eventType==="work").reduce((s,e)=>s+workHours(e.workStart,e.workEnd),0);

            return (
              <div key={day} onClick={() => setSelectedDate(isSelected?null:dateStr)}
                style={{ minHeight:70, borderRadius:10, border:`1px solid ${isSelected?"rgba(245,166,35,0.6)":V.border}`, background:isToday?`${V.accent}15`:isSelected?"rgba(245,166,35,0.05)":V.card, cursor:"pointer", padding:"5px 6px", transition:"all 0.15s" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:3 }}>
                  <span style={{ fontSize:12, fontWeight:isToday?800:600, color:isToday?V.accent:V.text, width:20, height:20, display:"flex", alignItems:"center", justifyContent:"center", borderRadius:"50%", background:isToday?`${V.accent}20`:"transparent" }}>{day}</span>
                  {hasWork && <span style={{ fontSize:9, fontWeight:700, padding:"1px 4px", borderRadius:999, background:"rgba(59,130,246,0.15)", color:"#3b82f6" }}>{workH.toFixed(0)}h</span>}
                </div>
                <div style={{ display:"flex", flexDirection:"column", gap:1 }}>
                  {dayEvs.slice(0,2).map(ev => (
                    <div key={ev.id} style={{ fontSize:9, fontWeight:600, padding:"1px 4px", borderRadius:3, background:`${ev.color}20`, color:ev.color, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                      {ev.title}
                    </div>
                  ))}
                  {dayEvs.length>2 && <div style={{ fontSize:9, color:V.faint }}>+{dayEvs.length-2}</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected day panel */}
      {selectedDate && (
        <div style={{ margin:"0 24px 20px", background:V.card, border:`1px solid ${V.border}`, borderRadius:14, overflow:"hidden" }}>
          <div style={{ padding:"11px 16px", borderBottom:`1px solid ${V.border}`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <div style={{ fontWeight:800, fontSize:14 }}>{new Date(selectedDate+"T12:00:00").toLocaleDateString("en-AE",{weekday:"long",day:"numeric",month:"long"})}</div>
            <button style={{ ...btnPrimary, padding:"5px 12px", fontSize:12 }} onClick={() => { setAddDateFrom(selectedDate); setAddDateTo(selectedDate); setShowAdd(true); }}>+ Add</button>
          </div>
          {dayEvents.length===0
            ? <div style={{ padding:"18px 16px", color:V.faint, fontSize:13, textAlign:"center" }}>No events · Click + Add to log something</div>
            : dayEvents.map(ev => (
              <div key={ev.id} style={{ padding:"11px 16px", borderBottom:`1px solid ${V.border}`, display:"flex", gap:10, alignItems:"flex-start" }}>
                <div style={{ width:4, alignSelf:"stretch", borderRadius:2, background:ev.color, flexShrink:0 }}/>
                <div style={{ flex:1 }}>
                  <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
                    <span style={{ fontSize:14, fontWeight:700 }}>{ev.title}</span>
                    <span style={{ fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:999, background:`${ev.color}20`, color:ev.color }}>{EVENT_LABELS[ev.eventType]??ev.eventType}</span>
                    {ev.isRecurring && <span style={{ fontSize:10, color:V.faint }}>🔄 {ev.recurType}</span>}
                  </div>
                  {ev.eventType==="work" && ev.workStart && ev.workEnd && (
                    <div style={{ fontSize:12, color:V.muted, marginTop:3 }}>
                      ⏰ {ev.workStart} – {ev.workEnd} · {workHours(ev.workStart,ev.workEnd).toFixed(1)}h
                    </div>
                  )}
                  {ev.notes && <div style={{ fontSize:12, color:V.muted, marginTop:3 }}>{ev.notes}</div>}
                  {ev.sourceModule!=="manual" && <div style={{ fontSize:10, color:V.faint, marginTop:2 }}>from {ev.sourceModule}</div>}
                </div>
                {ev.sourceModule==="manual" && <button onClick={() => deleteEvent(ev.id)} style={{ background:"none", border:"none", cursor:"pointer", color:V.faint, fontSize:18, padding:2, lineHeight:1 }}>×</button>}
              </div>
            ))
          }
        </div>
      )}

      {/* Weekly work summary */}
      {monthStats.workDays > 0 && (
        <div style={{ margin:"0 24px 24px", background:V.card, border:`1px solid ${V.border}`, borderRadius:14, overflow:"hidden" }}>
          <div style={{ padding:"11px 16px", borderBottom:`1px solid ${V.border}`, fontSize:11, fontWeight:800, textTransform:"uppercase", letterSpacing:"0.1em", color:V.faint, background:isDark?"rgba(255,255,255,0.03)":"rgba(0,0,0,0.02)" }}>
            Monthly work summary
          </div>
          <div style={{ padding:"14px 16px", display:"flex", gap:20, flexWrap:"wrap" }}>
            <div><div style={{ fontSize:10, color:V.faint, marginBottom:3, textTransform:"uppercase", fontWeight:700 }}>Work days</div><div style={{ fontSize:20, fontWeight:800, color:"#3b82f6" }}>{monthStats.workDays}</div></div>
            <div><div style={{ fontSize:10, color:V.faint, marginBottom:3, textTransform:"uppercase", fontWeight:700 }}>Total hours</div><div style={{ fontSize:20, fontWeight:800, color:"#3b82f6" }}>{monthStats.totalHours}h</div></div>
            <div><div style={{ fontSize:10, color:V.faint, marginBottom:3, textTransform:"uppercase", fontWeight:700 }}>Avg hours/day</div><div style={{ fontSize:20, fontWeight:800, color:V.muted }}>{monthStats.workDays>0?(monthStats.totalHours/monthStats.workDays).toFixed(1):0}h</div></div>
          </div>
        </div>
      )}

      {/* Add event modal */}
      {showAdd && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:50, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }} onClick={() => setShowAdd(false)}>
          <div style={{ background:V.card, border:`1px solid ${V.border}`, borderRadius:18, width:"min(560px,100%)", maxHeight:"92vh", overflow:"auto" }} onClick={e => e.stopPropagation()}>
            <div style={{ padding:"18px 20px", borderBottom:`1px solid ${V.border}`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div style={{ fontSize:18, fontWeight:800 }}>Add event</div>
              <button style={btn} onClick={() => setShowAdd(false)}>✕</button>
            </div>
            <div style={{ padding:20, display:"flex", flexDirection:"column", gap:16 }}>
              {/* Type selector */}
              <div style={lbl}>
                Type
                <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                  {(["work","event","birthday","note"] as EventType[]).map(t => (
                    <button key={t} onClick={() => { setAddType(t); if(t==="birthday") setAddRecurring(true); else setAddRecurring(false); }}
                      style={{ padding:"6px 14px", borderRadius:999, border:"none", cursor:"pointer", fontSize:12, fontWeight:700, background:addType===t?EVENT_COLORS[t]:`${EVENT_COLORS[t]}20`, color:addType===t?"#fff":EVENT_COLORS[t] }}>
                      {EVENT_LABELS[t]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Work shift selector */}
              {addType === "work" && (
                <div style={lbl}>
                  Shift
                  <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                    {Object.keys(SHIFTS).map(s => (
                      <button key={s} onClick={() => selectShift(s)}
                        style={{ padding:"6px 12px", borderRadius:8, border:`1px solid ${addShift===s?"#3b82f6":V.border}`, cursor:"pointer", fontSize:12, fontWeight:600, background:addShift===s?"rgba(59,130,246,0.15)":V.input, color:addShift===s?"#3b82f6":V.text }}>
                        {s}
                      </button>
                    ))}
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginTop:4 }}>
                    <label style={lbl}>
                      Start time
                      <input type="time" style={inp} value={addStart} onChange={e => setAddStart(e.target.value)} />
                    </label>
                    <label style={lbl}>
                      End time
                      <input type="time" style={inp} value={addEnd} onChange={e => setAddEnd(e.target.value)} />
                    </label>
                  </div>
                  <div style={{ fontSize:11, color:V.faint }}>
                    {workHours(addStart, addEnd).toFixed(1)} hours · Times are editable above
                  </div>
                </div>
              )}

              {/* Title */}
              <label style={lbl}>
                {addType==="work" ? "Title (optional — defaults to shift name)" : "Title"}
                <input style={{ ...inp, width:"100%", boxSizing:"border-box" }} value={addTitle} onChange={e => setAddTitle(e.target.value)} placeholder={addType==="work" ? addShift : addType==="birthday" ? "Name" : "Event title"} />
              </label>

              {/* Date range — work gets from/to, others get single date */}
              {addType === "work" ? (
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                  <label style={lbl}>
                    From date
                    <input type="date" style={inp} value={addDateFrom} onChange={e => { setAddDateFrom(e.target.value); if(e.target.value > addDateTo) setAddDateTo(e.target.value); }} />
                  </label>
                  <label style={lbl}>
                    To date
                    <input type="date" style={inp} value={addDateTo} min={addDateFrom} onChange={e => setAddDateTo(e.target.value)} />
                  </label>
                  {addDateFrom !== addDateTo && (
                    <div style={{ gridColumn:"1/-1", fontSize:12, color:"#3b82f6", fontWeight:600, padding:"6px 10px", background:"rgba(59,130,246,0.08)", borderRadius:8 }}>
                      Will add {datesBetween(addDateFrom, addDateTo).length} work day entries
                    </div>
                  )}
                </div>
              ) : (
                <label style={lbl}>
                  Date
                  <input type="date" style={inp} value={addDateFrom} onChange={e => { setAddDateFrom(e.target.value); setAddDateTo(e.target.value); }} />
                </label>
              )}

              {/* Recurring (birthday / anniversary) */}
              {(addType==="birthday" || addType==="event") && (
                <label style={{ display:"flex", alignItems:"center", gap:10, fontSize:13, fontWeight:600, cursor:"pointer", color:V.text }}>
                  <input type="checkbox" checked={addRecurring} onChange={e => setAddRecurring(e.target.checked)} />
                  Repeat yearly (birthday / anniversary)
                </label>
              )}

              {/* Notes */}
              <label style={lbl}>
                Notes (optional)
                <textarea style={{ ...inp, resize:"vertical", minHeight:60 }} value={addNotes} onChange={e => setAddNotes(e.target.value)} placeholder="Any details…" />
              </label>
            </div>
            <div style={{ padding:"0 20px 20px", display:"flex", justifyContent:"flex-end", gap:8 }}>
              <button style={btn} onClick={() => setShowAdd(false)}>Cancel</button>
              <button style={btnPrimary} onClick={addEvent} disabled={addSaving}>
                {addSaving ? "Saving…" : addType==="work" && addDateFrom!==addDateTo ? `Add ${datesBetween(addDateFrom,addDateTo).length} days` : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div style={{ position:"fixed", bottom:20, right:16, background:isDark?"#1a3a2a":"#f0fdf4", color:"#16a34a", border:"1px solid rgba(22,163,74,0.3)", padding:"12px 18px", borderRadius:12, fontSize:13, fontWeight:700, boxShadow:"0 8px 24px rgba(0,0,0,0.2)", zIndex:200 }}>{toast}</div>}
    </div>
  );
}
