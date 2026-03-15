"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { FINANCE_MODULES, LIFESTYLE_MODULES, MODULES } from "@/lib/modules";
import { useTheme } from "@/components/ThemeProvider";
import { useSyncStatus } from "@/hooks/useSyncStatus";
import type { Module } from "@/types";
import clsx from "clsx";

function NavItem({ module, onNav }: { module: Module; onNav: () => void }) {
  const pathname = usePathname();
  const isActive = pathname.startsWith(module.href);
  const isComingSoon = module.status === "coming-soon";
  return (
    <Link href={isComingSoon ? "#" : module.href} onClick={isComingSoon ? undefined : onNav}
      className={clsx("group flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150",
        isActive ? "bg-sidebar-hover text-white" : "text-sidebar-text hover:text-white hover:bg-sidebar-hover",
        isComingSoon && "cursor-default opacity-60")}>
      <span className="text-base leading-none">{module.icon}</span>
      <span className="flex-1 font-medium">{module.label}</span>
      {isActive && <span className="w-1.5 h-1.5 rounded-full" style={{ background: module.color }} />}
      {isComingSoon && <span className="text-[10px] px-1.5 py-0.5 rounded bg-sidebar-hover text-sidebar-text">soon</span>}
    </Link>
  );
}

const SunIcon = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>;
const MoonIcon = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>;
const MenuIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>;
const CloseIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
const GearIcon = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>;
const DownloadIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>;

function SyncBadge() {
  const { isOnline, lastSyncStr } = useSyncStatus();
  return (
    <div className="mx-3 mb-2 px-3 py-2 rounded-lg border border-sidebar-border bg-sidebar-hover">
      <div className="flex items-center gap-2 mb-0.5">
        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isOnline ? "bg-green-400" : "bg-amber-400"}`} />
        <span className="text-xs font-semibold" style={{ color: isOnline ? "#4ade80" : "#fbbf24" }}>{isOnline ? "Online" : "Offline"}</span>
      </div>
      <span className="text-sidebar-text" style={{ fontSize: 10 }}>Synced: {lastSyncStr}</span>
    </div>
  );
}

function DownloadModal({ onClose }: { onClose: () => void }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [downloading, setDownloading] = useState(false);
  const supabase = createClient();
  const toggle = (id: string) => setSelected(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

  async function doDownload() {
    if (!selected.length) return;
    setDownloading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const parts: string[] = [];
      for (const mod of selected) {
        if (mod === "perfumes") {
          const { data } = await supabase.from("perfumes").select("brand,model,status,rating_stars,notes_tags,weather_tags,longevity,sillage,value_rating,clone_similar,notes_text").eq("user_id", user.id);
          parts.push(`\n=== Aromatica ===\nBrand,Model,Status,Rating,Notes,Weather,Longevity,Sillage,Value,Clone,Notes Text`);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (data??[]).forEach((r:any) => parts.push(`"${r.brand}","${r.model}","${r.status}",${r.rating_stars},"${(r.notes_tags??[]).join('|')}","${(r.weather_tags??[]).join('|')}","${r.longevity}","${r.sillage}","${r.value_rating}","${r.clone_similar}","${r.notes_text??''}"`));
        }
        if (mod === "budget") {
          const [items, entries] = await Promise.all([
            supabase.from("due_items").select("name,group_name,due_day,default_currency,default_amount,is_fixed").eq("user_id", user.id),
            supabase.from("due_entries").select("month,due_item_id,amount,currency,status,paid_at,note").eq("user_id", user.id).order("month"),
          ]);
          parts.push(`\n=== Due Tracker - Items ===\nName,Group,Due Day,Currency,Default Amount,Fixed`);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (items.data??[]).forEach((r:any) => parts.push(`"${r.name}","${r.group_name}",${r.due_day},"${r.default_currency}",${r.default_amount},${r.is_fixed}`));
          parts.push(`\n=== Due Tracker - Entries ===\nMonth,Item,Amount,Currency,Status,Paid At,Note`);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (entries.data??[]).forEach((r:any) => parts.push(`"${r.month}","${r.due_item_id}",${r.amount},"${r.currency}","${r.status}","${r.paid_at??''}","${r.note??''}"`));
        }
        if (mod === "portfolio") {
          const [items, purs] = await Promise.all([
            supabase.from("portfolio_items").select("symbol,name,asset_type,unit_label,main_currency,current_price").eq("user_id", user.id),
            supabase.from("portfolio_purchases").select("purchased_at,unit_price,units,total_paid,currency,source").eq("user_id", user.id).order("purchased_at"),
          ]);
          parts.push(`\n=== Portfolio - Assets ===\nSymbol,Name,Type,Unit,Currency,Current Price`);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (items.data??[]).forEach((r:any) => parts.push(`"${r.symbol}","${r.name}","${r.asset_type}","${r.unit_label}","${r.main_currency}",${r.current_price??''}`));
          parts.push(`\n=== Portfolio - Purchases ===\nDate,Unit Price,Units,Total Paid,Currency,Source`);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (purs.data??[]).forEach((r:any) => parts.push(`"${r.purchased_at}",${r.unit_price},${r.units},${r.total_paid},"${r.currency}","${r.source??''}"`));
        }
        if (mod === "calendar") {
          const { data } = await supabase.from("calendar_events").select("date,title,event_type,work_start,work_end,notes").eq("user_id", user.id).order("date");
          parts.push(`\n=== Calendar ===\nDate,Title,Type,Start,End,Notes`);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (data??[]).forEach((r:any) => parts.push(`"${r.date}","${r.title}","${r.event_type}","${r.work_start??''}","${r.work_end??''}","${r.notes??''}"`));
        }
      }
      const blob = new Blob([parts.join("\n")], { type:"text/csv;charset=utf-8" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `mylife-${new Date().toISOString().slice(0,10)}.csv`; document.body.appendChild(a); a.click(); a.remove();
    } finally { setDownloading(false); onClose(); }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-sidebar border border-sidebar-border rounded-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-sidebar-border flex items-center justify-between">
          <div className="text-white font-semibold text-sm">Export data</div>
          <button onClick={onClose} className="text-sidebar-text hover:text-white text-lg">✕</button>
        </div>
        <div className="px-5 py-4">
          <p className="text-sidebar-text text-xs mb-4">Select modules to export as CSV</p>
          <div className="flex flex-col gap-2">
            {MODULES.filter(m => m.status === "active").map(m => (
              <label key={m.id} className="flex items-center gap-3 cursor-pointer group">
                <input type="checkbox" checked={selected.includes(m.id)} onChange={() => toggle(m.id)} className="w-4 h-4 accent-amber-500" />
                <span className="text-sm text-sidebar-text group-hover:text-white transition-colors">{m.icon} {m.label}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="px-5 pb-4 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-medium text-sidebar-text border border-sidebar-border hover:text-white transition-colors">Cancel</button>
          <button onClick={doDownload} disabled={!selected.length || downloading} className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-accent text-white hover:bg-amber-500 transition-colors disabled:opacity-50">
            {downloading ? "Exporting…" : `Export (${selected.length})`}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Sidebar({ userEmail }: { userEmail: string }) {
  const router = useRouter();
  const supabase = createClient();
  const pathname = usePathname();
  const { theme, toggle } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [showDownload, setShowDownload] = useState(false);

  useEffect(() => { setIsOpen(false); }, [pathname]);
  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  const handleSignOut = async () => { await supabase.auth.signOut(); router.push("/login"); };
  const initials = userEmail?.slice(0, 2).toUpperCase() ?? "ML";
  const close = () => setIsOpen(false);

  return (
    <>
      {/* Mobile top bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-sidebar border-b border-sidebar-border flex items-center justify-between px-4 z-40">
        <button onClick={() => setIsOpen(true)} className="w-9 h-9 rounded-lg flex items-center justify-center text-sidebar-text hover:text-white hover:bg-sidebar-hover transition-all" aria-label="Open menu">
          <MenuIcon />
        </button>
        <Link href="/dashboard" className="flex items-center gap-2">
          <img src="/logo.png" alt="MyLife" className="h-7 w-7 object-contain rounded-lg" />
          <span className="font-display text-xl text-white tracking-tight">My<span className="text-accent italic">Life</span></span>
        </Link>
        <button onClick={toggle} className="w-9 h-9 rounded-lg flex items-center justify-center text-sidebar-text hover:text-white hover:bg-sidebar-hover transition-all">
          {theme === "dark" ? <SunIcon /> : <MoonIcon />}
        </button>
      </div>

      {/* Backdrop - mobile only */}
      {isOpen && <div className="lg:hidden fixed inset-0 bg-black/60 z-40 backdrop-blur-sm" onClick={close} />}

      {/* Sidebar panel */}
      <aside
        style={{ transform: isOpen ? "translateX(0)" : undefined }}
        className={clsx(
          "fixed left-0 top-0 h-full w-[240px] bg-sidebar flex flex-col border-r border-sidebar-border z-50",
          "transition-transform duration-300 ease-in-out",
          // On mobile: hidden by default, shown when isOpen
          // On desktop (lg+): always visible
          isOpen ? "translate-x-0" : "-translate-x-full",
          "lg:translate-x-0"
        )}
      >
        {/* Logo */}
        <div className="px-5 py-4 border-b border-sidebar-border flex items-center justify-between flex-shrink-0">
          <Link href="/dashboard" onClick={close} className="flex items-center gap-2.5">
            <img src="/logo.png" alt="MyLife" className="h-8 w-8 object-contain rounded-lg" />
            <span className="font-display text-xl text-white tracking-tight">My<span className="text-accent italic">Life</span></span>
          </Link>
          <div className="flex items-center gap-1">
            <button onClick={toggle} title={theme === "dark" ? "Light mode" : "Dark mode"}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-sidebar-text hover:text-white hover:bg-sidebar-hover transition-all">
              {theme === "dark" ? <SunIcon /> : <MoonIcon />}
            </button>
            <button onClick={close} aria-label="Close menu"
              className="lg:hidden w-8 h-8 rounded-lg flex items-center justify-center text-sidebar-text hover:text-white hover:bg-sidebar-hover transition-all">
              <CloseIcon />
            </button>
          </div>
        </div>

        {/* Nav — always shows ALL modules regardless of hidden settings */}
        <nav className="flex-1 overflow-y-auto sidebar-scroll px-3 py-4 flex flex-col gap-5">
          <div>
            <Link href="/dashboard" onClick={close}
              className={clsx("flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150",
                pathname === "/dashboard" ? "bg-sidebar-hover text-white" : "text-sidebar-text hover:text-white hover:bg-sidebar-hover")}>
              <span className="text-base">🏠</span><span>Dashboard</span>
            </Link>
          </div>
          <div>
            <div className="flex items-center gap-2 px-3 mb-2">
              <div className="w-1.5 h-1.5 rounded-full bg-accent hub-pulse" />
              <p className="text-[10px] font-semibold tracking-widest text-accent uppercase">Finance Hub</p>
            </div>
            <div className="flex flex-col gap-0.5">
              {FINANCE_MODULES.map(m => <NavItem key={m.id} module={m} onNav={close} />)}
            </div>
          </div>
          <div>
            <p className="text-[10px] font-semibold tracking-widest text-sidebar-text uppercase px-3 mb-2">Lifestyle</p>
            <div className="flex flex-col gap-0.5">
              {LIFESTYLE_MODULES.map(m => <NavItem key={m.id} module={m} onNav={close} />)}
            </div>
          </div>
        </nav>

        <SyncBadge />

        {/* Footer */}
        <div className="border-t border-sidebar-border px-3 py-3 flex-shrink-0">
          <button onClick={() => setShowDownload(true)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-sidebar-text hover:text-white hover:bg-sidebar-hover transition-all mb-1">
            <DownloadIcon /><span className="font-medium">Export data</span>
          </button>
          <Link href="/dashboard/settings" onClick={close}
            className={clsx("flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150 mb-1",
              pathname === "/dashboard/settings" ? "bg-sidebar-hover text-white" : "text-sidebar-text hover:text-white hover:bg-sidebar-hover")}>
            <GearIcon /><span className="font-medium">Settings</span>
          </Link>
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-8 h-8 rounded-full bg-accent-dim border border-accent/30 flex items-center justify-center text-xs font-semibold text-accent flex-shrink-0">{initials}</div>
            <div className="flex-1 min-w-0"><p className="text-white text-xs font-medium truncate">{userEmail}</p></div>
            <button onClick={handleSignOut} title="Sign out" className="text-sidebar-text hover:text-white transition-colors">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>
            </button>
          </div>
        </div>
      </aside>

      {showDownload && <DownloadModal onClose={() => setShowDownload(false)} />}
    </>
  );
}
