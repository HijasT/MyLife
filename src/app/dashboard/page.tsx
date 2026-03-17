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

      <p className="font-semibold text-[var(--text-primary)] mb-1">
        {module.label}
      </p>
      <p className="text-sm text-[var(--text-muted)]">{module.description}</p>

      {!isComingSoon && (
        <div
          className="mt-4 h-0.5 w-8 rounded-full"
          style={{ background: module.color }}
        />
      )}
    </>
  );

  if (isComingSoon) {
    return (
      <div
        className={`${cardClass} cursor-default opacity-80`}
        aria-disabled="true"
      >
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
  const supabase = createClient();

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
  let todayPortfolio: PortfolioPurchase[] = [];
  let portfolioCurrentAed = 0;

  if (user) {
    const [calendarRes, portfolioRes, itemRes, statRes] = await Promise.all([
      supabase
        .from("calendar_events")
        .select("id,title,event_type,work_start,work_end,color")
        .eq("user_id", user.id)
        .eq("date", today)
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
    ]);

    todayEvents = (calendarRes.data ?? []) as CalEvent[];
    todayPortfolio = (portfolioRes.data ?? []) as PortfolioPurchase[];

    const items = (itemRes.data ?? []) as PortfolioItem[];
    const stats = (statRes.data ?? []) as PortfolioStatRow[];

    const statMap = new Map<string, number>();

    for (const row of stats) {
      const tx =
        row.transaction_type ??
        ((Number(row.units) || 0) < 0 || (Number(row.total_paid) || 0) < 0
          ? "sell"
          : "buy");

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
        <h1
          className="font-display text-3xl mb-1"
          style={{ color: "var(--text-primary)" }}
        >
          {greeting}, <span className="text-accent italic">{firstName}.</span>
        </h1>

        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          {dateLong} ·{" "}
          <span style={{ color: "var(--text-primary)" }}>{timeNow}</span>
        </p>

        <div
          className="mt-5 rounded-2xl border overflow-hidden"
          style={{
            background: "var(--card-bg)",
            borderColor: "var(--card-border)",
          }}
        >
          <div
            className="px-4 py-3 border-b"
            style={{
              borderColor: "var(--card-border)",
              background: "var(--main-bg2)",
            }}
          >
            <span
              className="text-xs font-bold tracking-widest uppercase"
              style={{ color: "var(--text-muted)" }}
            >
              Daily snapshot
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-0">
            <div
              className="p-4 border-b md:border-b-0 md:border-r"
              style={{ borderColor: "var(--card-border)" }}
            >
              <div
                className="text-[11px] font-bold tracking-widest uppercase mb-2"
                style={{ color: "var(--text-muted)" }}
              >
                Today&apos;s work
              </div>

              {workToday.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {workToday.map((ev) => (
                    <div key={ev.id}>
                      <div
                        className="text-sm font-semibold"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {ev.title.startsWith("Work:")
                          ? ev.title.replace("Work:", "")
                          : ev.title}
                      </div>

                      {ev.work_start && ev.work_end && (
                        <div
                          className="text-xs"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {fmt12(ev.work_start)} to {fmt12(ev.work_end)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm" style={{ color: "var(--text-muted)" }}>
                  No work logged today
                </div>
              )}
            </div>

            <div
              className="p-4 border-b md:border-b-0 md:border-r"
              style={{ borderColor: "var(--card-border)" }}
            >
              <div
                className="text-[11px] font-bold tracking-widest uppercase mb-2"
                style={{ color: "var(--text-muted)" }}
              >
                Events & portfolio
              </div>

              <div className="flex flex-col gap-2">
                {otherToday.slice(0, 2).map((ev) => (
                  <div
                    key={ev.id}
                    className="text-sm"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {ev.title}
                  </div>
                ))}

                {todayPortfolio.slice(0, 2).map((tx) => (
                  <div
                    key={tx.id}
                    className="text-sm"
                    style={{ color: "var(--text-primary)" }}
                  >
                    Portfolio:{" "}
                    {tx.transaction_type === "sell" ? "Sold" : "Purchased"}{" "}
                    {tx.portfolio_items?.symbol ?? "Asset"}
                  </div>
                ))}

                {otherToday.length === 0 && todayPortfolio.length === 0 && (
                  <div className="text-sm" style={{ color: "var(--text-muted)" }}>
                    Quiet day so far
                  </div>
                )}
              </div>
            </div>

            <div className="p-4">
              <div
                className="text-[11px] font-bold tracking-widest uppercase mb-2"
                style={{ color: "var(--text-muted)" }}
              >
                Portfolio snapshot
              </div>

              <div
                className="text-2xl font-bold"
                style={{ color: "var(--text-primary)" }}
              >
                AED{" "}
                {portfolioCurrentAed.toLocaleString("en-AE", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </div>

              <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                Current portfolio value
              </div>
            </div>
          </div>
        </div>
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
