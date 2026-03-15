"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";

type EventType = "work"|"birthday"|"event"|"due_paid"|"note";
type ShiftKey  = "Morning"|"Mid1"|"Mid2"|"Afternoon"|"F.Morning"|"F.Afternoon"|"Holiday Duty"|"Overtime"|"Day Off"|"Paid Leave"|"Custom";

type CalEvent = {
  id:string; date:string; title:string; eventType:EventType;
  sourceModule:string; workStart?:string; workEnd?:string;
  color:string; notes:string; isRecurring:boolean; recurType?:string;
};

const SHIFTS: Record<ShiftKey,{start:string;end:string;label:string;noTime?:boolean}> = {
  "Morning":      {start:"07:00",end:"15:00",label:"Morning (7–3)"},
  "Mid1":         {start:"09:00",end:"17:00",label:"Mid 1 (9–5)"},
  "Mid2":         {start:"10:00",end:"18:00",label:"Mid 2 (10–6)"},
  "Afternoon":    {start:"14:00",end:"22:00",label:"Afternoon (2–10)"},
  "F.Morning":    {start:"07:30",end:"12:00",label:"F.Morning (7:30–12)"},
  "F.Afternoon":  {start:"14:00",end:"19:00",label:"F.Afternoon (2–7)"},
  "Holiday Duty": {start:"07:00",end:"15:00",label:"Holiday Duty"},
  "Overtime":     {start:"15:00",end:"19:00",label:"Overtime"},
  "Day Off":      {start:"",end:"",label:"Day Off",noTime:true},
  "Paid Leave":   {start:"",end:"",label:"Paid Leave",noTime:true},
  "Custom":       {start:"09:00",end:"17:00",label:"Custom"},
};

const SHIFT_COLORS:Record<ShiftKey,string> = {
  "Morning":"#3b82f6","Mid1":"#6366f1","Mid2":"#8b5cf6","Afternoon":"#f59e0b",
  "F.Morning":"#06b6d4","F.Afternoon":"#0ea5e9","Holiday Duty":"#ef4444",
  "Overtime":"#f97316","Day Off":"#9ca3af","Paid Leave":"#22c55e","Custom":"#3b82f6",
};
const EVENT_COLORS:Record<EventType,string> = {
  work:"#3b82f6",birthday:"#ec4899",event:"#8b5cf6",due_paid:"#16a34a",note:"#6b7280"
};
const EVENT_LABELS:Record<EventType,string> = {
  work:"Work",birthday:"Anniversary 🎂",event:"Event",due_paid:"Due paid ✓",note:"Note"
};

function nowMonth() { return new Date().toISOString().slice(0,7); }
function daysInMonth(y:number,m:number) { return new Date(y,m,0).getDate(); }
function firstDayOfMonth(y:number,m:number) { return new Date(y,m-1,1).getDay(); }
function fmtMonth(m:string) { const [y,mo]=m.split("-"); return new Date(Number(y),Number(mo)-1,1).toLocaleDateString("en-AE",{month:"long",year:"numeric"}); }
function prevMonth(m:string) { const [y,mo]=m.split("-").map(Number); const d=new Date(y,mo-2,1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; }
function nextMonth(m:string) { const [y,mo]=m.split("-").map(Number); const d=new Date(y,mo,1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; }
function workHours(s?:string,e?:string) { if(!s||!e) return 0; const [sh,sm]=s.split(":").map(Number); const [eh,em]=e.split(":").map(Number); return Math.max(0,eh+em/60-sh-sm/60); }
function datesBetween(from:string,to:string):string[] {
  const r:string[]=[]; const s=new Date(from); const e=new Date(to);
  for(let d=new Date(s);d<=e;d.setDate(d.getDate()+1)) r.push(d.toISOString().slice(0,10));
  return r;
}
function getWeekNumber(date:string) { const d=new Date(date); return Math.ceil(d.getDate()/7); }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dbToEvent=(r:any):CalEvent=>({id:r.id,date:r.date,title:r.title,eventType:r.event_type as EventType,sourceModule:r.source_module??"manual",workStart:r.work_start??undefined,workEnd:r.work_end??undefined,color:r.color??"#F5A623",notes:r.notes??"",isRecurring:r.is_recurring??false,recurType:r.recur_type??undefined});

export default function CalendarPage() {
  const supabase = createClient();
  const [userId, setUserId] = useState<string|null>(null);
  const [month,  setMonth]  = useState(nowMonth());
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [loading,setLoading]= useState(true);
  const [view,   setView]   = useState<"month"|"week">("month");
  const [weekOffset, setWeekOffset] = useState(0); // 0 = current week
  const [selectedDate, setSelectedDate] = useState<string|null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [toast, setToast] = useState("");

  // Form
  const [addType,    setAddType]    = useState<EventType>("work");
  const [addShift,   setAddShift]   = useState<ShiftKey>("Morning");
  const [addTitle,   setAddTitle]   = useState("");
  const [addStart,   setAddStart]   = useState("07:00");
  const [addEnd,     setAddEnd]     = useState("15:00");
  const [addDateFrom,setAddDateFrom]= useState(new Date().toISOString().slice(0,10));
  const [addDateTo,  setAddDateTo]  = useState(new Date().toISOString().slice(0,10));
  const [addNotes,   setAddNotes]   = useState("");
  const [addRecur,   setAddRecur]   = useState(false);
  const [addAnnivType, setAddAnnivType] = useState("Birthday");
  const [addAnnivName, setAddAnnivName] = useState("");
  const [filterTypes, setFilterTypes] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [addSaving,  setAddSaving]  = useState(false);

  const isDark = typeof document!=="undefined"&&document.documentElement.classList.contains("dark");

  useEffect(()=>{
    async function load(){
      const {data:{user}}=await supabase.auth.getUser();
      if(!user){setLoading(false);return;}
      setUserId(user.id);
      await loadEvents(user.id,month);
      setLoading(false);
    }
    load();
  },[]);

  async function loadEvents(uid:string,m:string){
    const [y,mo]=m.split("-").map(Number);
    const start=`${y}-${String(mo).padStart(2,"0")}-01`;
    const end=`${y}-${String(mo).padStart(2,"0")}-${String(daysInMonth(y,mo)).padStart(2,"0")}`;
    const [{data:d1},{data:d2}]=await Promise.all([
      supabase.from("calendar_events").select("*").eq("user_id",uid).gte("date",start).lte("date",end).order("date"),
      supabase.from("calendar_events").select("*").eq("user_id",uid).eq("is_recurring",true),
    ]);
    const all=[...(d1??[]),...(d2??[]).filter((r:{id:string})=>!(d1??[]).some((x:{id:string})=>x.id===r.id))];
    setEvents(all.map(dbToEvent));
  }

  async function changeMonth(m:string){ setMonth(m); if(userId) await loadEvents(userId,m); }

  function selectShift(s:ShiftKey){
    setAddShift(s);
    const sh=SHIFTS[s];
    if(!sh.noTime){ setAddStart(sh.start); setAddEnd(sh.end); }
    if(addType==="work"&&s!=="Custom") setAddTitle(s);
  }

  async function addEvent(){
    if(!userId) return;
    const annivTitle = addType==="birthday" ? (addTitle.trim()||(addAnnivName?`${addAnnivType}: ${addAnnivName}`:addAnnivType)) : "";
    const title=(addTitle.trim()||( addType==="work"?addShift:addType==="birthday"?annivTitle:""));
    if(!title) return;
    setAddSaving(true);
    const isWork=addType==="work";
    const shift=SHIFTS[addShift];
    const noTime=shift.noTime;
    const dates=isWork?datesBetween(addDateFrom,addDateTo):[addDateFrom];
    const color=isWork?SHIFT_COLORS[addShift]:EVENT_COLORS[addType];
    // For work events, title = "Work:{shiftName}"
    // All work events get "Work:" prefix
    const workTitle = addTitle.trim() || addShift;
    const finalTitle = isWork ? `Work:${workTitle}` : title;
    const rows=dates.map(date=>({
      user_id:userId,date,title:finalTitle,event_type:addType,source_module:"manual",
      work_start:isWork&&!noTime?addStart:null,work_end:isWork&&!noTime?addEnd:null,
      color,notes:addNotes,is_recurring:addRecur,recur_type:addRecur?"yearly":null,
    }));
    const {data}=await supabase.from("calendar_events").insert(rows).select("*");
    if(data){
      setEvents(p=>[...p,...data.map(dbToEvent)]);
      setShowAdd(false); setAddTitle(""); setAddNotes("");
      showToast(`Added ${dates.length} event${dates.length>1?"s":""}`);
    }
    setAddSaving(false);
  }

  async function deleteEvent(id:string){
    await supabase.from("calendar_events").delete().eq("id",id);
    setEvents(p=>p.filter(e=>e.id!==id));
    showToast("Deleted");
  }

  function showToast(msg:string){setToast(msg);setTimeout(()=>setToast(""),2500);}

  // ── Calendar data ──────────────────────────────────────────
  const [year,mo]=month.split("-").map(Number);
  const totalDays=daysInMonth(year,mo);
  const firstDay=firstDayOfMonth(year,mo);
  const todayStr=new Date().toISOString().slice(0,10);

  // Apply type + search filter
  const filteredEvents=useMemo(()=>{
    let evs = events;
    if(filterTypes.length) evs = evs.filter(e=>filterTypes.includes(e.eventType));
    if(searchQuery.trim()) evs = evs.filter(e=>e.title.toLowerCase().includes(searchQuery.toLowerCase()));
    return evs;
  },[events,filterTypes,searchQuery]);

  const eventsByDate=useMemo(()=>{
    const map=new Map<string,CalEvent[]>();
    for(const ev of filteredEvents){
      let date=ev.date;
      if(ev.isRecurring&&ev.recurType==="monthly"){ const d=new Date(ev.date); date=`${year}-${String(mo).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
      if(ev.isRecurring&&ev.recurType==="yearly"){ const d=new Date(ev.date); date=`${year}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
      if(!date.startsWith(month)) continue;
      if(!map.has(date)) map.set(date,[]);
      map.get(date)!.push(ev);
    }
    return map;
  },[events,month]);

  // ── Monthly stats ─────────────────────────────────────────
  const monthStats=useMemo(()=>{
    const workEvs=events.filter(e=>e.eventType==="work"&&e.date.startsWith(month));
    let hours=0; const days=new Set<string>();
    const shiftCounts:Record<string,number>={};
    for(const e of workEvs){
      hours+=workHours(e.workStart,e.workEnd); days.add(e.date);
      const sn=e.title.includes(":")?e.title.split(":")[1]:"Work";
      shiftCounts[sn]=(shiftCounts[sn]??0)+1;
    }
    const extraShifts=Object.entries(shiftCounts).filter(([s])=>["Holiday Duty","Overtime"].includes(s)).reduce((t,[,c])=>t+c,0);
    const leaves=Object.entries(shiftCounts).filter(([s])=>["Day Off","Paid Leave"].includes(s)).reduce((t,[,c])=>t+c,0);
    return {days:days.size,hours:Math.round(hours*10)/10,extra:extraShifts,leaves,shiftCounts};
  },[events,month]);

  // ── Weekly view ───────────────────────────────────────────
  const weekDates=useMemo(()=>{
    const today=new Date();
    const dow=today.getDay();
    const monday=new Date(today); monday.setDate(today.getDate()-dow+weekOffset*7);
    return Array.from({length:7},(_,i)=>{
      const d=new Date(monday); d.setDate(monday.getDate()+i);
      return d.toISOString().slice(0,10);
    });
  },[weekOffset]);

  const weekStats=useMemo(()=>{
    let hours=0; const days=new Set<string>();
    for(const date of weekDates){
      const dayEvs=(eventsByDate.get(date)??events.filter(e=>e.date===date));
      const work=dayEvs.filter(e=>e.eventType==="work");
      if(work.length>0) days.add(date);
      work.forEach(e=>{ hours+=workHours(e.workStart,e.workEnd); });
    }
    return {days:days.size,hours:Math.round(hours*10)/10};
  },[weekDates,eventsByDate,events]);

  const dayEvents=selectedDate?(eventsByDate.get(selectedDate)??[]):[];

  const V={bg:isDark?"#0d0f14":"#f9f8f5",card:isDark?"#16191f":"#ffffff",border:isDark?"rgba(255,255,255,0.07)":"rgba(0,0,0,0.07)",text:isDark?"#f0ede8":"#1a1a1a",muted:isDark?"#9ba3b2":"#6b7280",faint:isDark?"#5c6375":"#9ca3af",input:isDark?"#1e2130":"#f9fafb",accent:"#F5A623"};
  const btn={padding:"8px 14px",borderRadius:10,border:`1px solid ${V.border}`,background:V.card,color:V.text,cursor:"pointer",fontSize:13,fontWeight:600}as const;
  const btnP={...btn,background:V.accent,border:"none",color:"#fff",fontWeight:700}as const;
  const inp={padding:"8px 12px",borderRadius:8,border:`1px solid ${V.border}`,background:V.input,color:V.text,fontSize:13,outline:"none"}as const;
  const lbl={display:"flex" as const,flexDirection:"column" as const,gap:5,fontSize:12,fontWeight:700,color:V.muted,textTransform:"uppercase" as const,letterSpacing:"0.06em"};

  if(loading) return <div style={{minHeight:"60vh",display:"flex",alignItems:"center",justifyContent:"center",background:V.bg}}><div style={{width:28,height:28,border:`2.5px solid ${V.accent}`,borderTopColor:"transparent",borderRadius:"50%",animation:"spin 0.7s linear infinite"}}/><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style></div>;

  return (
    <div style={{minHeight:"100vh",background:V.bg,color:V.text,fontFamily:"system-ui,sans-serif"}}>
      {/* Header */}
      <div style={{padding:"22px 24px 0",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12}}>
        <div>
          <div style={{fontSize:22,fontWeight:800}}>My <span style={{color:V.accent,fontStyle:"italic"}}>Calendar</span></div>
          <div style={{fontSize:13,color:V.faint,marginTop:2}}>Work hours · Events · Life log</div>
        </div>
        <div style={{display:"flex",gap:8}}>
          <div style={{display:"flex",borderRadius:10,overflow:"hidden",border:`1px solid ${V.border}`}}>
            {(["month","week"] as const).map(v=>(
              <button key={v} onClick={()=>setView(v)} style={{padding:"7px 14px",background:view===v?V.accent:"transparent",color:view===v?"#fff":V.muted,border:"none",cursor:"pointer",fontSize:13,fontWeight:600,textTransform:"capitalize"}}>{v}</button>
            ))}
          </div>
          <button style={btnP} onClick={()=>{setAddDateFrom(selectedDate??todayStr);setAddDateTo(selectedDate??todayStr);setShowAdd(true);}}>+ Add event</button>
        </div>
      </div>

      {/* Stats bar */}
      <div style={{padding:"10px 24px 0",display:"flex",gap:10,flexWrap:"wrap"}}>
        {[
          {label:"Work days", value:monthStats.days, color:"#3b82f6"},
          {label:"Work hours",value:`${monthStats.hours}h`,color:"#3b82f6"},
          {label:"Extra shifts",value:monthStats.extra,color:"#ef4444"},
          {label:"Leaves",value:monthStats.leaves,color:"#22c55e"},
        ].map(s=>(
          <div key={s.label} style={{background:V.card,border:`1px solid ${V.border}`,borderRadius:10,padding:"7px 13px",display:"flex",gap:7,alignItems:"center"}}>
            <span style={{fontSize:15,fontWeight:800,color:s.color}}>{s.value}</span>
            <span style={{fontSize:11,color:V.faint}}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* ── MONTH VIEW ── */}
      {view==="month"&&(
        <>
          <div style={{padding:"12px 24px 0",display:"flex",alignItems:"center",gap:12}}>
            <button style={btn} onClick={()=>changeMonth(prevMonth(month))}>‹</button>
            <span style={{fontSize:17,fontWeight:700,minWidth:180,textAlign:"center"}}>{fmtMonth(month)}</span>
            <button style={btn} onClick={()=>changeMonth(nextMonth(month))}>›</button>
            <button style={{...btn,fontSize:12,padding:"6px 12px"}} onClick={()=>changeMonth(nowMonth())}>Today</button>
          </div>
          <div style={{padding:"12px 24px"}}>
            <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",marginBottom:4}}>
              {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d=>(
                <div key={d} style={{textAlign:"center",fontSize:10,fontWeight:700,color:V.faint,padding:"4px 0",textTransform:"uppercase",letterSpacing:"0.06em"}}>{d}</div>
              ))}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2}}>
              {Array.from({length:firstDay}).map((_,i)=><div key={`e${i}`}/>)}
              {Array.from({length:totalDays}).map((_,i)=>{
                const day=i+1;
                const dateStr=`${month}-${String(day).padStart(2,"0")}`;
                const dayEvs=eventsByDate.get(dateStr)??[];
                const isToday=dateStr===todayStr;
                const isSel=dateStr===selectedDate;
                const wH=dayEvs.filter(e=>e.eventType==="work").reduce((s,e)=>s+workHours(e.workStart,e.workEnd),0);
                return (
                  <div key={day} onClick={()=>setSelectedDate(isSel?null:dateStr)}
                    style={{minHeight:68,borderRadius:9,border:`1px solid ${isSel?"rgba(245,166,35,0.6)":V.border}`,background:isToday?`${V.accent}15`:isSel?"rgba(245,166,35,0.05)":V.card,cursor:"pointer",padding:"5px 5px",transition:"all 0.12s"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:2}}>
                      <span style={{fontSize:12,fontWeight:isToday?800:600,color:isToday?V.accent:V.text,width:20,height:20,display:"flex",alignItems:"center",justifyContent:"center",borderRadius:"50%",background:isToday?`${V.accent}20`:"transparent"}}>{day}</span>
                      {wH>0&&<span style={{fontSize:9,fontWeight:700,padding:"1px 4px",borderRadius:999,background:"rgba(59,130,246,0.15)",color:"#3b82f6"}}>{wH.toFixed(0)}h</span>}
                    </div>
                    <div style={{display:"flex",flexDirection:"column",gap:1}}>
                      {dayEvs.slice(0,2).map(ev=>(
                        <div key={ev.id} style={{fontSize:9,fontWeight:600,padding:"1px 4px",borderRadius:3,background:`${ev.color}20`,color:ev.color,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                          {ev.title}
                        </div>
                      ))}
                      {dayEvs.length>2&&<div style={{fontSize:9,color:V.faint}}>+{dayEvs.length-2}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* ── WEEK VIEW ── */}
      {view==="week"&&(
        <div style={{padding:"12px 24px"}}>
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
            <button style={btn} onClick={()=>setWeekOffset(p=>p-1)}>‹</button>
            <span style={{fontSize:15,fontWeight:700,flex:1,textAlign:"center"}}>
              {new Date(weekDates[0]+"T12:00:00").toLocaleDateString("en-AE",{day:"numeric",month:"short"})} – {new Date(weekDates[6]+"T12:00:00").toLocaleDateString("en-AE",{day:"numeric",month:"short",year:"numeric"})}
            </span>
            <button style={btn} onClick={()=>setWeekOffset(p=>p+1)}>›</button>
            <button style={{...btn,fontSize:12,padding:"6px 12px"}} onClick={()=>setWeekOffset(0)}>This week</button>
          </div>

          {/* Week stats */}
          <div style={{display:"flex",gap:10,marginBottom:12,flexWrap:"wrap"}}>
            {[
              {label:"Days worked",value:weekStats.days,color:"#3b82f6"},
              {label:"Hours",value:`${weekStats.hours}h`,color:"#3b82f6"},
            ].map(s=>(
              <div key={s.label} style={{background:V.card,border:`1px solid ${V.border}`,borderRadius:10,padding:"8px 14px",display:"flex",gap:8,alignItems:"center"}}>
                <span style={{fontSize:16,fontWeight:800,color:s.color}}>{s.value}</span>
                <span style={{fontSize:12,color:V.faint}}>{s.label}</span>
              </div>
            ))}
          </div>

          {/* Week day columns */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:6}}>
            {weekDates.map(dateStr=>{
              const dayEvs=eventsByDate.get(dateStr)??events.filter(e=>e.date===dateStr);
              const isToday=dateStr===todayStr;
              const isSel=dateStr===selectedDate;
              const d=new Date(dateStr+"T12:00:00");
              const wH=dayEvs.filter(e=>e.eventType==="work").reduce((s,e)=>s+workHours(e.workStart,e.workEnd),0);
              return (
                <div key={dateStr} onClick={()=>setSelectedDate(isSel?null:dateStr)}
                  style={{background:isSel?"rgba(245,166,35,0.05)":V.card,border:`1px solid ${isSel?"rgba(245,166,35,0.5)":isToday?"rgba(245,166,35,0.3)":V.border}`,borderRadius:12,padding:"10px 10px",cursor:"pointer",minHeight:120}}>
                  <div style={{marginBottom:6}}>
                    <div style={{fontSize:11,color:V.faint,fontWeight:600}}>{d.toLocaleDateString("en-AE",{weekday:"short"})}</div>
                    <div style={{fontSize:18,fontWeight:800,color:isToday?V.accent:V.text}}>{d.getDate()}</div>
                    {wH>0&&<div style={{fontSize:10,color:"#3b82f6",fontWeight:700}}>{wH.toFixed(1)}h</div>}
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:3}}>
                    {dayEvs.map(ev=>(
                      <div key={ev.id} style={{fontSize:10,fontWeight:600,padding:"2px 6px",borderRadius:5,background:`${ev.color}20`,color:ev.color,lineHeight:1.4}}>
                        {ev.title}
                        {ev.eventType==="work"&&ev.workStart&&!SHIFTS[ev.title.split(":")[1] as ShiftKey]?.noTime&&
                          <span style={{color:V.faint,marginLeft:4}}>{ev.workStart}–{ev.workEnd}</span>}
                      </div>
                    ))}
                    {dayEvs.length===0&&<div style={{fontSize:10,color:V.faint}}>—</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Selected day panel */}
      {selectedDate&&(
        <div style={{margin:"0 24px 16px",background:V.card,border:`1px solid ${V.border}`,borderRadius:14,overflow:"hidden"}}>
          <div style={{padding:"11px 16px",borderBottom:`1px solid ${V.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{fontWeight:800,fontSize:14}}>{new Date(selectedDate+"T12:00:00").toLocaleDateString("en-AE",{weekday:"long",day:"numeric",month:"long"})}</div>
            <button style={{...btnP,padding:"5px 12px",fontSize:12}} onClick={()=>{setAddDateFrom(selectedDate);setAddDateTo(selectedDate);setShowAdd(true);}}>+ Add</button>
          </div>
          {dayEvents.length===0
            ?<div style={{padding:"16px",color:V.faint,fontSize:13,textAlign:"center"}}>No events · Click + Add</div>
            :dayEvents.map(ev=>(
              <div key={ev.id} style={{padding:"11px 16px",borderBottom:`1px solid ${V.border}`,display:"flex",gap:10,alignItems:"flex-start"}}>
                <div style={{width:4,alignSelf:"stretch",borderRadius:2,background:ev.color,flexShrink:0}}/>
                <div style={{flex:1}}>
                  <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                    <span style={{fontSize:14,fontWeight:700}}>{ev.title}</span>
                    <span style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:999,background:`${ev.color}20`,color:ev.color}}>{EVENT_LABELS[ev.eventType]??ev.eventType}</span>
                  </div>
                  {ev.eventType==="work"&&ev.workStart&&ev.workEnd&&(
                    <div style={{fontSize:12,color:V.muted,marginTop:2}}>⏰ {ev.workStart}–{ev.workEnd} · {workHours(ev.workStart,ev.workEnd).toFixed(1)}h</div>
                  )}
                  {ev.notes&&<div style={{fontSize:12,color:V.muted,marginTop:2}}>{ev.notes}</div>}
                </div>
                {ev.sourceModule==="manual"&&<button onClick={()=>deleteEvent(ev.id)} style={{background:"none",border:"none",cursor:"pointer",color:V.faint,fontSize:18,lineHeight:1}}>×</button>}
              </div>
            ))
          }
        </div>
      )}

      {/* Monthly shift breakdown */}
      {Object.keys(monthStats.shiftCounts).length>0&&(
        <div style={{margin:"0 24px 24px",background:V.card,border:`1px solid ${V.border}`,borderRadius:14,overflow:"hidden"}}>
          <div style={{padding:"10px 16px",borderBottom:`1px solid ${V.border}`,fontSize:11,fontWeight:800,textTransform:"uppercase",letterSpacing:"0.1em",color:V.faint,background:isDark?"rgba(255,255,255,0.03)":"rgba(0,0,0,0.02)"}}>Shift breakdown — {fmtMonth(month)}</div>
          <div style={{padding:"12px 16px",display:"flex",flexWrap:"wrap",gap:10}}>
            {Object.entries(monthStats.shiftCounts).sort((a,b)=>b[1]-a[1]).map(([shift,count])=>{
              const color=SHIFT_COLORS[shift as ShiftKey]??"#6b7280";
              return (
                <div key={shift} style={{padding:"6px 14px",borderRadius:999,background:`${color}15`,border:`1px solid ${color}30`,display:"flex",gap:6,alignItems:"center"}}>
                  <span style={{fontSize:13,fontWeight:700,color}}>{count}×</span>
                  <span style={{fontSize:12,fontWeight:600,color:V.text}}>{shift}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Add event modal */}
      {showAdd&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:50,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setShowAdd(false)}>
          <div style={{background:V.card,border:`1px solid ${V.border}`,borderRadius:18,width:"min(580px,100%)",maxHeight:"92vh",overflow:"auto"}} onClick={e=>e.stopPropagation()}>
            <div style={{padding:"18px 20px",borderBottom:`1px solid ${V.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{fontSize:18,fontWeight:800}}>Add event</div>
              <button style={btn} onClick={()=>setShowAdd(false)}>✕</button>
            </div>
            <div style={{padding:20,display:"flex",flexDirection:"column",gap:16}}>
              {/* Type */}
              <div style={lbl}>Type
                <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                  {(["work","event","birthday","note"] as EventType[]).map(t=>(
                    <button key={t} onClick={()=>{setAddType(t);if(t==="birthday")setAddRecur(true);else setAddRecur(false);}}
                      style={{padding:"6px 14px",borderRadius:999,border:"none",cursor:"pointer",fontSize:12,fontWeight:700,background:addType===t?EVENT_COLORS[t]:`${EVENT_COLORS[t]}20`,color:addType===t?"#fff":EVENT_COLORS[t]}}>
                      {EVENT_LABELS[t]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Anniversary subtype */}
              {addType==="birthday"&&(
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                  <label style={lbl}>Type
                    <select style={inp} value={addAnnivType} onChange={e=>setAddAnnivType(e.target.value)}>
                      <option>Birthday</option><option>Wedding</option><option>Work</option><option>Custom</option>
                    </select>
                  </label>
                  <label style={lbl}>Name
                    <input style={inp} value={addAnnivName} onChange={e=>setAddAnnivName(e.target.value)} placeholder="e.g. John" />
                  </label>
                </div>
              )}

              {/* Shift picker for work */}
              {addType==="work"&&(
                <div style={lbl}>Shift
                  <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                    {(Object.keys(SHIFTS) as ShiftKey[]).map(s=>{
                      const color=SHIFT_COLORS[s];
                      return (
                        <button key={s} onClick={()=>selectShift(s)}
                          style={{padding:"5px 11px",borderRadius:8,border:`1px solid ${addShift===s?color:V.border}`,cursor:"pointer",fontSize:11,fontWeight:600,background:addShift===s?`${color}20`:V.input,color:addShift===s?color:V.text}}>
                          {s}
                        </button>
                      );
                    })}
                  </div>
                  {!SHIFTS[addShift].noTime&&(
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginTop:6}}>
                      <label style={lbl}>Start <input type="time" style={inp} value={addStart} onChange={e=>setAddStart(e.target.value)} /></label>
                      <label style={lbl}>End   <input type="time" style={inp} value={addEnd}   onChange={e=>setAddEnd(e.target.value)}   /></label>
                    </div>
                  )}
                  {!SHIFTS[addShift].noTime&&<div style={{fontSize:11,color:V.faint}}>⏱ {workHours(addStart,addEnd).toFixed(1)} hours</div>}
                </div>
              )}

              {/* Title */}
              <label style={lbl}>
                {addType==="work"?"Title (optional — defaults to shift name)":"Title"}
                <input style={{...inp,width:"100%",boxSizing:"border-box" as const}} value={addTitle} onChange={e=>setAddTitle(e.target.value)} placeholder={addType==="work"?addShift:addType==="birthday"?`${addAnnivType} name`:"Event title"} />
              </label>

              {/* Date range */}
              {addType==="work"?(
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                  <label style={lbl}>From <input type="date" style={inp} value={addDateFrom} onChange={e=>{setAddDateFrom(e.target.value);if(e.target.value>addDateTo)setAddDateTo(e.target.value);}} /></label>
                  <label style={lbl}>To   <input type="date" style={inp} value={addDateTo} min={addDateFrom} onChange={e=>setAddDateTo(e.target.value)} /></label>
                  {addDateFrom!==addDateTo&&<div style={{gridColumn:"1/-1",fontSize:12,color:"#3b82f6",fontWeight:600,padding:"6px 10px",background:"rgba(59,130,246,0.08)",borderRadius:8}}>Will add {datesBetween(addDateFrom,addDateTo).length} entries</div>}
                </div>
              ):(
                <label style={lbl}>Date <input type="date" style={inp} value={addDateFrom} onChange={e=>{setAddDateFrom(e.target.value);setAddDateTo(e.target.value);}} /></label>
              )}

              {(addType==="birthday"||addType==="event")&&(
                <label style={{display:"flex",alignItems:"center",gap:10,fontSize:13,fontWeight:600,cursor:"pointer",color:V.text}}>
                  <input type="checkbox" checked={addRecur} onChange={e=>setAddRecur(e.target.checked)} />
                  Repeat yearly
                </label>
              )}

              <label style={lbl}>Notes (optional) <textarea style={{...inp,resize:"vertical" as const,minHeight:60}} value={addNotes} onChange={e=>setAddNotes(e.target.value)} /></label>
            </div>
            <div style={{padding:"0 20px 20px",display:"flex",justifyContent:"flex-end",gap:8}}>
              <button style={btn} onClick={()=>setShowAdd(false)}>Cancel</button>
              <button style={btnP} onClick={addEvent} disabled={addSaving}>
                {addSaving?"Saving…":addType==="work"&&addDateFrom!==addDateTo?`Add ${datesBetween(addDateFrom,addDateTo).length} days`:"Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast&&<div style={{position:"fixed",bottom:20,right:16,background:isDark?"#1a3a2a":"#f0fdf4",color:"#16a34a",border:"1px solid rgba(22,163,74,0.3)",padding:"12px 18px",borderRadius:12,fontSize:13,fontWeight:700,boxShadow:"0 8px 24px rgba(0,0,0,0.2)",zIndex:200}}>{toast}</div>}
    </div>
  );
}
