import { createClient } from "@/lib/supabase/server";
import { MODULES } from "@/lib/modules";
import Link from "next/link";

function ModuleCard({ module }: { module: (typeof MODULES)[0] }) {
  const isComingSoon = module.status === "coming-soon";

  const cardClass =
    "module-card block rounded-2xl p-6 border transition-colors bg-[var(--card-bg)] border-[var(--card-border)]";

  const content = (
    <>
      <div className="flex items-start justify-between mb-4">
        <span className="text-2xl">{module.icon}</span>
        {isComingSoon && (
          <span className="text-[10px] font-semibold tracking-widest uppercase px-2 py-1 rounded-full bg-[var(--main-bg2)] text-[var(--text-muted)]">
            Coming soon
          </span>
        )}
      </div>
      <p className="font-semibold text-[var(--text-primary)] mb-1">{module.label}</p>
      <p className="text-sm text-[var(--text-muted)]">{module.description}</p>
      {!isComingSoon && (
        <div className="mt-4 h-0.5 w-8 rounded-full" style={{ background: module.color }} />
      )}
    </>
  );

  if (isComingSoon) {
    return (
      <div className={`${cardClass} cursor-default opacity-80`} aria-disabled="true">
        {content}
      </div>
    );
  }

  return (
    <Link href={module.href} className={`${cardClass} cursor-pointer`}>
      {content}
    </Link>
  );
}

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let displayName = "";
  let hiddenModules: string[] = [];
  let timezone = "UTC";

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name, hidden_modules, timezone")
      .eq("id", user.id)
      .single();

    displayName = profile?.display_name ?? "";
    hiddenModules = profile?.hidden_modules ?? [];
    timezone = profile?.timezone ?? "UTC";
  }

  const now = new Date();

  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(now)
    .replace(/\//g, "-");

  const tomorrowDate = new Date(now);
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrow = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(tomorrowDate)
    .replace(/\//g, "-");

  const timeNow = now.toLocaleTimeString("en-AE", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  const dateLong = now.toLocaleDateString("en-AE", {
    timeZone: timezone,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      hour12: false,
    }).format(now)
  );

  // Dubai weather
  let dubaiTemp: number | null = null;
  let weatherCode: number | null = null;
  try {
    const wRes = await fetch(
      "https://api.open-meteo.com/v1/forecast?latitude=25.2048&longitude=55.2708&current=temperature_2m,weather_code&timezone=Asia%2FDubai",
      { next: { revalidate: 1800 } }
    );
    const wData = await wRes.json();
    dubaiTemp = wData?.current?.temperature_2m ?? null;
    weatherCode = wData?.current?.weather_code ?? null;
  } catch { /* skip */ }

  function weatherEmoji(code: number | null, hr: number): string {
    if (code === null) return "";
    const isNight = hr < 6 || hr >= 19;
    if (code === 0) return isNight ? "🌙" : "☀️";
    if (code <= 2)  return isNight ? "🌙" : "🌤️";
    if (code <= 3)  return "⛅";
    if (code <= 49) return "🌫️";
    if (code <= 69) return "🌧️";
    if (code <= 79) return "🌨️";
    if (code <= 99) return "⛈️";
    return "🌤️";
  }

  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const firstName = displayName || user?.email?.split("@")[0] || "there";

  type CalEvent = {
    id: string;
    title: string;
    event_type: string;
    work_start?: string;
    work_end?: string;
    color?: string;
    date: string;
  };

  type PortfolioPurchase = {
    id: string;
    purchased_at: string;
    transaction_type: string | null;
    portfolio_items?: { symbol?: string; name?: string } | null;
  };

  type PortfolioItem = {
    id: string;
    current_price: number | null;
  };

  type PortfolioStatRow = {
    item_id: string;
    units: number;
    total_paid: number;
    currency: string;
    transaction_type: string | null;
  };

  let todayEvents: CalEvent[] = [];
  let tomorrowEvents: CalEvent[] = [];
  let todayPortfolio: PortfolioPurchase[] = [];
  let portfolioCurrentAed = 0;
  type ExpiryItem = { id: string; name: string; expiry_date: string; category: string; location: string | null };
  let expiringItems: ExpiryItem[] = [];

  if (user) {
    const weekFromNow = new Date(now);
    weekFromNow.setDate(weekFromNow.getDate() + 7);
    const weekStr = weekFromNow.toLocaleDateString("en-CA", { timeZone: timezone });

    const [calendarRes, portfolioRes, itemRes, statRes, expiryRes] = await Promise.all([
      supabase
        .from("calendar_events")
        .select("id,title,event_type,work_start,work_end,color,date")
        .eq("user_id", user.id)
        .in("date", [today, tomorrow])
        .order("work_start", { ascending: true }),
      supabase
        .from("portfolio_purchases")
        .select("id,purchased_at,transaction_type,portfolio_items(symbol,name)")
        .eq("user_id", user.id)
        .gte("purchased_at", `${today}T00:00:00`)
        .lte("purchased_at", `${today}T23:59:59`)
        .order("purchased_at", { ascending: false }),
      supabase
        .from("portfolio_items")
        .select("id,current_price")
        .eq("user_id", user.id),
      supabase
        .from("portfolio_purchases")
        .select("item_id,units,total_paid,currency,transaction_type")
        .eq("user_id", user.id),
      supabase
        .from("inventory_items")
        .select("id,name,expiry_date,category,location")
        .eq("user_id", user.id)
        .eq("is_finished", false)
        .not("expiry_date", "is", null)
        .lte("expiry_date", weekStr)
        .order("expiry_date", { ascending: true }),
    ]);

    const allCalEvents = (calendarRes.data ?? []) as CalEvent[];
    todayEvents = allCalEvents.filter(e => e.date === today);
    tomorrowEvents = allCalEvents.filter(e => e.date === tomorrow);
    todayPortfolio = (portfolioRes.data ?? []) as PortfolioPurchase[];
    expiringItems = (expiryRes.data ?? []) as ExpiryItem[];

    const items = (itemRes.data ?? []) as PortfolioItem[];
    const stats = (statRes.data ?? []) as PortfolioStatRow[];

    const statMap = new Map<string, number>();
    for (const row of stats) {
      const tx =
        row.transaction_type ??
        ((Number(row.units) || 0) < 0 || (Number(row.total_paid) || 0) < 0 ? "sell" : "buy");
      const absUnits = Math.abs(Number(row.units) || 0);
      const existing = statMap.get(row.item_id) ?? 0;
      statMap.set(row.item_id, tx === "buy" ? existing + absUnits : existing - absUnits);
    }

    for (const item of items) {
      const units = Math.max(0, statMap.get(item.id) ?? 0);
      portfolioCurrentAed += (item.current_price ?? 0) * units;
    }
  }

  function fmt12(t?: string) {
    if (!t) return "";
    const [h, m] = t.split(":").map(Number);
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 || 12;
    return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
  }

  const workToday = todayEvents.filter((e) => e.event_type === "work");
  const otherToday = todayEvents.filter((e) => e.event_type !== "work");

  const visibleModules = MODULES.filter((m) => !hiddenModules.includes(m.id));
  const financeModules = visibleModules.filter((m) => m.group === "finance");
  const lifestyleModules = visibleModules.filter((m) => m.group === "lifestyle");

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-10">
        <h1 className="font-display text-3xl mb-1" style={{ color: "var(--text-primary)" }}>
          {greeting}, <span className="text-accent italic">{firstName}.</span>
        </h1>

        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          {dateLong} · <span style={{ color: "var(--text-primary)" }}>{timeNow}</span>
          {dubaiTemp !== null && (
            <span style={{ color: "var(--text-muted)" }}>
              {" "}· {weatherEmoji(weatherCode, hour)}{" "}
              <span style={{ color: "var(--text-primary)" }}>{dubaiTemp.toFixed(0)}°C</span>
            </span>
          )}
        </p>

        <div
          className="mt-5 rounded-2xl border overflow-hidden"
          style={{ background: "var(--card-bg)", borderColor: "var(--card-border)" }}
        >
          <div
            className="px-4 py-3 border-b"
            style={{ borderColor: "var(--card-border)", background: "var(--main-bg2)" }}
          >
            <span className="text-xs font-bold tracking-widest uppercase" style={{ color: "var(--text-muted)" }}>
              Daily snapshot
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-0">
            <div className="p-4 border-b md:border-b-0 md:border-r" style={{ borderColor: "var(--card-border)" }}>
              <div className="text-[11px] font-bold tracking-widest uppercase mb-2" style={{ color: "var(--text-muted)" }}>
                Today&apos;s work
              </div>
              {workToday.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {workToday.map((ev) => (
                    <div key={ev.id}>
                      <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                        {ev.title.startsWith("Work:") ? ev.title.replace("Work:", "") : ev.title}
                      </div>
                      {ev.work_start && ev.work_end && (
                        <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                          {fmt12(ev.work_start)} to {fmt12(ev.work_end)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm" style={{ color: "var(--text-muted)" }}>No work logged today</div>
              )}
            </div>

            <div className="p-4 border-b md:border-b-0 md:border-r" style={{ borderColor: "var(--card-border)" }}>
              <div className="text-[11px] font-bold tracking-widest uppercase mb-2" style={{ color: "var(--text-muted)" }}>
                Events & portfolio
              </div>
              <div className="flex flex-col gap-2">
                {otherToday.slice(0, 2).map((ev) => (
                  <div key={ev.id} className="text-sm" style={{ color: "var(--text-primary)" }}>{ev.title}</div>
                ))}
                {todayPortfolio.slice(0, 2).map((tx) => (
                  <div key={tx.id} className="text-sm" style={{ color: "var(--text-primary)" }}>
                    Portfolio: {tx.transaction_type === "sell" ? "Sold" : "Purchased"}{" "}
                    {tx.portfolio_items?.symbol ?? "Asset"}
                  </div>
                ))}
                {otherToday.length === 0 && todayPortfolio.length === 0 && (
                  <div className="text-sm" style={{ color: "var(--text-muted)" }}>Quiet day so far</div>
                )}
              </div>
            </div>

            <div className="p-4">
              <div className="text-[11px] font-bold tracking-widest uppercase mb-2" style={{ color: "var(--text-muted)" }}>
                Portfolio snapshot
              </div>
              <div className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
                AED {portfolioCurrentAed.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Current portfolio value</div>
            </div>
          </div>
        </div>
      </div>

      {/* Tomorrow's events */}
      {tomorrowEvents.length > 0 && (
        <div
          className="mt-4 rounded-2xl border overflow-hidden"
          style={{ background: "var(--card-bg)", borderColor: "var(--card-border)" }}
        >
          <div
            className="px-4 py-3 border-b"
            style={{ borderColor: "var(--card-border)", background: "var(--main-bg2)" }}
          >
            <span className="text-xs font-bold tracking-widest uppercase" style={{ color: "var(--text-muted)" }}>
              Tomorrow
            </span>
          </div>
          <div className="flex flex-col divide-y" style={{ borderColor: "var(--card-border)" }}>
            {tomorrowEvents.map((ev) => (
              <div key={ev.id} className="px-4 py-3 flex items-center gap-3">
                {ev.color && (
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: ev.color, flexShrink: 0 }} />
                )}
                <div className="flex-1">
                  <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                    {ev.title.startsWith("Work:") ? ev.title.replace("Work:", "").trim() : ev.title}
                  </div>
                  {ev.work_start && ev.work_end && (
                    <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {fmt12(ev.work_start)} – {fmt12(ev.work_end)}
                    </div>
                  )}
                </div>
                <div className="text-xs shrink-0" style={{ color: "var(--text-muted)" }}>
                  {ev.event_type === "work" ? "🔵 Work" : ev.event_type === "leave" ? "🟢 Leave" : "📌"}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>

      {/* Expiring items alert */}
      {expiringItems.length > 0 && (
        <section className="mb-8">
          <div className="rounded-2xl border overflow-hidden" style={{ background:"var(--card-bg)", borderColor:"rgba(239,68,68,0.3)" }}>
            <div className="px-4 py-3 border-b flex items-center gap-2" style={{ borderColor:"rgba(239,68,68,0.2)", background:"rgba(239,68,68,0.05)" }}>
              <span>⏰</span>
              <span className="text-xs font-bold tracking-widest uppercase" style={{ color:"#ef4444" }}>
                Expiring within 7 days — {expiringItems.length} item{expiringItems.length > 1 ? "s" : ""}
              </span>
            </div>
            <div className="divide-y" style={{ borderColor:"var(--card-border)" }}>
              {expiringItems.map(item => {
                const days = Math.ceil((new Date(item.expiry_date).getTime() - new Date(today).getTime()) / 86400000);
                const isExpired = days < 0;
                const isToday = days === 0;
                return (
                  <div key={item.id} className="px-4 py-3 flex items-center justify-between gap-4">
                    <div>
                      <div className="text-sm font-semibold" style={{ color:"var(--text-primary)" }}>{item.name}</div>
                      <div className="text-xs" style={{ color:"var(--text-muted)" }}>
                        {item.category}{item.location ? ` · ${item.location}` : ""}
                      </div>
                    </div>
                    <div className="text-xs font-bold shrink-0" style={{ color: isExpired ? "#ef4444" : isToday ? "#ef4444" : days <= 3 ? "#f59e0b" : "#eab308" }}>
                      {isExpired ? `Expired ${Math.abs(days)}d ago` : isToday ? "Expires today!" : days === 1 ? "Tomorrow" : `${days} days`}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {financeModules.length > 0 && (
        <section className="mb-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-accent hub-pulse" />
              <h2 className="text-xs font-bold tracking-widest uppercase text-accent">Finance Hub</h2>
            </div>
            <div className="flex-1 h-px" style={{ background: "var(--divider)" }} />
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>These modules share a financial ledger</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {financeModules.map((m) => <ModuleCard key={m.id} module={m} />)}
          </div>
        </section>
      )}

      {lifestyleModules.length > 0 && (
        <section className="mb-10">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-xs font-bold tracking-widest uppercase" style={{ color: "var(--text-muted)" }}>
              Lifestyle
            </h2>
            <div className="flex-1 h-px" style={{ background: "var(--divider)" }} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {lifestyleModules.map((m) => <ModuleCard key={m.id} module={m} />)}
          </div>
        </section>
      )}
    </div>
  );
}
