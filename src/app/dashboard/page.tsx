import { createClient } from "@/lib/supabase/server";
import { MODULES } from "@/lib/modules";
import Link from "next/link";
import { mylifeBorderRadius, mylifeSpacing } from "@/lib/mylife-design-tokens";

function ModuleCard({ module }: { module: (typeof MODULES)[0] }) {
  const isComingSoon = module.status === "coming-soon";

  const cardStyle = {
    display: "block",
    borderRadius: mylifeBorderRadius.xl,
    padding: `${mylifeSpacing[6]} ${mylifeSpacing[6]}`,
    border: "1px solid var(--card-border)",
    transition: "all 200ms ease-in-out",
    backgroundColor: "var(--card-bg)",
    cursor: isComingSoon ? "default" : "pointer",
    opacity: isComingSoon ? 0.8 : 1,
  } as const;

  const badgeStyle = {
    fontSize: "11px",
    fontWeight: 600,
    letterSpacing: "0.1em",
    textTransform: "uppercase" as const,
    padding: `${mylifeSpacing[1]} ${mylifeSpacing[2]}`,
    borderRadius: mylifeBorderRadius.full,
    backgroundColor: "var(--main-bg2)",
    color: "var(--text-muted)",
  };

  const content = (
    <>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: mylifeSpacing[4] }}>
        <span style={{ fontSize: "1.5rem" }}>{module.icon}</span>
        {isComingSoon && <span style={badgeStyle}>Coming soon</span>}
      </div>
      <p style={{ fontWeight: 600, color: "var(--text-primary)", marginBottom: mylifeSpacing[1], fontSize: "16px" }}>
        {module.label}
      </p>
      <p style={{ fontSize: "14px", color: "var(--text-muted)", lineHeight: "1.5" }}>
        {module.description}
      </p>
      {!isComingSoon && (
        <div style={{
          marginTop: mylifeSpacing[4],
          height: "2px",
          width: mylifeSpacing[8],
          borderRadius: mylifeBorderRadius.full,
          background: module.color || "var(--color-accent)",
        }} />
      )}
    </>
  );

  if (isComingSoon) {
    return <div style={cardStyle} aria-disabled="true">{content}</div>;
  }

  return <Link href={module.href} style={cardStyle}>{content}</Link>;
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
      "https://api.open-meteo.com/v1/forecast?latitude=25.2048&longitude=55.2708&current=temperature_2m,weather_code",
      { next: { revalidate: 1800 } }
    );
    const wData = await wRes.json();
    dubaiTemp = wData?.current?.temperature_2m ?? null;
    weatherCode = wData?.current?.weather_code ?? null;
  } catch {
    /* skip */
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
  type ExpiryItem = { id: string; name: string; expiry_date: string; category: string; location?: string };
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
    todayEvents = allCalEvents.filter((e) => e.date === today);
    tomorrowEvents = allCalEvents.filter((e) => e.date === tomorrow);
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

  // ===== Style objects using design tokens =====
  const labelStyle = {
    fontSize: "11px",
    fontWeight: "bold",
    letterSpacing: "0.1em",
    textTransform: "uppercase" as const,
    marginBottom: mylifeSpacing[2],
    color: "var(--text-muted)",
  };

  const cellStyle = {
    padding: mylifeSpacing[4],
    borderColor: "var(--card-border)",
  };

  const eventTextStyle = { fontSize: "14px", color: "var(--text-primary)" };
  const eventTimeStyle = { fontSize: "12px", color: "var(--text-muted)" };
  const mutedTextStyle = { fontSize: "14px", color: "var(--text-muted)" };

  return (
    <div style={{ padding: mylifeSpacing[6], maxWidth: "64rem", marginLeft: "auto", marginRight: "auto" }}>
      {/* Header */}
      <div style={{ marginBottom: mylifeSpacing[10] }}>
        <h1
          className="font-display"
          style={{ fontSize: "1.875rem", marginBottom: mylifeSpacing[1], color: "var(--text-primary)" }}
        >
          {greeting}, <span style={{ color: "var(--color-accent)", fontStyle: "italic" }}>{firstName}.</span>
        </h1>

        <p style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>
          {dateLong} · <span style={{ color: "var(--text-primary)" }}>{timeNow}</span>
          {dubaiTemp !== null && (
            <span style={{ color: "var(--text-muted)" }}>
              {" "}· {weatherEmoji(weatherCode, hour)}{" "}
              <span style={{ color: "var(--text-primary)" }}>{dubaiTemp.toFixed(0)}°C</span>
            </span>
          )}
        </p>

        {/* Daily snapshot */}
        <div
          style={{
            marginTop: mylifeSpacing[5],
            borderRadius: mylifeBorderRadius.xl,
            border: "1px solid var(--card-border)",
            overflow: "hidden",
            background: "var(--card-bg)",
          }}
        >
          <div
            style={{
              paddingLeft: mylifeSpacing[4],
              paddingRight: mylifeSpacing[4],
              paddingTop: mylifeSpacing[3],
              paddingBottom: mylifeSpacing[3],
              borderBottom: "1px solid var(--card-border)",
              background: "var(--main-bg2)",
            }}
          >
            <span
              style={{
                fontSize: "12px",
                fontWeight: "bold",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "var(--text-muted)",
              }}
            >
              Daily snapshot
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3">
            {/* Today's work */}
            <div style={{ ...cellStyle, borderBottom: "1px solid var(--card-border)" }} className="md:border-b-0 md:border-r">
              <div style={labelStyle}>Today&apos;s work</div>
              {workToday.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: mylifeSpacing[2] }}>
                  {workToday.map((ev) => (
                    <div key={ev.id}>
                      <div style={{ ...eventTextStyle, fontWeight: 600 }}>
                        {ev.title.startsWith("Work:") ? ev.title.replace("Work:", "").trim() : ev.title}
                      </div>
                      {ev.work_start && ev.work_end && (
                        <div style={eventTimeStyle}>
                          {fmt12(ev.work_start)} to {fmt12(ev.work_end)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={mutedTextStyle}>No work logged</div>
              )}

              {tomorrowEvents.filter((e) => e.event_type === "work").length > 0 && (
                <>
                  <div style={{ ...labelStyle, marginTop: mylifeSpacing[4] }}>Tomorrow&apos;s work</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: mylifeSpacing[2] }}>
                    {tomorrowEvents
                      .filter((e) => e.event_type === "work")
                      .map((ev) => (
                        <div key={ev.id}>
                          <div style={{ ...eventTextStyle, fontWeight: 600 }}>
                            {ev.title.startsWith("Work:") ? ev.title.replace("Work:", "").trim() : ev.title}
                          </div>
                          {ev.work_start && ev.work_end && (
                            <div style={eventTimeStyle}>
                              {fmt12(ev.work_start)} – {fmt12(ev.work_end)}
                            </div>
                          )}
                        </div>
                      ))}
                  </div>
                </>
              )}
            </div>

            {/* Events & portfolio */}
            <div style={{ ...cellStyle, borderBottom: "1px solid var(--card-border)" }} className="md:border-b-0 md:border-r">
              <div style={labelStyle}>Events &amp; portfolio</div>
              <div style={{ display: "flex", flexDirection: "column", gap: mylifeSpacing[2] }}>
                {otherToday.slice(0, 2).map((ev) => (
                  <div key={ev.id} style={eventTextStyle}>
                    {ev.title}
                  </div>
                ))}
                {todayPortfolio.slice(0, 2).map((tx) => (
                  <div key={tx.id} style={eventTextStyle}>
                    Portfolio: {tx.transaction_type === "sell" ? "Sold" : "Purchased"}{" "}
                    {tx.portfolio_items?.symbol ?? "Asset"}
                  </div>
                ))}
                {otherToday.length === 0 && todayPortfolio.length === 0 && (
                  <div style={mutedTextStyle}>Quiet day</div>
                )}
              </div>

              {tomorrowEvents.filter((e) => e.event_type !== "work").length > 0 && (
                <>
                  <div style={{ ...labelStyle, marginTop: mylifeSpacing[4] }}>Tomorrow</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: mylifeSpacing[2] }}>
                    {tomorrowEvents
                      .filter((e) => e.event_type !== "work")
                      .slice(0, 2)
                      .map((ev) => (
                        <div key={ev.id} style={eventTextStyle}>
                          {ev.title}
                        </div>
                      ))}
                  </div>
                </>
              )}
            </div>

            {/* Portfolio snapshot */}
            <div style={cellStyle}>
              <div style={labelStyle}>Portfolio snapshot</div>
              <div style={{ fontSize: "1.5rem", fontWeight: "bold", color: "var(--text-primary)" }}>
                AED {portfolioCurrentAed.toLocaleString("en-AE", { minimumFractionDigits: 2 })}
              </div>
              <div style={{ fontSize: "12px", marginTop: mylifeSpacing[1], color: "var(--text-muted)" }}>
                Current value
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Expiring items alert */}
      {expiringItems.length > 0 && (
        <section style={{ marginBottom: mylifeSpacing[8] }}>
          <div
            style={{
              borderRadius: mylifeBorderRadius.xl,
              border: "1px solid var(--card-border)",
              overflow: "hidden",
              background: "var(--card-bg)",
            }}
          >
            <div
              style={{
                paddingLeft: mylifeSpacing[4],
                paddingRight: mylifeSpacing[4],
                paddingTop: mylifeSpacing[3],
                paddingBottom: mylifeSpacing[3],
                borderBottom: "1px solid var(--card-border)",
                display: "flex",
                alignItems: "center",
                gap: mylifeSpacing[2],
              }}
            >
              <span>⏰</span>
              <span
                style={{
                  fontSize: "12px",
                  fontWeight: "bold",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "var(--text-muted)",
                }}
              >
                Expiring within 7 days — {expiringItems.length} item{expiringItems.length !== 1 ? "s" : ""}
              </span>
            </div>
            <div>
              {expiringItems.map((item, idx) => {
                const days = Math.ceil(
                  (new Date(item.expiry_date).getTime() - new Date(today).getTime()) / (1000 * 60 * 60 * 24)
                );
                const isExpired = days < 0;
                const isToday = days === 0;
                const isLast = idx === expiringItems.length - 1;

                return (
                  <div
                    key={item.id}
                    style={{
                      paddingLeft: mylifeSpacing[4],
                      paddingRight: mylifeSpacing[4],
                      paddingTop: mylifeSpacing[3],
                      paddingBottom: mylifeSpacing[3],
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      borderBottom: isLast ? "none" : "1px solid var(--card-border)",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>
                        {item.name}
                      </div>
                      <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                        {item.category}
                        {item.location ? ` · ${item.location}` : ""}
                      </div>
                    </div>
                    <div
                      style={{
                        fontSize: "12px",
                        fontWeight: "bold",
                        flexShrink: 0,
                        color: isExpired ? "#ef4444" : isToday ? "#f59e0b" : "var(--text-muted)",
                      }}
                    >
                      {isExpired
                        ? `Expired ${Math.abs(days)}d ago`
                        : isToday
                        ? "Expires today"
                        : `${days}d left`}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* Finance modules */}
      {financeModules.length > 0 && (
        <section style={{ marginBottom: mylifeSpacing[10] }}>
          <div style={{ display: "flex", alignItems: "center", gap: mylifeSpacing[3], marginBottom: mylifeSpacing[4] }}>
            <div style={{ display: "flex", alignItems: "center", gap: mylifeSpacing[2] }}>
              <div
                className="hub-pulse"
                style={{
                  width: mylifeSpacing[2],
                  height: mylifeSpacing[2],
                  borderRadius: mylifeBorderRadius.full,
                  background: "var(--color-accent)",
                }}
              />
              <h2
                style={{
                  fontSize: "12px",
                  fontWeight: "bold",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "var(--color-accent)",
                }}
              >
                Finance
              </h2>
            </div>
            <div style={{ flex: 1, height: "1px", background: "var(--divider)" }} />
            <p style={{ fontSize: "12px", color: "var(--text-muted)" }}>These modules sync together</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3" style={{ gap: mylifeSpacing[4] }}>
            {financeModules.map((m) => (
              <ModuleCard key={m.id} module={m} />
            ))}
          </div>
        </section>
      )}

      {/* Lifestyle modules */}
      {lifestyleModules.length > 0 && (
        <section style={{ marginBottom: mylifeSpacing[10] }}>
          <div style={{ display: "flex", alignItems: "center", gap: mylifeSpacing[3], marginBottom: mylifeSpacing[4] }}>
            <h2
              style={{
                fontSize: "12px",
                fontWeight: "bold",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "var(--text-muted)",
              }}
            >
              Lifestyle
            </h2>
            <div style={{ flex: 1, height: "1px", background: "var(--divider)" }} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" style={{ gap: mylifeSpacing[4] }}>
            {lifestyleModules.map((m) => (
              <ModuleCard key={m.id} module={m} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
