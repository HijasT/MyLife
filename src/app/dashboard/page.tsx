import { createClient } from "@/lib/supabase/server";
import { FINANCE_MODULES, LIFESTYLE_MODULES } from "@/lib/modules";
import Link from "next/link";

function ModuleCard({ module }: { module: (typeof FINANCE_MODULES)[0] }) {
  const isComingSoon = module.status === "coming-soon";
  return (
    <Link
      href={isComingSoon ? "#" : module.href}
      className={`module-card block rounded-2xl p-6 border transition-colors
        bg-[var(--card-bg)] border-[var(--card-border)]
        ${isComingSoon ? "cursor-default" : "cursor-pointer"}`}
    >
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
    </Link>
  );
}

export default async function DashboardPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const firstName =
    user?.user_metadata?.full_name?.split(" ")[0] ??
    user?.email?.split("@")[0] ??
    "there";

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-10">
        <h1 className="font-display text-3xl mb-1" style={{ color: "var(--text-primary)" }}>
          {greeting},{" "}
          <span className="text-accent italic">{firstName}.</span>
        </h1>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          {new Date().toLocaleDateString("en-AE", {
            weekday: "long", day: "numeric", month: "long", year: "numeric",
          })}
        </p>
      </div>

      {/* Finance Hub section */}
      <section className="mb-10">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-accent hub-pulse" />
            <h2 className="text-xs font-bold tracking-widest uppercase text-accent">Finance Hub</h2>
          </div>
          <div className="flex-1 h-px" style={{ background: "var(--divider)" }} />
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>These modules share a financial ledger</p>
        </div>

        {/* Net worth card */}
        <div className="bg-sidebar rounded-2xl p-6 mb-4 flex items-center justify-between overflow-hidden relative">
          <div className="absolute right-0 top-0 bottom-0 w-48 opacity-5">
            <div className="absolute inset-0 bg-gradient-to-l from-accent" />
          </div>
          <div className="relative z-10">
            <p className="text-sidebar-text text-xs uppercase tracking-widest font-semibold mb-2">Net Worth</p>
            <p className="font-display text-3xl text-white mb-1">—</p>
            <p className="text-sidebar-text text-xs">Add your Budget, Expenses & Portfolio to see your net worth</p>
          </div>
          <div className="relative z-10 flex gap-2">
            {FINANCE_MODULES.map((m) => (
              <div key={m.id} className="w-10 h-10 rounded-xl bg-sidebar-hover flex items-center justify-center text-lg">
                {m.icon}
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {FINANCE_MODULES.map((m) => (<ModuleCard key={m.id} module={m} />))}
        </div>
      </section>

      {/* Lifestyle section */}
      <section className="mb-10">
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-xs font-bold tracking-widest uppercase" style={{ color: "var(--text-muted)" }}>Lifestyle</h2>
          <div className="flex-1 h-px" style={{ background: "var(--divider)" }} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {LIFESTYLE_MODULES.map((m) => (<ModuleCard key={m.id} module={m} />))}
          <div className="module-card rounded-2xl p-6 border border-dashed flex flex-col items-center justify-center text-center cursor-pointer group hover:border-accent/40 transition-colors"
            style={{ background: "var(--card-bg)", borderColor: "var(--card-border)" }}>
            <div className="w-10 h-10 rounded-xl border-2 border-dashed border-[var(--card-border)] group-hover:border-accent/40 flex items-center justify-center text-[var(--text-muted)] group-hover:text-accent/60 text-xl mb-3 transition-colors">+</div>
            <p className="text-sm font-medium text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]">Add module</p>
            <p className="text-xs text-[var(--text-muted)] mt-1">Coming in future phases</p>
          </div>
        </div>
      </section>

      {/* Build progress */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-xs font-bold tracking-widest uppercase" style={{ color: "var(--text-muted)" }}>Build progress</h2>
          <div className="flex-1 h-px" style={{ background: "var(--divider)" }} />
        </div>
        <div className="rounded-2xl border overflow-hidden" style={{ background: "var(--card-bg)", borderColor: "var(--card-border)" }}>
          {[
            { label: "App shell & auth", phase: 1, done: true },
            { label: "Expense Tracker", phase: 2, done: false },
            { label: "Budget", phase: 3, done: false },
            { label: "Portfolio", phase: 4, done: false },
            { label: "Perfumes & Expiry", phase: 5, done: false },
          ].map((item, i) => (
            <div key={item.label}
              className={`flex items-center gap-4 px-6 py-4 ${i < 4 ? "border-b" : ""}`}
              style={{ borderColor: "var(--divider)" }}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                item.done ? "bg-accent text-white" : "text-[var(--text-muted)]"
              }`} style={!item.done ? { background: "var(--main-bg2)" } : {}}>
                {item.done ? "✓" : item.phase}
              </div>
              <span className={`text-sm flex-1 ${item.done ? "font-medium" : ""}`}
                style={{ color: item.done ? "var(--text-primary)" : "var(--text-muted)" }}>
                {item.label}
              </span>
              {item.done && (
                <span className="text-[10px] font-semibold text-accent uppercase tracking-widest">Done</span>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
