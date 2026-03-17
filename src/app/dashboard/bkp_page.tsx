import { createClient } from "@/lib/supabase/server";
import { MODULES } from "@/lib/modules";
import Link from "next/link";

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

function weatherEmoji(code: number | null, hr: number): string {
  if (code === null) return "";
  const isNight = hr < 6 || hr >= 19;
  if (code === 0) return isNight ? "🌙" : "☀️";
  if (code <= 2) return isNight ? "🌙" : "🌤️";
  if (code <= 3) return "⛅";
  if (code <= 49) return "🌫️";
  if (code <= 69) return "🌧️";
  if (code <= 79) return "🌨️";
  if (code <= 99) return "⛈️";
  return "🌤️";
}

function getWeatherCoordsForTimezone(timezone: string): { latitude: number; longitude: number } | null {
  const map: Record<string, { latitude: number; longitude: number }> = {
    "Asia/Dubai": { latitude: 25.2048, longitude: 55.2708 },
    "Asia/Kolkata": { latitude: 19.076, longitude: 72.8777 },
    "Europe/London": { latitude: 51.5072, longitude: -0.1276 },
    "America/New_York": { latitude: 40.7128, longitude: -74.006 },
    "America/Los_Angeles": { latitude: 34.0522, longitude: -118.2437 },
    "Asia/Singapore": { latitude: 1.3521, longitude: 103.8198 },
    "Asia/Tokyo": { latitude: 35.6762, longitude: 139.6503 },
    "Australia/Sydney": { latitude: -33.8688, longitude: 151.2093 },
  };

  return map[timezone] ?? null;
}

function ModuleCard({ module }: { module: (typeof MODULES)[0] }) {
  const isComingSoon = module.status === "coming-soon";

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
      <div className="module-card block rounded-2xl p-6 border bg-[var(--card-bg)] border-[var(--card-border)] opacity-80 cursor-default">
        {content}
      </div>
    );
  }

  return (
    <Link
      href={module.href}
      className="module-card block rounded-2xl p-6 border transition-colors bg-[var(--card-bg)] border-[var(--card-border)] cursor-pointer"
    >
      {content}
    </Link>
  );
}

export default async function DashboardPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let displayName = "";
  let hiddenModules: string[] = [];
  let tz = "UTC";

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name, hidden_modules, timezone")
      .eq("id", user.id)
      .single();

    displayName = profile?.display_name ?? "";
    hiddenModules = Array.isArray(profile?.hidden_modules) ? profile.hidden_modules : [];
    tz = profile?.timezone || "UTC";
  }

  const now = new Date();
  const todayLocal = now.toLocaleDateString("en-CA", { timeZone: tz });
  const timeLocal = now.toLocaleTimeString("en-AE", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
  const dateLong = now.toLocaleDateString("en-AE", {
    timeZone: tz,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const hour = parseInt(
    now.toLocaleString("en-US", {
      timeZone: tz,
      hour: "numeric",
      hour12: false,
    }),
    10
  );

  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const firstName =
    displayName?.trim() ||
    user?.email?.split("@")[0]?.replace(/[._-]+/g, " ") ||
    "there";

  let localTemp: number | null = null;
  let weatherCode: number | null = null;

  const weatherCoords = getWeatherCoordsForTimezone(tz);
  if (weatherCoords) {
    try {
      const wRes = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${weatherCoords.latitude}&longitude=${weatherCoords.longitude}&current=temperature_2m,weather_code&timezone=${encodeURIComponent(
          tz
        )}`,
        { next: { revalidate: 1800 } }
      );

      if (wRes.ok) {
        const wData = await wRes.json();
        localTemp = wData?.current?.temperature_2m ?? null;
        weatherCode = wData?.current?.weather_code ?? null;
      }
    } catch {
      // skip weather
    }
  }

  type CalEvent = {
    id: string;
    title: string;
    event_type: string;
    work_start?: string;
    work_end?: string;
    color?: string;
  };

  let todayEvents: CalEvent[] = [];
  if (user) {
    const { data } = await supabase
      .from("calendar_events")
      .select("id,title,event_type,work_start,work_end,color")
      .eq("user_id", user.id)
      .eq("date", todayLocal)
      .order("work_start", { ascending: true });

    todayEvents = (data ?? []) as CalEvent[];
  }

  const currentMonth = todayLocal.slice(0, 7);

  type DueItem = {
    id: string;
    name: string;
    due_date_day: number | null;
  };

  type DueEntry = {
    due_item_id: string;
    status: string;
    amount: number | null;
  };

  let pendingDues: { name: string; dueDay: number | null }[] = [];
  if (user) {
    const [itemsRes, entriesRes] = await Promise.all([
      supabase
        .from("due_items")
        .select("id,name,due_date_day")
        .eq("user_id", user.id)
        .eq("is_hidden", false),
      supabase
        .from("due_entries")
        .select("due_item_id,status,amount")
        .eq("user_id", user.id)
        .eq("month", currentMonth),
    ]);

    const items = (itemsRes.data ?? []) as DueItem[];
    const entries = (entriesRes.data ?? []) as DueEntry[];
    const entryMap = new Map(entries.map((e) => [e.due_item_id, e]));

    pendingDues = items
      .filter((item) => {
        const entry = entryMap.get(item.id);
        if (entry?.status === "paid") return false;
        if (entry?.amount === 0) return false;
        return true;
      })
      .map((item) => ({ name: item.name, dueDay: item.due_date_day }));
  }

  const workEvents = todayEvents.filter((e) => e.event_type === "work");
  const annivEvents = todayEvents.filter((e) => e.event_type === "birthday");
  const otherEvents = todayEvents.filter(
    (e) => !["work", "birthday", "due_paid"].includes(e.event_type)
  );

  const MAX_WORK = 3;
  const MAX_ANNIV = 2;
  const MAX_DUES = 5;
  const MAX_OTHER = 3;

  const visibleWorkEvents = workEvents.slice(0, MAX_WORK);
  const visibleAnnivEvents = annivEvents.slice(0, MAX_ANNIV);
  const visiblePendingDues = pendingDues.slice(0, MAX_DUES);
  const visibleOtherEvents = otherEvents.slice(0, MAX_OTHER);

  const moreWorkCount = Math.max(0, workEvents.length - MAX_WORK);
  const moreAnnivCount = Math.max(0, annivEvents.length - MAX_ANNIV);
  const moreDueCount = Math.max(0, pendingDues.length - MAX_DUES);
  const moreOtherCount = Math.max(0, otherEvents.length - MAX_OTHER);

  const hasAgenda =
    workEvents.length > 0 ||
    annivEvents.length > 0 ||
    pendingDues.length > 0 ||
    otherEvents.length > 0;

  function fmt12(t?: string): string {
    if (!t) return "";
    const [h, m] = t.split(":").map(Number);
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 || 12;
    return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
  }

  function workLabel(ev: CalEvent): string {
    if (ev.work_start && ev.work_end) {
      return `${ev.title} · ${fmt12(ev.work_start)}–${fmt12(ev.work_end)}`;
    }
    return ev.title;
  }

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
          {dateLong} · <span style={{ color: "var(--text-primary)" }}>{timeLocal}</span>
          {localTemp !== null && (
            <span style={{ color: "var(--text-muted)" }}>
              {" "}· {weatherEmoji(weatherCode, hour)}{" "}
              <span style={{ color: "var(--text-primary)" }}>
                {localTemp.toFixed(0)}°C
              </span>
            </span>
          )}
        </p>

        {hasAgenda && (
          <div
            className="mt-5 rounded-2xl border overflow-hidden"
            style={{ background: "var(--card-bg)", borderColor: "var(--card-border)" }}
          >
            <div
              className="px-4 py-3 border-b flex items-center gap-2"
              style={{ borderColor: "var(--card-border)", background: "var(--main-bg2)" }}
            >
              <span className="text-sm">📋</span>
              <span
                className="text-xs font-bold tracking-widest uppercase"
                style={{ color: "var(--text-muted)" }}
              >
                Today&apos;s agenda
              </span>
            </div>

            <div className="divide-y" style={{ borderColor: "var(--card-border)" }}>
              {visibleWorkEvents.map((ev) => (
                <Link
                  key={ev.id}
                  href="/dashboard/calendar"
                  className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--main-bg2)] transition-colors no-underline"
                >
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ background: "#3b82f6" }}
                  />
                  <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                    {workLabel(ev)}
                  </span>
                  <span className="text-xs ml-auto" style={{ color: "var(--text-muted)" }}>
                    Work
                  </span>
                </Link>
              ))}

              {moreWorkCount > 0 && (
                <Link
                  href="/dashboard/calendar"
                  className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--main-bg2)] transition-colors no-underline"
                >
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0 opacity-30"
                    style={{ background: "#3b82f6" }}
                  />
                  <span className="text-sm" style={{ color: "var(--text-muted)" }}>
                    +{moreWorkCount} more work item{moreWorkCount > 1 ? "s" : ""}
                  </span>
                </Link>
              )}

              {visibleAnnivEvents.map((ev) => (
                <Link
                  key={ev.id}
                  href="/dashboard/calendar"
                  className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--main-bg2)] transition-colors no-underline"
                >
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ background: "#ec4899" }}
                  />
                  <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                    {ev.title}
                  </span>
                  <span className="text-xs ml-auto" style={{ color: "#ec4899" }}>
                    Anniversary 🎂
                  </span>
                </Link>
              ))}

              {moreAnnivCount > 0 && (
                <Link
                  href="/dashboard/calendar"
                  className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--main-bg2)] transition-colors no-underline"
                >
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0 opacity-30"
                    style={{ background: "#ec4899" }}
                  />
                  <span className="text-sm" style={{ color: "var(--text-muted)" }}>
                    +{moreAnnivCount} more anniversary item{moreAnnivCount > 1 ? "s" : ""}
                  </span>
                </Link>
              )}

              {visiblePendingDues.map((due) => (
                <Link
                  key={`${due.name}-${due.dueDay ?? "na"}`}
                  href="/dashboard/budget"
                  className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--main-bg2)] transition-colors no-underline"
                >
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ background: "#F5A623" }}
                  />
                  <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                    {due.name}
                  </span>
                  <span className="text-xs ml-auto" style={{ color: "#F5A623" }}>
                    Due{due.dueDay ? ` ${ordinal(due.dueDay)}` : ""}
                  </span>
                </Link>
              ))}

              {moreDueCount > 0 && (
                <Link
                  href="/dashboard/budget"
                  className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--main-bg2)] transition-colors no-underline"
                >
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0 opacity-30"
                    style={{ background: "#F5A623" }}
                  />
                  <span className="text-sm" style={{ color: "var(--text-muted)" }}>
                    +{moreDueCount} more pending due{moreDueCount > 1 ? "s" : ""}
                  </span>
                </Link>
              )}

              {visibleOtherEvents.map((ev) => (
                <Link
                  key={ev.id}
                  href="/dashboard/calendar"
                  className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--main-bg2)] transition-colors no-underline"
                >
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ background: ev.color ?? "#8b5cf6" }}
                  />
                  <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                    {ev.title}
                  </span>
                  <span className="text-xs ml-auto" style={{ color: "var(--text-muted)" }}>
                    Event
                  </span>
                </Link>
              ))}

              {moreOtherCount > 0 && (
                <Link
                  href="/dashboard/calendar"
                  className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--main-bg2)] transition-colors no-underline"
                >
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0 opacity-30"
                    style={{ background: "#8b5cf6" }}
                  />
                  <span className="text-sm" style={{ color: "var(--text-muted)" }}>
                    +{moreOtherCount} more event{moreOtherCount > 1 ? "s" : ""}
                  </span>
                </Link>
              )}
            </div>
          </div>
        )}

        {!hasAgenda && (
          <p className="mt-4 text-sm" style={{ color: "var(--text-muted)" }}>
            Nothing scheduled today — enjoy the calm.
          </p>
        )}
      </div>

      {financeModules.length > 0 && (
        <section className="mb-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-accent hub-pulse" />
              <h2 className="text-xs font-bold tracking-widest uppercase text-accent">
                Finance Hub
              </h2>
            </div>
            <div className="flex-1 h-px" style={{ background: "var(--divider)" }} />
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              These modules share a financial ledger
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {financeModules.map((m) => (
              <ModuleCard key={m.id} module={m} />
            ))}
          </div>
        </section>
      )}

      {lifestyleModules.length > 0 && (
        <section className="mb-10">
          <div className="flex items-center gap-3 mb-4">
            <h2
              className="text-xs font-bold tracking-widest uppercase"
              style={{ color: "var(--text-muted)" }}
            >
              Lifestyle
            </h2>
            <div className="flex-1 h-px" style={{ background: "var(--divider)" }} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {lifestyleModules.map((m) => (
              <ModuleCard key={m.id} module={m} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}