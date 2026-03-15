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
  if (user) {
    const { data: profile } = await supabase.from("profiles").select("display_name, hidden_modules").eq("id", user.id).single();
    displayName = profile?.display_name ?? "";
    hiddenModules = profile?.hidden_modules ?? [];
  }

  const firstName = displayName || user?.email?.split("@")[0] || "there";
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const visibleModules = MODULES.filter(m => !hiddenModules.includes(m.id));
  const financeModules = visibleModules.filter(m => m.group === "finance");
  const lifestyleModules = visibleModules.filter(m => m.group === "lifestyle");

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-10">
        <h1 className="font-display text-3xl mb-1" style={{ color:"var(--text-primary)" }}>
          {greeting}, <span className="text-accent italic">{firstName}.</span>
        </h1>
        <p className="text-sm" style={{ color:"var(--text-muted)" }}>
          {new Date().toLocaleDateString("en-AE", { weekday:"long", day:"numeric", month:"long", year:"numeric" })}
        </p>
      </div>

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
