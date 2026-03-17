"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { FINANCE_MODULES, LIFESTYLE_MODULES } from "@/lib/modules";
import { useTheme } from "@/components/ThemeProvider";
import clsx from "clsx";

/* ---------- ICONS ---------- */

const GearIcon = () => <span>⚙️</span>;
const DownloadIcon = () => <span>⬇️</span>;
const SignOutIcon = () => <span>🚪</span>;
const MenuIcon = () => <span>☰</span>;
const CloseIcon = () => <span>✕</span>;

/* ---------- HELPERS ---------- */

function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/* ---------- MAIN COMPONENT ---------- */

export default function Sidebar({
  userEmail,
  hiddenModules = [],
}: {
  userEmail: string;
  hiddenModules?: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();
  const { theme, toggle } = useTheme();

  const [mounted, setMounted] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [showBackup, setShowBackup] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const sidebarWidth = collapsed ? 64 : 240;

  /* ---------- INIT ---------- */

  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem("sidebar_collapsed") === "true";
    setCollapsed(stored);
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--sidebar-width",
      `${sidebarWidth}px`
    );
  }, [sidebarWidth]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  /* ---------- ACTIONS ---------- */

  function toggleCollapse() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("sidebar_collapsed", String(next));
  }

  async function handleSignOut() {
    setSigningOut(true);
    await supabase.auth.signOut();
    router.push("/login");
  }

  /* ---------- MODULES ---------- */

  const finance = FINANCE_MODULES.filter(
    (m) => !hiddenModules.includes(m.id)
  );
  const lifestyle = LIFESTYLE_MODULES.filter(
    (m) => !hiddenModules.includes(m.id)
  );

  const initials = userEmail?.slice(0, 2).toUpperCase() || "ML";

  /* ---------- NAV ITEM ---------- */

  function NavItem({ m }: { m: any }) {
    const active = isActivePath(pathname, m.href);
    const coming = m.status === "coming-soon";

    const base =
      "flex items-center gap-3 rounded-lg text-sm transition-all";

    const classes = clsx(
      base,
      collapsed ? "justify-center px-2 py-2.5" : "px-3 py-2.5",
      active
        ? "bg-sidebar-hover text-white"
        : "text-sidebar-text hover:text-white hover:bg-sidebar-hover",
      coming && "opacity-50 cursor-default"
    );

    const content = (
      <div className={classes}>
        <span>{m.icon}</span>
        {!collapsed && <span>{m.label}</span>}
      </div>
    );

    if (coming) return content;

    return (
      <Link href={m.href} onClick={() => setMobileOpen(false)}>
        {content}
      </Link>
    );
  }

  /* ---------- RENDER ---------- */

  return (
    <>
      {/* Mobile header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-sidebar border-b border-sidebar-border flex items-center justify-between px-4 z-40">
        <button onClick={() => setMobileOpen(true)}>
          <MenuIcon />
        </button>

        <span className="text-white font-semibold">MyLife</span>

        <button onClick={toggle}>
          {theme === "dark" ? "☀️" : "🌙"}
        </button>
      </div>

      {/* Overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={clsx(
          "fixed top-0 left-0 h-full bg-sidebar border-r border-sidebar-border z-50 transition-all duration-300",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
        style={{ width: sidebarWidth }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-sidebar-border">
          {!collapsed && <span className="text-white">MyLife</span>}

          <div className="flex gap-2">
            <button onClick={toggle}>
              {theme === "dark" ? "☀️" : "🌙"}
            </button>
            <button onClick={toggleCollapse}>
              {collapsed ? "➡️" : "⬅️"}
            </button>
          </div>
        </div>

        {/* Navigation */}
        <div className="p-2 flex flex-col gap-4 overflow-y-auto flex-1">
          <Link href="/dashboard" className="px-3 py-2">
            {!collapsed ? "🏠 Dashboard" : "🏠"}
          </Link>

          <div>
            {!collapsed && <p className="text-xs text-muted px-3">Finance</p>}
            {finance.map((m) => (
              <NavItem key={m.id} m={m} />
            ))}
          </div>

          <div>
            {!collapsed && <p className="text-xs text-muted px-3">Lifestyle</p>}
            {lifestyle.map((m) => (
              <NavItem key={m.id} m={m} />
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-sidebar-border px-2 py-3">
          {!collapsed ? (
            <div className="flex flex-col gap-2">
              <div className="px-3 py-2 text-sm text-white">{userEmail}</div>

              <Link href="/dashboard/settings" className="px-3 py-2">
                ⚙️ Settings
              </Link>

              <button
                onClick={() => setShowBackup(true)}
                className="px-3 py-2 text-left"
              >
                ⬇️ Export / Restore
              </button>

              <button
                onClick={handleSignOut}
                disabled={signingOut}
                className="px-3 py-2 text-left text-red-400"
              >
                🚪 Sign out
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2 items-center">
              <div className="text-accent">{initials}</div>

              <Link href="/dashboard/settings">⚙️</Link>

              <button onClick={() => setShowBackup(true)}>⬇️</button>

              <button onClick={handleSignOut} disabled={signingOut}>
                🚪
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
