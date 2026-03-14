"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { FINANCE_MODULES, LIFESTYLE_MODULES } from "@/lib/modules";
import { useTheme } from "@/components/ThemeProvider";
import type { Module } from "@/types";
import clsx from "clsx";

function NavItem({ module }: { module: Module }) {
  const pathname = usePathname();
  const isActive = pathname.startsWith(module.href);
  const isComingSoon = module.status === "coming-soon";

  return (
    <Link
      href={isComingSoon ? "#" : module.href}
      className={clsx(
        "group flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150",
        isActive
          ? "bg-sidebar-hover text-white"
          : "text-sidebar-text hover:text-white hover:bg-sidebar-hover",
        isComingSoon && "cursor-default opacity-60"
      )}
    >
      <span className="text-base leading-none">{module.icon}</span>
      <span className="flex-1 font-medium">{module.label}</span>
      {isActive && (
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: module.color }} />
      )}
      {isComingSoon && (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-sidebar-hover text-sidebar-text">
          soon
        </span>
      )}
    </Link>
  );
}

function SunIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4"/>
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>
    </svg>
  );
}

export default function Sidebar({ userEmail }: { userEmail: string }) {
  const router = useRouter();
  const supabase = createClient();
  const pathname = usePathname();
  const { theme, toggle } = useTheme();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const initials = userEmail?.slice(0, 2).toUpperCase() ?? "ML";

  return (
    <aside className="fixed left-0 top-0 h-full w-[240px] bg-sidebar flex flex-col border-r border-sidebar-border z-50">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-sidebar-border flex items-center justify-between">
        <Link href="/dashboard">
          <span className="font-display text-xl text-white tracking-tight">
            My<span className="text-accent italic">Life</span>
          </span>
        </Link>
        <button
          onClick={toggle}
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-sidebar-text hover:text-white hover:bg-sidebar-hover transition-all duration-150"
        >
          {theme === "dark" ? <SunIcon /> : <MoonIcon />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto sidebar-scroll px-3 py-4 flex flex-col gap-6">
        <div>
          <Link
            href="/dashboard"
            className={clsx(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150",
              pathname === "/dashboard"
                ? "bg-sidebar-hover text-white"
                : "text-sidebar-text hover:text-white hover:bg-sidebar-hover"
            )}
          >
            <span className="text-base">🏠</span>
            <span>Overview</span>
          </Link>
        </div>

        <div>
          <div className="flex items-center gap-2 px-3 mb-2">
            <div className="w-1.5 h-1.5 rounded-full bg-accent hub-pulse" />
            <p className="text-[10px] font-semibold tracking-widest text-accent uppercase">
              Finance Hub
            </p>
          </div>
          <div className="flex flex-col gap-0.5">
            {FINANCE_MODULES.map((m) => (<NavItem key={m.id} module={m} />))}
          </div>
        </div>

        <div>
          <p className="text-[10px] font-semibold tracking-widest text-sidebar-text uppercase px-3 mb-2">
            Lifestyle
          </p>
          <div className="flex flex-col gap-0.5">
            {LIFESTYLE_MODULES.map((m) => (<NavItem key={m.id} module={m} />))}
          </div>
        </div>

        <div className="px-3">
          <button className="w-full flex items-center gap-3 py-2.5 text-sm text-sidebar-text hover:text-white transition-colors group">
            <span className="w-6 h-6 rounded-md border border-dashed border-sidebar-border group-hover:border-sidebar-text flex items-center justify-center text-xs transition-colors">+</span>
            <span>Add module</span>
          </button>
        </div>
      </nav>

      <div className="border-t border-sidebar-border px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-accent-dim border border-accent/30 flex items-center justify-center text-xs font-semibold text-accent flex-shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-xs font-medium truncate">{userEmail}</p>
          </div>
          <button onClick={handleSignOut} title="Sign out" className="text-sidebar-text hover:text-white transition-colors ml-auto">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>
            </svg>
          </button>
        </div>
      </div>
    </aside>
  );
}
