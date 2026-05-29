'use client';

import { MODULES } from "@/lib/modules";
import Link from "next/link";
import { mylifeBorderRadius, mylifeSpacing } from "@/lib/mylife-design-tokens";
import { createClient } from "@/utils/supabase/client";
import { useEffect, useState } from "react";

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

  const headerStyle = {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: mylifeSpacing[4],
  };

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

  const titleStyle = {
    fontWeight: 600,
    color: "var(--text-primary)",
    marginBottom: mylifeSpacing[1],
    fontSize: "16px",
  };

  const accentBarStyle = {
    marginTop: mylifeSpacing[4],
    height: "2px",
    width: mylifeSpacing[8],
    borderRadius: mylifeBorderRadius.full,
    background: module.color || "var(--color-accent)",
  };

  const content = (
    <>
      <div style={headerStyle}>
        <span style={{ fontSize: "1.5rem" }}>{module.icon}</span>
        {isComingSoon && <span style={badgeStyle}>Coming soon</span>}
      </div>
      <p style={titleStyle}>{module.label}</p>
      <p style={{ fontSize: "14px", color: "var(--text-muted)", lineHeight: "1.5" }}>
        {module.description}
      </p>
      {!isComingSoon && <div style={accentBarStyle} />}
    </>
  );

  if (isComingSoon) {
    return (
      <div style={cardStyle} aria-disabled="true">
        {content}
      </div>
    );
  }

  return (
    <Link href={module.href} style={cardStyle}>
      {content}
    </Link>
  );
}

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

type ExpiryItem = {
  id: string;
  name: string;
  expiry_date: string;
  category: string;
  location?: string;
};

export default function DashboardPage() {
  const [displayName, setDisplayName] = useState("");
  const [hiddenModules, setHiddenModules] = useState<string[]>([]);
  const [timezone, setTimezone] = useState("UTC");
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [dubaiTemp, setDubaiTemp] = useState<number | null>(null);
  const [weatherCode, setWeatherCode] = useState<number | null>(null);
  const [todayEvents, setTodayEvents] = useState<CalEvent[]>([]);
  const [tomorrowEvents, setTomorrowEvents] = useState<CalEvent[]>([]);
  const [todayPortfolio, setTodayPortfolio] = useState<PortfolioPurchase[]>([]);
  const [portfolioCurrentAed, setPortfolioCurrentAed] = useState(0);
  const [expiringItems, setExpiringItems] = useState<ExpiryItem[]>([]);

  useEffect(() => {
    const initializeData = async () => {
      const supabase = createClient();

      // Get user
      const { data: { user: authUser } } = await supabase.auth.getUser();
      setUser(authUser);

      if (authUser) {
        // Get profile
        const { data: profile } = await supabase
          .from("profiles")
          .select("display_name, hidden_modules, timezone")
          .eq("id", authUser.id)
          .single();

        setDisplayName(profile?.display_name ?? "");
        setHiddenModules(profile?.hidden_modules ?? []);
        setTimezone(profile?.timezone ?? "UTC");
      }

      // Get weather
      try {
        const wRes = await fetch(
          "https://api.open-meteo.com/v1/forecast?latitude=25.2048&longitude=55.2708&current=temperature_2m,weather_code",
          { next: { revalidate: 1800 } }
        );
        const wData = await wRes.json();
        setDubaiTemp(wData?.current?.temperature_2m ?? null);
        setWeatherCode(wData?.current?.weather_code ?? null);
      } catch {
        // Skip weather errors
      }

      // Get calendar and portfolio data if user exists
      if (authUser) {
        const now = new Date();
        const today = new Intl.DateTimeFormat("en-CA", {
          timeZone: timezone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(now).replace(/\//g, "-");

        const tomorrowDate = new Date(now);
        tomorrowDate.setDate(tomorrowDate.getDate() + 1);
        const tomorrow = new Intl.DateTimeFormat("en-CA", {
          timeZone: timezone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(tomorrowDate).replace(/\//g, "-");

        const weekFromNow = new Date(now);
        weekFromNow.setDate(weekFromNow.getDate() + 7);
        const weekStr = weekFromNow.toLocaleDateString("en-CA", { timeZone: timezone });

        const [calendarRes, portfolioRes, itemRes, statRes, expiryRes] = await Promise.all([
          supabase
            .from("calendar_events")
            .select("id,title,event_type,work_start,work_end,color,date")
            .eq("user_id", authUser.id)
            .in("date", [today, tomorrow])
            .order("work_start", { ascending: true }),
          supabase
            .from("portfolio_purchases")
            .select("id,purchased_at,transaction_type,portfolio_items(symbol,name)")
            .eq("user_id", authUser.id)
            .gte("purchased_at", `${today}T00:00:00`)
            .lte("purchased_at", `${today}T23:59:59`)
            .order("purchased_at", { ascending: false }),
          supabase
            .from("portfolio_items")
            .select("id,current_price")
            .eq("user_id", authUser.id),
          supabase
            .from("portfolio_purchases")
            .select("item_id,units,total_paid,currency,transaction_type")
            .eq("user_id", authUser.id),
          supabase
            .from("inventory_items")
            .select("id,name,expiry_date,category,location")
            .eq("user_id", authUser.id)
            .eq("is_finished", false)
            .not("expiry_date", "is", null)
            .lte("expiry_date", weekStr)
            .order("expiry_date", { ascending: true }),
        ]);

        const allCalEvents = (calendarRes.data ?? []) as CalEvent[];
        setTodayEvents(allCalEvents.filter(e => e.date === today));
        setTomorrowEvents(allCalEvents.filter(e => e.date === tomorrow));
        setTodayPortfolio((portfolioRes.data ?? []) as PortfolioPurchase[]);
        setExpiringItems((expiryRes.data ?? []) as ExpiryItem[]);

        const items = (itemRes.data ?? []) as PortfolioItem[];
        const stats = (statRes.data ?? []) as PortfolioStatRow[];

        const statMap = new Map<string, number>();
        for (const row of stats) {
          const tx =
            row.transaction_type ??
            (((Number(row.units) || 0) < 0 || (Number(row.total_paid) || 0) < 0) ? "sell" : "buy");
          const absUnits = Math.abs(Number(row.units) || 0);
          const existing = statMap.get(row.item_id) ?? 0;
          statMap.set(row.item_id, tx === "buy" ? existing + absUnits : existing - absUnits);
        }

        let totalAed = 0;
        for (const item of items) {
          const units = Math.max(0, statMap.get(item.id) ?? 0);
          totalAed += (item.current_price ?? 0) * units;
        }
        setPortfolioCurrentAed(totalAed);
      }

      setLoading(false);
    };

    initializeData();
  }, [timezone]);

  const now = new Date();
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      hour12: false,
    }).format(now)
  );

  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const firstName = displayName || user?.email?.split("@")[0] || "there";

  const dateLong = now.toLocaleDateString("en-AE", {
    timeZone: timezone,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const timeNow = now.toLocaleTimeString("en-AE", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  const weatherEmoji = (code: number | null, hr: number): string => {
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
  };

  const fmt12 = (t?: string) => {
    if (!t) return "";
    const [h, m] = t.split(":").map(Number);
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 || 12;
    return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
  };

  const workToday = todayEvents.filter((e) => e.event_type === "work");
  const otherToday = todayEvents.filter((e) => e.event_type !== "work");

  const visibleModules = MODULES.filter((m) => !hiddenModules.includes(m.id));
  const financeModules = visibleModules.filter((m) => m.group === "finance");
  const lifestyleModules = visibleModules.filter((m) => m.group === "lifestyle");

  const containerStyle = {
    padding: `${mylifeSpacing[6]}`,
    maxWidth: "80rem",
    marginLeft: "auto",
    marginRight: "auto",
  };

  const headerSectionStyle = {
    marginBottom: mylifeSpacing[10],
  };

  const greetingStyle = {
    fontFamily: "var(--font-display)",
    fontSize: "1.875rem",
    marginBottom: mylifeSpacing[1],
    color: "var(--text-primary)",
  };

  const dateTimeStyle = {
    fontSize: "0.875rem",
    color: "var(--text-muted)",
  };

  const dateHighlightStyle = {
    color: "var(--text-primary)",
  };

  const dateWeatherStyle = {
    color: "var(--text-muted)",
  };

  const snapshotContainerStyle = {
    marginTop: mylifeSpacing[5],
    borderRadius: mylifeBorderRadius.xl,
    border: "1px solid var(--card-border)",
    overflow: "hidden",
    background: "var(--card-bg)",
  };

  const snapshotHeaderStyle = {
    paddingLeft: mylifeSpacing[4],
    paddingRight: mylifeSpacing[4],
    paddingTop: mylifeSpacing[3],
    paddingBottom: mylifeSpacing[3],
    borderBottom: "1px solid var(--card-border)",
    background: "var(--main-bg2)",
  };

  const snapshotHeaderTextStyle = {
    fontSize: "11px",
    fontWeight: "bold",
    letterSpacing: "0.1em",
    textTransform: "uppercase" as const,
    color: "var(--text-muted)",
  };

  const gridContainerStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
    gap: "0px",
  };

  const gridItemStyle = {
    padding: mylifeSpacing[4],
    borderBottom: "1px solid var(--card-border)",
  };

  const gridItemLastRowStyle = {
    ...gridItemStyle,
    borderBottom: "none",
  };

  const itemLabelStyle = {
    fontSize: "11px",
    fontWeight: "bold",
    letterSpacing: "0.1em",
    textTransform: "uppercase" as const,
    marginBottom: mylifeSpacing[2],
    color: "var(--text-muted)",
  };

  const eventListStyle = {
    display: "flex",
    flexDirection: "column" as const,
    gap: mylifeSpacing[2],
  };

  const eventItemStyle = {
    fontSize: "14px",
    color: "var(--text-primary)",
  };

  const eventTimeStyle = {
    fontSize: "12px",
    color: "var(--text-muted)",
  };

  const portfolioValueStyle = {
    fontSize: "1.5rem",
    fontWeight: "bold",
    color: "var(--text-primary)",
  };

  const expiringAlertStyle = {
    marginBottom: mylifeSpacing[8],
  };

  const expiringContainerStyle = {
    borderRadius: mylifeBorderRadius.xl,
    border: "1px solid var(--card-border)",
    overflow: "hidden",
    background: "var(--card-bg)",
  };

  const expiringHeaderStyle = {
    paddingLeft: mylifeSpacing[4],
    paddingRight: mylifeSpacing[4],
    paddingTop: mylifeSpacing[3],
    paddingBottom: mylifeSpacing[3],
    borderBottom: "1px solid var(--card-border)",
    display: "flex",
    alignItems: "center",
    gap: mylifeSpacing[2],
  };

  const expiringHeaderIconStyle = {
    fontSize: "1.25rem",
  };

  const expiringHeaderTextStyle = {
    fontSize: "11px",
    fontWeight: "bold",
    letterSpacing: "0.1em",
    textTransform: "uppercase" as const,
    color: "var(--text-muted)",
  };

  const expiringItemStyle = {
    paddingLeft: mylifeSpacing[4],
    paddingRight: mylifeSpacing[4],
    paddingTop: mylifeSpacing[3],
    paddingBottom: mylifeSpacing[3],
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottom: "1px solid var(--card-border)",
  };

  const expiringItemLastStyle = {
    ...expiringItemStyle,
    borderBottom: "none",
  };

  const expiringItemNameStyle = {
    fontSize: "14px",
    fontWeight: "500",
    color: "var(--text-primary)",
  };

  const expiringItemMetaStyle = {
    fontSize: "12px",
    color: "var(--text-muted)",
  };

  const expiringItemStatusStyle = {
    fontSize: "12px",
    fontWeight: "bold",
    flexShrink: 0,
  };

  const moduleSectionStyle = {
    marginBottom: mylifeSpacing[10],
  };

  const moduleSectionHeaderStyle = {
    display: "flex",
    alignItems: "center",
    gap: mylifeSpacing[3],
    marginBottom: mylifeSpacing[4],
  };

  const moduleSectionTitleStyle = {
    fontSize: "11px",
    fontWeight: "bold",
    letterSpacing: "0.1em",
    textTransform: "uppercase" as const,
    color: "var(--color-accent)",
  };

  const moduleSectionLineStyle = {
    flex: 1,
    height: "1px",
    background: "var(--divider)",
  };

  const moduleSectionDescStyle = {
    fontSize: "12px",
    color: "var(--text-muted)",
  };

  const moduleGridStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: mylifeSpacing[4],
  };

  if (loading) {
    return (
      <div style={containerStyle}>
        <div style={{ color: "var(--text-muted)", textAlign: "center", paddingTop: mylifeSpacing[8] }}>
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      {/* Header Section */}
      <div style={headerSectionStyle}>
        <h1 style={greetingStyle}>
          {greeting}, <span style={{ color: "var(--color-accent)", fontStyle: "italic" }}>{firstName}.</span>
        </h1>
        <p style={dateTimeStyle}>
          {dateLong} · <span style={dateHighlightStyle}>{timeNow}</span>
          {dubaiTemp !== null && (
            <span style={dateWeatherStyle}>
              {" "}· {weatherEmoji(weatherCode, hour)}{" "}
              <span style={dateHighlightStyle}>{dubaiTemp.toFixed(0)}°C</span>
            </span>
          )}
        </p>

        {/* Daily Snapshot */}
        <div style={snapshotContainerStyle}>
          <div style={snapshotHeaderStyle}>
            <span style={snapshotHeaderTextStyle}>Daily snapshot</span>
          </div>

          <div style={gridContainerStyle}>
            {/* Today's Work */}
            <div style={gridItemStyle}>
              <div style={itemLabelStyle}>Today's work</div>
              {workToday.length > 0 ? (
                <div style={eventListStyle}>
                  {workToday.map((ev) => (
                    <div key={ev.id}>
                      <div style={eventItemStyle}>
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
                <div style={{ fontSize: "14px", color: "var(--text-muted)" }}>No work logged</div>
              )}

              {tomorrowEvents.filter((e) => e.event_type === "work").length > 0 && (
                <>
                  <div style={{ ...itemLabelStyle, marginTop: mylifeSpacing[4] }}>Tomorrow's work</div>
                  <div style={eventListStyle}>
                    {tomorrowEvents
                      .filter((e) => e.event_type === "work")
                      .map((ev) => (
                        <div key={ev.id}>
                          <div style={eventItemStyle}>
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

            {/* Events & Portfolio */}
            <div style={gridItemStyle}>
              <div style={itemLabelStyle}>Events & portfolio</div>
              <div style={eventListStyle}>
                {otherToday.slice(0, 2).map((ev) => (
                  <div key={ev.id} style={eventItemStyle}>
                    {ev.title}
                  </div>
                ))}
                {todayPortfolio.slice(0, 2).map((tx) => (
                  <div key={tx.id} style={eventItemStyle}>
                    Portfolio: {tx.transaction_type === "sell" ? "Sold" : "Purchased"}{" "}
                    {tx.portfolio_items?.symbol ?? "Asset"}
                  </div>
                ))}
                {otherToday.length === 0 && todayPortfolio.length === 0 && (
                  <div style={{ fontSize: "14px", color: "var(--text-muted)" }}>Quiet day</div>
                )}
              </div>

              {tomorrowEvents.filter((e) => e.event_type !== "work").length > 0 && (
                <>
                  <div style={{ ...itemLabelStyle, marginTop: mylifeSpacing[4] }}>Tomorrow</div>
                  <div style={eventListStyle}>
                    {tomorrowEvents
                      .filter((e) => e.event_type !== "work")
                      .slice(0, 2)
                      .map((ev) => (
                        <div key={ev.id} style={eventItemStyle}>
                          {ev.title}
                        </div>
                      ))}
                  </div>
                </>
              )}
            </div>

            {/* Portfolio Snapshot */}
            <div style={gridItemLastRowStyle}>
              <div style={itemLabelStyle}>Portfolio snapshot</div>
              <div style={portfolioValueStyle}>
                AED {portfolioCurrentAed.toLocaleString("en-AE", { minimumFractionDigits: 2 })}
              </div>
              <div style={{ fontSize: "12px", marginTop: mylifeSpacing[1], color: "var(--text-muted)" }}>
                Current value
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Expiring Items Alert */}
      {expiringItems.length > 0 && (
        <section style={expiringAlertStyle}>
          <div style={expiringContainerStyle}>
            <div style={expiringHeaderStyle}>
              <span style={expiringHeaderIconStyle}>⏰</span>
              <span style={expiringHeaderTextStyle}>
                Expiring within 7 days — {expiringItems.length} item{expiringItems.length !== 1 ? "s" : ""}
              </span>
            </div>
            <div>
              {expiringItems.map((item, idx) => {
                const days = Math.ceil((new Date(item.expiry_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                const isExpired = days < 0;
                const isToday = days === 0;
                const isLast = idx === expiringItems.length - 1;

                return (
                  <div key={item.id} style={isLast ? expiringItemLastStyle : expiringItemStyle}>
                    <div>
                      <div style={expiringItemNameStyle}>{item.name}</div>
                      <div style={expiringItemMetaStyle}>
                        {item.category}
                        {item.location ? ` · ${item.location}` : ""}
                      </div>
                    </div>
                    <div
                      style={{
                        ...expiringItemStatusStyle,
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

      {/* Finance Modules */}
      {financeModules.length > 0 && (
        <section style={moduleSectionStyle}>
          <div style={moduleSectionHeaderStyle}>
            <div style={{ display: "flex", alignItems: "center", gap: mylifeSpacing[2] }}>
              <div
                style={{
                  width: mylifeSpacing[2],
                  height: mylifeSpacing[2],
                  borderRadius: mylifeBorderRadius.full,
                  background: "var(--color-accent)",
                }}
              />
              <h2 style={moduleSectionTitleStyle}>Finance</h2>
            </div>
            <div style={moduleSectionLineStyle} />
            <p style={moduleSectionDescStyle}>These modules support your financial goals</p>
          </div>
          <div style={moduleGridStyle}>
            {financeModules.map((m) => (
              <ModuleCard key={m.id} module={m} />
            ))}
          </div>
        </section>
      )}

      {/* Lifestyle Modules */}
      {lifestyleModules.length > 0 && (
        <section style={moduleSectionStyle}>
          <div style={moduleSectionHeaderStyle}>
            <h2 style={moduleSectionTitleStyle}>Lifestyle</h2>
            <div style={moduleSectionLineStyle} />
          </div>
          <div style={moduleGridStyle}>
            {lifestyleModules.map((m) => (
              <ModuleCard key={m.id} module={m} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
