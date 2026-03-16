import { createClient } from "@/lib/supabase/server";
import { MODULES } from "@/lib/modules";
import Link from "next/link";

function ModuleCard({ module }: { module: (typeof MODULES)[0] }) {
  const isComingSoon = module.status === "coming-soon";
  return (
    <Link href={isComingSoon ? "#" : module.href}
      className={`module-card block rounded-2xl p-6 border transition-colors bg-[var(--card-bg)] border-[var(--card-border)] ${isComingSoon ? "cursor-default" : "cursor-pointer"}`}>
      <div className="flex items-start justify-between mb-4">
        <span className="text-2xl">{module.icon}</span>
        {isComingSoon && <span className="text-[10px] font-semibold tracking-widest uppercase px-2 py-1 rounded-full bg-[var(--main-bg2)] text-[var(--text-muted)]">Coming soon</span>}
      </div>
      <p className="font-semibold text-[var(--text-primary)] mb-1">{module.label}</p>
      <p className="text-sm text-[var(--text-muted)]">{module.description}</p>
      {!isComingSoon && <div className="mt-4 h-0.5 w-8 rounded-full" style={{ background: module.color }} />}
    </Link>
  );
}

export default async function DashboardPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let displayName = "";
  let hiddenModules: string[] = [];
  const tz = "Asia/Dubai";

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name, hidden_modules, timezone")
      .eq("id", user.id)
      .single();
    displayName = profile?.display_name ?? "";
    hiddenModules = profile?.hidden_modules ?? [];
  }

  // Dubai time
  const now = new Date();
  const todayDubai = now.toLocaleDateString("en-CA", { timeZone: tz }); // YYYY-MM-DD
  const timeDubai  = now.toLocaleTimeString("en-AE", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: true });
  const dateLong   = now.toLocaleDateString("en-AE", { timeZone: tz, weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const hour = parseInt(now.toLocaleString("en-US", { timeZone: tz, hour: "numeric", hour12: false }));
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const firstName = displayName || user?.email?.split("@")[0] || "there";

  // Fetch today's calendar events
  type CalEvent = { id: string; title: string; event_type: string; work_start?: string; work_end?: string; color?: string; };
  let todayEvents: CalEvent[] = [];
  if (user) {
    const { data } = await supabase
      .from("calendar_events")
      .select("id,title,event_type,work_start,work_end,color")
      .eq("user_id", user.id)
      .eq("date", todayDubai)
      .order("work_start", { ascending: true });
    todayEvents = (data ?? []) as CalEvent[];
  }

  // Fetch pending dues for today's month
  const currentMonth = todayDubai.slice(0, 7);
  type DueItem = { id: string; name: string; due_date_day: number | null; };
  type DueEntry = { due_item_id: string; status: string; amount: number | null; };
  let pendingDues: { name: string; dueDay: number | null }[] = [];
  if (user) {
    const [itemsRes, entriesRes] = await Promise.all([
      supabase.from("due_items").select("id,name,due_date_day").eq("user_id", user.id).eq("is_hidden", false),
      supabase.from("due_entries").select("due_item_id,status,amount").eq("user_id", user.id).eq("month", currentMonth),
    ]);
    const items = (itemsRes.data ?? []) as DueItem[];
    const entries = (entriesRes.data ?? []) as DueEntry[];
    pendingDues = items
      .filter(item => {
        const entry = entries.find(e => e.due_item_id === item.id);
        // Skip paid and zero-amount
        if (entry?.status === "paid") return false;
        if (entry?.amount === 0) return false;
        return true;
      })
      .map(item => ({ name: item.name, dueDay: item.due_date_day }));
  }

  const workEvents   = todayEvents.filter(e => e.event_type === "work");
  const annivEvents  = todayEvents.filter(e => e.event_type === "birthday");
  const otherEvents  = todayEvents.filter(e => !["work","birthday","due_paid"].includes(e.event_type));
  const hasAgenda    = workEvents.length > 0 || annivEvents.length > 0 || pendingDues.length > 0 || otherEvents.length > 0;

  function workLabel(ev: CalEvent): string {
    if (ev.work_start && ev.work_end) return `${ev.title} · ${ev.work_start}–${ev.work_end}`;
    return ev.title;
  }

  const visibleModules  = MODULES.filter(m => !hiddenModules.includes(m.id));
  const financeModules  = visibleModules.filter(m => m.group === "finance");
  const lifestyleModules= visibleModules.filter(m => m.group === "lifestyle");

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header — date + time + agenda */}
      <div className="mb-10">
        <h1 className="font-display text-3xl mb-1" style={{ color:"var(--text-primary)" }}>
          {greeting}, <span className="text-accent italic">{firstName}.</span>
        </h1>
        <p className="text-sm mb-1" style={{ color:"var(--text-muted)" }}>{dateLong}</p>
        <p className="text-2xl font-bold tabular-nums" style={{ color:"var(--text-primary)", letterSpacing:"-0.03em" }}>{timeDubai}</p>

        {/* Today's agenda */}
        {hasAgenda && (
          <div className="mt-5 rounded-2xl border overflow-hidden" style={{ background:"var(--card-bg)", borderColor:"var(--card-border)" }}>
            <div className="px-4 py-3 border-b flex items-center gap-2" style={{ borderColor:"var(--card-border)", background:"var(--main-bg2)" }}>
              <span className="text-sm">📋</span>
              <span className="text-xs font-bold tracking-widest uppercase" style={{ color:"var(--text-muted)" }}>Today&apos;s agenda</span>
            </div>
            <div className="divide-y" style={{ borderColor:"var(--card-border)" }}>
              {workEvents.map(ev => (
                <Link key={ev.id} href="/dashboard/calendar" className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--main-bg2)] transition-colors no-underline">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background:"#3b82f6" }} />
                  <span className="text-sm font-semibold" style={{ color:"var(--text-primary)" }}>{workLabel(ev)}</span>
                  <span className="text-xs ml-auto" style={{ color:"var(--text-muted)" }}>Work</span>
                </Link>
              ))}
              {annivEvents.map(ev => (
                <Link key={ev.id} href="/dashboard/calendar" className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--main-bg2)] transition-colors no-underline">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background:"#ec4899" }} />
                  <span className="text-sm font-semibold" style={{ color:"var(--text-primary)" }}>{ev.title}</span>
                  <span className="text-xs ml-auto" style={{ color:"#ec4899" }}>Anniversary 🎂</span>
                </Link>
              ))}
              {pendingDues.slice(0, 5).map((due, i) => (
                <Link key={i} href="/dashboard/budget" className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--main-bg2)] transition-colors no-underline">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background:"#F5A623" }} />
                  <span className="text-sm font-semibold" style={{ color:"var(--text-primary)" }}>{due.name}</span>
                  <span className="text-xs ml-auto" style={{ color:"#F5A623" }}>
                    Due{due.dueDay ? ` ${due.dueDay}th` : ""}
                  </span>
                </Link>
              ))}
              {pendingDues.length > 5 && (
                <Link href="/dashboard/budget" className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--main-bg2)] transition-colors no-underline">
                  <span className="w-2 h-2 rounded-full flex-shrink-0 opacity-30" style={{ background:"#F5A623" }} />
                  <span className="text-sm" style={{ color:"var(--text-muted)" }}>+{pendingDues.length - 5} more pending dues</span>
                </Link>
              )}
              {otherEvents.map(ev => (
                <Link key={ev.id} href="/dashboard/calendar" className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--main-bg2)] transition-colors no-underline">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: ev.color ?? "#8b5cf6" }} />
                  <span className="text-sm font-semibold" style={{ color:"var(--text-primary)" }}>{ev.title}</span>
                  <span className="text-xs ml-auto" style={{ color:"var(--text-muted)" }}>Event</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {!hasAgenda && (
          <p className="mt-4 text-sm" style={{ color:"var(--text-muted)" }}>Nothing scheduled today — enjoy the calm.</p>
        )}
      </div>

      {/* Module grid */}
      {financeModules.length > 0 && (
        <section className="mb-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-accent hub-pulse" />
              <h2 className="text-xs font-bold tracking-widest uppercase text-accent">Finance Hub</h2>
            </div>
            <div className="flex-1 h-px" style={{ background:"var(--divider)" }} />
            <p className="text-xs" style={{ color:"var(--text-muted)" }}>These modules share a financial ledger</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {financeModules.map(m => <ModuleCard key={m.id} module={m} />)}
          </div>
        </section>
      )}

      {lifestyleModules.length > 0 && (
        <section className="mb-10">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-xs font-bold tracking-widest uppercase" style={{ color:"var(--text-muted)" }}>Lifestyle</h2>
            <div className="flex-1 h-px" style={{ background:"var(--divider)" }} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {lifestyleModules.map(m => <ModuleCard key={m.id} module={m} />)}
          </div>
        </section>
      )}
    </div>
  );
}
