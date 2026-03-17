"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";
import { FINANCE_MODULES, LIFESTYLE_MODULES, MODULES } from "@/lib/modules";
import { useTheme } from "@/components/ThemeProvider";
import clsx from "clsx";

type BackupFormat = "json" | "csv";
type BackupMode = "export" | "restore";

type ModuleCountMap = Record<string, number | null>;
type BackupModuleKey =
  | "perfumes"
  | "budget"
  | "portfolio"
  | "calendar"
  | "biomarkers";

type JsonBackup = {
  app: "MyLife";
  version: string;
  exportedAt: string;
  userEmail?: string;
  profile?: {
    display_name?: string | null;
    timezone?: string | null;
    hidden_modules?: string[] | null;
  };
  modules: Partial<
    Record<
      BackupModuleKey,
      Record<string, unknown> & {
        portfolio_alerts?: unknown[];
      }
    >
  >;
};

function csvCell(value: unknown) {
  const s = String(value ?? "");
  return `"${s.replace(/"/g, `""`)}"`;
}

function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Tooltip({
  children,
  label,
  show,
}: {
  children: ReactNode;
  label: string;
  show: boolean;
}) {
  return (
    <div className="relative group flex">
      {children}
      {show && (
        <div className="pointer-events-none absolute left-full ml-2 top-1/2 -translate-y-1/2 z-[70] whitespace-nowrap rounded-lg border border-sidebar-border bg-sidebar px-2.5 py-1.5 text-xs text-white opacity-0 shadow-xl transition-opacity group-hover:opacity-100">
          {label}
        </div>
      )}
    </div>
  );
}

function NavItem({
  module,
  pathname,
  onNav,
  collapsed,
}: {
  module: (typeof MODULES)[0];
  pathname: string;
  onNav: () => void;
  collapsed: boolean;
}) {
  const isActive = isActivePath(pathname, module.href);
  const isComingSoon = module.status === "coming-soon";

  const content = (
    <div
      className={clsx(
        "group flex items-center gap-3 rounded-lg text-sm transition-all duration-150",
        collapsed ? "px-2 py-2.5 justify-center" : "px-3 py-2.5",
        isActive
          ? "bg-sidebar-hover text-white"
          : "text-sidebar-text hover:text-white hover:bg-sidebar-hover",
        isComingSoon && "cursor-default opacity-60"
      )}
      aria-disabled={isComingSoon}
    >
      <span className="text-base leading-none flex-shrink-0">{module.icon}</span>
      {!collapsed && <span className="flex-1 font-medium">{module.label}</span>}
      {!collapsed && isActive && (
        <span
          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{ background: module.color }}
        />
      )}
      {!collapsed && isComingSoon && (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-sidebar-hover text-sidebar-text">
          soon
        </span>
      )}
    </div>
  );

  if (isComingSoon) {
    return (
      <Tooltip label={module.label} show={collapsed}>
        <div role="button" tabIndex={-1}>
          {content}
        </div>
      </Tooltip>
    );
  }

  return (
    <Tooltip label={module.label} show={collapsed}>
      <Link
        href={module.href}
        onClick={onNav}
        aria-label={collapsed ? module.label : undefined}
      >
        {content}
      </Link>
    </Tooltip>
  );
}

const SunIcon = () => (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
  </svg>
);

const MoonIcon = () => (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
  </svg>
);

const MenuIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="3" y1="6" x2="21" y2="6" />
    <line x1="3" y1="12" x2="21" y2="12" />
    <line x1="3" y1="18" x2="21" y2="18" />
  </svg>
);

const CloseIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const GearIcon = () => (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="3" />
    <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
  </svg>
);

const DownloadIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

const ChevronDown = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const SignOutIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="M16 17l5-5-5-5" />
    <path d="M21 12H9" />
  </svg>
);

function SyncBadge({ collapsed }: { collapsed: boolean }) {
  const [isOnline, setIsOnline] = useState(true);
  const [lastSyncStr, setLastSyncStr] = useState("Just now");

  useEffect(() => {
    setIsOnline(typeof navigator !== "undefined" ? navigator.onLine : true);

    function handleOnline() {
      setIsOnline(true);
      setLastSyncStr("Just now");
    }

    function handleOffline() {
      setIsOnline(false);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (collapsed) {
    return (
      <div className="flex justify-center px-2 mb-2">
        <Tooltip
          show
          label={`${isOnline ? "Online" : "Offline"} · Synced: ${lastSyncStr}`}
        >
          <div
            className={clsx(
              "w-2.5 h-2.5 rounded-full",
              isOnline ? "bg-green-400" : "bg-amber-400"
            )}
          />
        </Tooltip>
      </div>
    );
  }

  return (
    <div className="mx-3 mb-2 px-3 py-2 rounded-lg border border-sidebar-border bg-sidebar-hover">
      <div className="flex items-center gap-2 mb-0.5">
        <div
          className={clsx(
            "w-2 h-2 rounded-full flex-shrink-0",
            isOnline ? "bg-green-400" : "bg-amber-400"
          )}
        />
        <span
          className="text-xs font-semibold"
          style={{ color: isOnline ? "#4ade80" : "#fbbf24" }}
        >
          {isOnline ? "Online" : "Offline"}
        </span>
      </div>
      <span className="text-sidebar-text" style={{ fontSize: 10 }}>
        Synced: {lastSyncStr}
      </span>
    </div>
  );
}

function ProfileMenu({
  userEmail,
  initials,
  onExportRestore,
  onSignOut,
  onCloseMobile,
  pathname,
}: {
  userEmail: string;
  initials: string;
  onExportRestore: () => void;
  onSignOut: () => void;
  onCloseMobile: () => void;
  pathname: string;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    function onClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-profile-menu-root]")) {
        setOpen(false);
      }
    }

    document.addEventListener("keydown", onEscape);
    document.addEventListener("mousedown", onClick);

    return () => {
      document.removeEventListener("keydown", onEscape);
      document.removeEventListener("mousedown", onClick);
    };
  }, []);

  return (
    <div className="relative" data-profile-menu-root>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Open account menu"
        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sidebar-text hover:text-white hover:bg-sidebar-hover transition-all"
      >
        <div className="w-8 h-8 rounded-full bg-accent-dim border border-accent/30 flex items-center justify-center text-xs font-semibold text-accent flex-shrink-0">
          {initials}
        </div>

        <div className="flex-1 min-w-0 text-left">
          <p className="text-white text-xs font-medium truncate">{userEmail}</p>
          <p className="text-[10px] text-sidebar-text">Account</p>
        </div>

        <ChevronDown />
      </button>

      {open && (
        <div className="absolute bottom-full left-0 mb-2 w-full min-w-[220px] rounded-xl border border-sidebar-border bg-sidebar shadow-2xl overflow-hidden z-[80]">
          <Link
            href="/dashboard/settings"
            onClick={() => {
              setOpen(false);
              onCloseMobile();
            }}
            className={clsx(
              "flex items-center gap-3 px-4 py-3 text-sm transition-colors",
              isActivePath(pathname, "/dashboard/settings")
                ? "bg-sidebar-hover text-white"
                : "text-sidebar-text hover:text-white hover:bg-sidebar-hover"
            )}
          >
            <GearIcon />
            Settings
          </Link>

          <button
            onClick={() => {
              setOpen(false);
              onExportRestore();
            }}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-sidebar-text hover:text-white hover:bg-sidebar-hover transition-colors"
          >
            <DownloadIcon />
            Export / Restore
          </button>

          <button
            onClick={() => {
              setOpen(false);
              onSignOut();
            }}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-rose-400 hover:text-rose-300 hover:bg-sidebar-hover transition-colors"
          >
            <SignOutIcon />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

function BackupModal({
  onClose,
  userEmail,
}: {
  onClose: () => void;
  userEmail: string;
}) {
  const [mode, setMode] = useState<BackupMode>("export");
  const [format, setFormat] = useState<BackupFormat>("json");
  const [selected, setSelected] = useState<string[]>([]);
  const [downloading, setDownloading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [counts, setCounts] = useState<ModuleCountMap>({});
  const [loadingCounts, setLoadingCounts] = useState(true);

  const [restoreFileName, setRestoreFileName] = useState("");
  const [restoreBackup, setRestoreBackup] = useState<JsonBackup | null>(null);
  const [restoreSelected, setRestoreSelected] = useState<string[]>([]);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const firstButtonRef = useRef<HTMLButtonElement | null>(null);
  const supabase = createClient();

  const activeModules = useMemo(
    () => MODULES.filter((m) => m.status === "active"),
    []
  );

  useEffect(() => {
    firstButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    function onEscape(e: KeyboardEvent) {
      if (e.key === "Escape" && !downloading && !restoring) onClose();
    }
    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, [downloading, restoring, onClose]);

  useEffect(() => {
    async function loadCounts() {
      setLoadingCounts(true);
      setError("");

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          setLoadingCounts(false);
          return;
        }

        const [
          perfumesRes,
          budgetRes,
          portfolioItemsRes,
          portfolioPurchasesRes,
          portfolioAlertsRes,
          calendarRes,
          biomarkersRes,
        ] = await Promise.all([
          supabase
            .from("perfumes")
            .select("*", { count: "exact", head: true })
            .eq("user_id", user.id),
          supabase
            .from("due_items")
            .select("*", { count: "exact", head: true })
            .eq("user_id", user.id),
          supabase
            .from("portfolio_items")
            .select("*", { count: "exact", head: true })
            .eq("user_id", user.id),
          supabase
            .from("portfolio_purchases")
            .select("*", { count: "exact", head: true })
            .eq("user_id", user.id),
          supabase
            .from("portfolio_alerts")
            .select("*", { count: "exact", head: true })
            .eq("user_id", user.id),
          supabase
            .from("calendar_events")
            .select("*", { count: "exact", head: true })
            .eq("user_id", user.id),
          supabase
            .from("biomarker_results")
            .select("*", { count: "exact", head: true })
            .eq("user_id", user.id),
        ]);

        setCounts({
          perfumes: perfumesRes.count ?? 0,
          budget: budgetRes.count ?? 0,
          portfolio:
            (portfolioItemsRes.count ?? 0) +
            (portfolioPurchasesRes.count ?? 0) +
            (portfolioAlertsRes.count ?? 0),
          calendar: calendarRes.count ?? 0,
          biomarkers: biomarkersRes.count ?? 0,
        });
      } catch {
        setError("Failed to load export counts.");
      } finally {
        setLoadingCounts(false);
      }
    }

    loadCounts();
  }, [supabase]);

  function toggle(id: string) {
    setSelected((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  function toggleRestore(id: string) {
    setRestoreSelected((p) =>
      p.includes(id) ? p.filter((x) => x !== id) : [...p, id]
    );
  }

  function selectAllExport() {
    setSelected(activeModules.map((m) => m.id));
  }

  function clearAllExport() {
    setSelected([]);
  }

  function selectAllRestore() {
    if (!restoreBackup) return;
    setRestoreSelected(Object.keys(restoreBackup.modules));
  }

  function clearAllRestore() {
    setRestoreSelected([]);
  }

  async function doExport() {
    if (!selected.length) return;

    setDownloading(true);
    setError("");
    setSuccess("");

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) throw new Error("Not signed in");

      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name, timezone, hidden_modules")
        .eq("id", user.id)
        .single();

      const backup: JsonBackup = {
        app: "MyLife",
        version: "1.0",
        exportedAt: new Date().toISOString(),
        userEmail,
        profile: {
          display_name: profile?.display_name ?? null,
          timezone: profile?.timezone ?? null,
          hidden_modules: profile?.hidden_modules ?? [],
        },
        modules: {},
      };

      if (selected.includes("perfumes")) {
        const [{ data: perfumes }, { data: purchases }, { data: bottles }] =
          await Promise.all([
            supabase.from("perfumes").select("*").eq("user_id", user.id),
            supabase.from("perfume_purchases").select("*").eq("user_id", user.id),
            supabase.from("perfume_bottles").select("*").eq("user_id", user.id),
          ]);

        backup.modules.perfumes = {
          perfumes: perfumes ?? [],
          perfume_purchases: purchases ?? [],
          perfume_bottles: bottles ?? [],
        };
      }

      if (selected.includes("budget")) {
        const [{ data: items }, { data: entries }, { data: settings }] =
          await Promise.all([
            supabase.from("due_items").select("*").eq("user_id", user.id),
            supabase.from("due_entries").select("*").eq("user_id", user.id),
            supabase
              .from("due_month_settings")
              .select("*")
              .eq("user_id", user.id),
          ]);

        backup.modules.budget = {
          due_items: items ?? [],
          due_entries: entries ?? [],
          due_month_settings: settings ?? [],
        };
      }

      if (selected.includes("portfolio")) {
        const [{ data: items }, { data: purchases }, { data: alerts }] =
          await Promise.all([
            supabase.from("portfolio_items").select("*").eq("user_id", user.id),
            supabase
              .from("portfolio_purchases")
              .select("*")
              .eq("user_id", user.id),
            supabase.from("portfolio_alerts").select("*").eq("user_id", user.id),
          ]);

        backup.modules.portfolio = {
          portfolio_items: items ?? [],
          portfolio_purchases: purchases ?? [],
          portfolio_alerts: alerts ?? [],
        };
      }

      if (selected.includes("calendar")) {
        const { data: events } = await supabase
          .from("calendar_events")
          .select("*")
          .eq("user_id", user.id);

        backup.modules.calendar = {
          calendar_events: events ?? [],
        };
      }

      if (selected.includes("biomarkers")) {
        const [{ data: tests }, { data: results }, { data: metrics }] =
          await Promise.all([
            supabase.from("biomarker_tests").select("*").eq("user_id", user.id),
            supabase
              .from("biomarker_results")
              .select("*")
              .eq("user_id", user.id),
            supabase.from("body_metrics").select("*").eq("user_id", user.id),
          ]);

        backup.modules.biomarkers = {
          biomarker_tests: tests ?? [],
          biomarker_results: results ?? [],
          body_metrics: metrics ?? [],
        };
      }

      if (format === "json") {
        const blob = new Blob([JSON.stringify(backup, null, 2)], {
          type: "application/json",
        });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `mylife-backup-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(a.href);
        setSuccess("Backup exported successfully.");
        return;
      }

      const parts: string[] = [];

      if (selected.includes("perfumes")) {
        const perfumes = (backup.modules.perfumes?.perfumes as any[]) ?? [];
        parts.push(`=== perfumes ===`);
        parts.push(
          [
            "brand",
            "model",
            "status",
            "rating_stars",
            "notes_tags",
            "weather_tags",
            "longevity",
            "sillage",
            "value_rating",
            "clone_similar",
            "notes_text",
          ].join(",")
        );

        perfumes.forEach((r) => {
          parts.push(
            [
              csvCell(r.brand),
              csvCell(r.model),
              csvCell(r.status),
              csvCell(r.rating_stars),
              csvCell((r.notes_tags ?? []).join("|")),
              csvCell((r.weather_tags ?? []).join("|")),
              csvCell(r.longevity),
              csvCell(r.sillage),
              csvCell(r.value_rating),
              csvCell(r.clone_similar),
              csvCell(r.notes_text),
            ].join(",")
          );
        });
        parts.push("");
      }

      if (selected.includes("budget")) {
        const items = (backup.modules.budget?.due_items as any[]) ?? [];
        const entries = (backup.modules.budget?.due_entries as any[]) ?? [];

        parts.push(`=== due_items ===`);
        parts.push(
          [
            "name",
            "group_name",
            "statement_date",
            "due_date_day",
            "default_currency",
            "default_amount",
            "is_fixed",
          ].join(",")
        );
        items.forEach((r) => {
          parts.push(
            [
              csvCell(r.name),
              csvCell(r.group_name),
              csvCell(r.statement_date),
              csvCell(r.due_date_day),
              csvCell(r.default_currency),
              csvCell(r.default_amount),
              csvCell(r.is_fixed),
            ].join(",")
          );
        });
        parts.push("");

        parts.push(`=== due_entries ===`);
        parts.push(["month", "amount", "currency", "status", "paid_at", "note"].join(","));
        entries.forEach((r) => {
          parts.push(
            [
              csvCell(r.month),
              csvCell(r.amount),
              csvCell(r.currency),
              csvCell(r.status),
              csvCell(r.paid_at),
              csvCell(r.note),
            ].join(",")
          );
        });
        parts.push("");
      }

      if (selected.includes("portfolio")) {
        const items = (backup.modules.portfolio?.portfolio_items as any[]) ?? [];
        const purchases =
          (backup.modules.portfolio?.portfolio_purchases as any[]) ?? [];
        const alerts = (backup.modules.portfolio?.portfolio_alerts as any[]) ?? [];

        parts.push(`=== portfolio_items ===`);
        parts.push(
          [
            "symbol",
            "name",
            "asset_type",
            "unit_label",
            "main_currency",
            "current_price",
          ].join(",")
        );
        items.forEach((r) => {
          parts.push(
            [
              csvCell(r.symbol),
              csvCell(r.name),
              csvCell(r.asset_type),
              csvCell(r.unit_label),
              csvCell(r.main_currency),
              csvCell(r.current_price),
            ].join(",")
          );
        });
        parts.push("");

        parts.push(`=== portfolio_purchases ===`);
        parts.push(
          [
            "purchased_at",
            "transaction_type",
            "unit_price",
            "units",
            "total_paid",
            "currency",
            "source",
            "notes",
          ].join(",")
        );
        purchases.forEach((r) => {
          parts.push(
            [
              csvCell(r.purchased_at),
              csvCell(r.transaction_type),
              csvCell(r.unit_price),
              csvCell(r.units),
              csvCell(r.total_paid),
              csvCell(r.currency),
              csvCell(r.source),
              csvCell(r.notes),
            ].join(",")
          );
        });
        parts.push("");

        parts.push(`=== portfolio_alerts ===`);
        parts.push(["alert_type", "target_price", "is_active", "triggered_at"].join(","));
        alerts.forEach((r) => {
          parts.push(
            [
              csvCell(r.alert_type),
              csvCell(r.target_price),
              csvCell(r.is_active),
              csvCell(r.triggered_at),
            ].join(",")
          );
        });
        parts.push("");
      }

      if (selected.includes("calendar")) {
        const events = (backup.modules.calendar?.calendar_events as any[]) ?? [];
        parts.push(`=== calendar_events ===`);
        parts.push(
          [
            "date",
            "title",
            "event_type",
            "work_start",
            "work_end",
            "notes",
          ].join(",")
        );
        events.forEach((r) => {
          parts.push(
            [
              csvCell(r.date),
              csvCell(r.title),
              csvCell(r.event_type),
              csvCell(r.work_start),
              csvCell(r.work_end),
              csvCell(r.notes),
            ].join(",")
          );
        });
        parts.push("");
      }

      if (selected.includes("biomarkers")) {
        const results =
          (backup.modules.biomarkers?.biomarker_results as any[]) ?? [];
        parts.push(`=== biomarker_results ===`);
        parts.push(["test_date", "value_num", "value_text", "biomarker_test_id"].join(","));
        results.forEach((r) => {
          parts.push(
            [
              csvCell(r.test_date),
              csvCell(r.value_num),
              csvCell(r.value_text),
              csvCell(r.biomarker_test_id),
            ].join(",")
          );
        });
        parts.push("");
      }

      const blob = new Blob([parts.join("\n")], {
        type: "text/csv;charset=utf-8",
      });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `mylife-export-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
      setSuccess("CSV exported successfully.");
    } catch (err) {
      console.error(err);
      setError("Export failed. Please try again.");
    } finally {
      setDownloading(false);
    }
  }

  function sanitizeRows(rows: any[], userId: string) {
    return (rows ?? []).map((row) => ({
      ...row,
      user_id: userId,
    }));
  }

  async function doRestore() {
    if (!restoreBackup || restoreSelected.length === 0) return;

    setRestoring(true);
    setError("");
    setSuccess("");

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) throw new Error("Not signed in");

      if (restoreBackup.profile) {
        await supabase.from("profiles").upsert(
          {
            id: user.id,
            display_name: restoreBackup.profile.display_name ?? null,
            timezone: restoreBackup.profile.timezone ?? null,
            hidden_modules: restoreBackup.profile.hidden_modules ?? [],
          },
          { onConflict: "id" }
        );
      }

      if (restoreSelected.includes("perfumes")) {
        const mod = restoreBackup.modules.perfumes;
        if (mod) {
          if (Array.isArray(mod.perfumes) && mod.perfumes.length) {
            await supabase
              .from("perfumes")
              .upsert(sanitizeRows(mod.perfumes, user.id), { onConflict: "id" });
          }
          if (Array.isArray(mod.perfume_purchases) && mod.perfume_purchases.length) {
            await supabase
              .from("perfume_purchases")
              .upsert(sanitizeRows(mod.perfume_purchases, user.id), {
                onConflict: "id",
              });
          }
          if (Array.isArray(mod.perfume_bottles) && mod.perfume_bottles.length) {
            await supabase
              .from("perfume_bottles")
              .upsert(sanitizeRows(mod.perfume_bottles, user.id), {
                onConflict: "id",
              });
          }
        }
      }

      if (restoreSelected.includes("budget")) {
        const mod = restoreBackup.modules.budget;
        if (mod) {
          if (Array.isArray(mod.due_items) && mod.due_items.length) {
            await supabase
              .from("due_items")
              .upsert(sanitizeRows(mod.due_items, user.id), { onConflict: "id" });
          }
          if (Array.isArray(mod.due_entries) && mod.due_entries.length) {
            await supabase
              .from("due_entries")
              .upsert(sanitizeRows(mod.due_entries, user.id), {
                onConflict: "id",
              });
          }
          if (
            Array.isArray(mod.due_month_settings) &&
            mod.due_month_settings.length
          ) {
            await supabase
              .from("due_month_settings")
              .upsert(sanitizeRows(mod.due_month_settings, user.id), {
                onConflict: "id",
              });
          }
        }
      }

      if (restoreSelected.includes("portfolio")) {
        const mod = restoreBackup.modules.portfolio;
        if (mod) {
          if (Array.isArray(mod.portfolio_items) && mod.portfolio_items.length) {
            await supabase
              .from("portfolio_items")
              .upsert(sanitizeRows(mod.portfolio_items, user.id), {
                onConflict: "id",
              });
          }
          if (
            Array.isArray(mod.portfolio_purchases) &&
            mod.portfolio_purchases.length
          ) {
            await supabase
              .from("portfolio_purchases")
              .upsert(sanitizeRows(mod.portfolio_purchases, user.id), {
                onConflict: "id",
              });
          }
          if (Array.isArray(mod.portfolio_alerts) && mod.portfolio_alerts.length) {
            await supabase
              .from("portfolio_alerts")
              .upsert(sanitizeRows(mod.portfolio_alerts, user.id), {
                onConflict: "id",
              });
          }
        }
      }

      if (restoreSelected.includes("calendar")) {
        const mod = restoreBackup.modules.calendar;
        if (mod && Array.isArray(mod.calendar_events) && mod.calendar_events.length) {
          await supabase
            .from("calendar_events")
            .upsert(sanitizeRows(mod.calendar_events, user.id), {
              onConflict: "id",
            });
        }
      }

      if (restoreSelected.includes("biomarkers")) {
        const mod = restoreBackup.modules.biomarkers;
        if (mod) {
          if (Array.isArray(mod.biomarker_tests) && mod.biomarker_tests.length) {
            await supabase
              .from("biomarker_tests")
              .upsert(sanitizeRows(mod.biomarker_tests, user.id), {
                onConflict: "id",
              });
          }
          if (
            Array.isArray(mod.biomarker_results) &&
            mod.biomarker_results.length
          ) {
            await supabase
              .from("biomarker_results")
              .upsert(sanitizeRows(mod.biomarker_results, user.id), {
                onConflict: "id",
              });
          }
          if (Array.isArray(mod.body_metrics) && mod.body_metrics.length) {
            await supabase
              .from("body_metrics")
              .upsert(sanitizeRows(mod.body_metrics, user.id), {
                onConflict: "id",
              });
          }
        }
      }

      setSuccess("Restore completed. Refresh the app to see all changes.");
    } catch (err) {
      console.error(err);
      setError("Restore failed. Check the backup file format and try again.");
    } finally {
      setRestoring(false);
    }
  }

  async function handleFilePick(file: File) {
    setError("");
    setSuccess("");
    setRestoreBackup(null);
    setRestoreSelected([]);

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as JsonBackup;

      if (parsed.app !== "MyLife" || !parsed.modules) {
        throw new Error("Invalid backup file");
      }

      const keys = Object.keys(parsed.modules);
      setRestoreBackup(parsed);
      setRestoreSelected(keys);
      setRestoreFileName(file.name);
    } catch {
      setError("This file is not a valid MyLife JSON backup.");
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 z-[90] flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Export or restore data"
    >
      <div
        className="bg-sidebar border border-sidebar-border rounded-2xl w-full max-w-xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-sidebar-border flex items-center justify-between">
          <div className="text-white font-semibold text-sm">Export / Restore data</div>
          <button
            ref={firstButtonRef}
            onClick={onClose}
            aria-label="Close dialog"
            className="text-sidebar-text hover:text-white text-lg"
          >
            ✕
          </button>
        </div>

        <div className="px-5 pt-4">
          <div className="flex gap-2 mb-4">
            {(["export", "restore"] as const).map((m) => (
              <button
                key={m}
                onClick={() => {
                  setMode(m);
                  setError("");
                  setSuccess("");
                }}
                className={clsx(
                  "flex-1 py-2 rounded-xl text-xs font-bold transition-colors",
                  mode === m
                    ? "bg-accent text-white"
                    : "border border-sidebar-border text-sidebar-text hover:text-white"
                )}
              >
                {m === "export" ? "Export / Backup" : "Restore / Import"}
              </button>
            ))}
          </div>
        </div>

        <div className="px-5 pb-5 overflow-y-auto sidebar-scroll">
          {error && (
            <div className="mb-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
              {error}
            </div>
          )}

          {success && (
            <div className="mb-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
              {success}
            </div>
          )}

          {mode === "export" ? (
            <>
              <div className="flex gap-2 mb-4">
                {(["json", "csv"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFormat(f)}
                    className={clsx(
                      "flex-1 py-2 rounded-xl text-xs font-bold transition-colors",
                      format === f
                        ? "bg-accent text-white"
                        : "border border-sidebar-border text-sidebar-text hover:text-white"
                    )}
                  >
                    {f === "json" ? "JSON full backup" : "CSV spreadsheet export"}
                  </button>
                ))}
              </div>

              <div className="mb-3 flex items-center justify-between">
                <p className="text-sidebar-text text-xs">
                  {format === "json"
                    ? "Includes profile settings and portfolio alerts."
                    : "CSV export for spreadsheet use."}
                </p>
              </div>

              <div className="flex gap-2 mb-4">
                <button
                  onClick={selectAllExport}
                  className="px-3 py-2 rounded-xl text-xs font-medium border border-sidebar-border text-sidebar-text hover:text-white"
                >
                  Select all
                </button>
                <button
                  onClick={clearAllExport}
                  className="px-3 py-2 rounded-xl text-xs font-medium border border-sidebar-border text-sidebar-text hover:text-white"
                >
                  Clear all
                </button>
              </div>

              <div className="flex flex-col gap-2">
                {activeModules.map((m) => (
                  <label
                    key={m.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-sidebar-border px-3 py-3 cursor-pointer hover:bg-sidebar-hover transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <input
                        type="checkbox"
                        checked={selected.includes(m.id)}
                        onChange={() => toggle(m.id)}
                        className="w-4 h-4 accent-amber-500"
                      />
                      <span className="text-sm text-sidebar-text truncate">
                        {m.icon} {m.label}
                      </span>
                    </div>
                    <span className="text-[11px] text-sidebar-text flex-shrink-0">
                      {loadingCounts ? "…" : `${counts[m.id] ?? 0} items`}
                    </span>
                  </label>
                ))}
              </div>
            </>
          ) : (
            <>
              <p className="text-sidebar-text text-xs mb-4">
                Restore from a MyLife JSON backup. This merges by ID.
              </p>

              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-accent text-white hover:bg-amber-500 transition-colors"
                >
                  Choose backup file
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFilePick(file);
                  }}
                />
              </div>

              {restoreFileName && (
                <div className="mb-3 rounded-xl border border-sidebar-border px-3 py-2 text-xs text-sidebar-text">
                  File: {restoreFileName}
                </div>
              )}

              {restoreBackup && (
                <>
                  <div className="flex gap-2 mb-4">
                    <button
                      onClick={selectAllRestore}
                      className="px-3 py-2 rounded-xl text-xs font-medium border border-sidebar-border text-sidebar-text hover:text-white"
                    >
                      Select all
                    </button>
                    <button
                      onClick={clearAllRestore}
                      className="px-3 py-2 rounded-xl text-xs font-medium border border-sidebar-border text-sidebar-text hover:text-white"
                    >
                      Clear all
                    </button>
                  </div>

                  <div className="flex flex-col gap-2">
                    {Object.keys(restoreBackup.modules).map((key) => (
                      <label
                        key={key}
                        className="flex items-center gap-3 rounded-xl border border-sidebar-border px-3 py-3 cursor-pointer hover:bg-sidebar-hover transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={restoreSelected.includes(key)}
                          onChange={() => toggleRestore(key)}
                          className="w-4 h-4 accent-amber-500"
                        />
                        <span className="text-sm text-sidebar-text capitalize">
                          {key}
                        </span>
                      </label>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>

        <div className="px-5 pb-4 pt-3 border-t border-sidebar-border flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium text-sidebar-text border border-sidebar-border hover:text-white transition-colors"
          >
            Close
          </button>

          {mode === "export" ? (
            <button
              onClick={doExport}
              disabled={!selected.length || downloading}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-accent text-white hover:bg-amber-500 transition-colors disabled:opacity-50"
            >
              {downloading
                ? "Working…"
                : format === "json"
                ? `Backup (${selected.length})`
                : `Export CSV (${selected.length})`}
            </button>
          ) : (
            <button
              onClick={doRestore}
              disabled={!restoreBackup || !restoreSelected.length || restoring}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-accent text-white hover:bg-amber-500 transition-colors disabled:opacity-50"
            >
              {restoring ? "Restoring…" : `Restore (${restoreSelected.length})`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Sidebar({
  userEmail,
  hiddenModules = [],
}: {
  userEmail: string;
  hiddenModules?: string[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const pathname = usePathname();
  const { theme, toggle } = useTheme();

  const [mounted, setMounted] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);
  const [showBackup, setShowBackup] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [sidebarError, setSidebarError] = useState("");

  const sidebarWidth = desktopCollapsed ? 64 : 240;

  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem("sidebar_collapsed") === "true";
    setDesktopCollapsed(stored);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  useEffect(() => {
    function onEscape(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setMobileOpen(false);
        setShowBackup(false);
      }
    }
    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    document.documentElement.style.setProperty(
      "--sidebar-width",
      `${sidebarWidth}px`
    );
  }, [sidebarWidth, mounted]);

  function toggleDesktop() {
    const next = !desktopCollapsed;
    setDesktopCollapsed(next);
    localStorage.setItem("sidebar_collapsed", String(next));
  }

  async function handleSignOut() {
    setSigningOut(true);
    setSidebarError("");
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      router.push("/login");
    } catch (err) {
      console.error(err);
      setSidebarError("Sign out failed. Please try again.");
    } finally {
      setSigningOut(false);
    }
  }

  const initials = userEmail?.slice(0, 2).toUpperCase() ?? "ML";
  const closeMobile = () => setMobileOpen(false);

  const visibleFinance = FINANCE_MODULES.filter(
    (m) => !hiddenModules.includes(m.id)
  );
  const visibleLifestyle = LIFESTYLE_MODULES.filter(
    (m) => !hiddenModules.includes(m.id)
  );

  const sidebarContent = (isMobile: boolean) => {
    const collapsed = !isMobile && desktopCollapsed;

    return (
      <aside
        style={{ width: isMobile ? 240 : sidebarWidth }}
        className={clsx(
          "fixed left-0 top-0 h-full bg-sidebar flex flex-col border-r border-sidebar-border z-50",
          "transition-all duration-300 ease-in-out",
          isMobile
            ? mobileOpen
              ? "translate-x-0"
              : "-translate-x-full"
            : "translate-x-0"
        )}
      >
        <div
          className={clsx(
            "border-b border-sidebar-border flex items-center flex-shrink-0",
            collapsed ? "px-2 py-4 justify-center" : "px-5 py-4 justify-between"
          )}
        >
          {!collapsed && (
            <Link
              href="/dashboard"
              onClick={closeMobile}
              className="flex items-center gap-2.5"
            >
              <img
                src="/logo.png"
                alt="MyLife"
                className="h-8 w-8 object-contain rounded-lg flex-shrink-0"
              />
              <span className="font-display text-xl text-white tracking-tight">
                My<span className="text-accent italic">Life</span>
              </span>
            </Link>
          )}

          {collapsed && (
            <Tooltip label="Dashboard" show>
              <Link href="/dashboard" aria-label="Dashboard">
                <img
                  src="/logo.png"
                  alt="MyLife"
                  className="h-8 w-8 object-contain rounded-lg"
                />
              </Link>
            </Tooltip>
          )}

          <div className="flex items-center gap-1">
            {!collapsed && !isMobile && (
              <button
                onClick={toggle}
                aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                title={theme === "dark" ? "Light mode" : "Dark mode"}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-sidebar-text hover:text-white hover:bg-sidebar-hover transition-all"
              >
                {theme === "dark" ? <SunIcon /> : <MoonIcon />}
              </button>
            )}

            <button
              onClick={isMobile ? closeMobile : toggleDesktop}
              aria-label={isMobile ? "Close sidebar" : "Toggle sidebar"}
              title={isMobile ? "Close sidebar" : "Toggle sidebar"}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-sidebar-text hover:text-white hover:bg-sidebar-hover transition-all"
            >
              {isMobile ? <CloseIcon /> : <MenuIcon />}
            </button>
          </div>
        </div>

        {sidebarError && (
          <div className="mx-3 mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-300">
            {sidebarError}
          </div>
        )}

        <nav className="flex-1 overflow-y-auto sidebar-scroll px-2 py-4 flex flex-col gap-4">
          <div>
            <Tooltip label="Dashboard" show={collapsed}>
              <Link
                href="/dashboard"
                onClick={closeMobile}
                aria-label={collapsed ? "Dashboard" : undefined}
                className={clsx(
                  "flex items-center gap-3 rounded-lg text-sm font-medium transition-all duration-150",
                  collapsed ? "px-2 py-2.5 justify-center" : "px-3 py-2.5",
                  pathname === "/dashboard"
                    ? "bg-sidebar-hover text-white"
                    : "text-sidebar-text hover:text-white hover:bg-sidebar-hover"
                )}
              >
                <span className="text-base flex-shrink-0">🏠</span>
                {!collapsed && <span>Dashboard</span>}
              </Link>
            </Tooltip>
          </div>

          {visibleFinance.length > 0 && (
            <div>
              {!collapsed && (
                <div className="flex items-center gap-2 px-3 mb-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-accent hub-pulse" />
                  <p className="text-[10px] font-semibold tracking-widest text-accent uppercase">
                    Finance
                  </p>
                </div>
              )}
              <div className="flex flex-col gap-0.5">
                {visibleFinance.map((m) => (
                  <NavItem
                    key={m.id}
                    module={m}
                    pathname={pathname}
                    onNav={closeMobile}
                    collapsed={collapsed}
                  />
                ))}
              </div>
            </div>
          )}

          {visibleLifestyle.length > 0 && (
            <div>
              {!collapsed && (
                <p className="text-[10px] font-semibold tracking-widest text-sidebar-text uppercase px-3 mb-2">
                  Lifestyle
                </p>
              )}
              <div className="flex flex-col gap-0.5">
                {visibleLifestyle.map((m) => (
                  <NavItem
                    key={m.id}
                    module={m}
                    pathname={pathname}
                    onNav={closeMobile}
                    collapsed={collapsed}
                  />
                ))}
              </div>
            </div>
          )}
        </nav>

        <SyncBadge collapsed={collapsed} />

        <div className="border-t border-sidebar-border px-2 py-3 flex-shrink-0">
          {!collapsed ? (
            <div className="flex flex-col gap-2">
              <div className="px-1">
                <ProfileMenu
                  userEmail={userEmail}
                  initials={initials}
                  onExportRestore={() => setShowBackup(true)}
                  onSignOut={handleSignOut}
                  onCloseMobile={closeMobile}
                  pathname={pathname}
                />
              </div>

              <div className="flex items-center justify-between px-3 py-1">
                <span className="text-[11px] text-sidebar-text">Theme</span>
                <button
                  onClick={toggle}
                  aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-sidebar-text hover:text-white hover:bg-sidebar-hover transition-all"
                >
                  {theme === "dark" ? <SunIcon /> : <MoonIcon />}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <Tooltip label={userEmail} show>
                <div className="w-full flex justify-center px-2 py-2.5 rounded-lg text-sidebar-text">
                  <div className="w-8 h-8 rounded-full bg-accent-dim border border-accent/30 flex items-center justify-center text-xs font-semibold text-accent flex-shrink-0">
                    {initials}
                  </div>
                </div>
              </Tooltip>

              <Tooltip label="Settings" show>
                <Link
                  href="/dashboard/settings"
                  onClick={closeMobile}
                  aria-label="Settings"
                  className={clsx(
                    "w-full flex justify-center px-2 py-2.5 rounded-lg transition-all",
                    isActivePath(pathname, "/dashboard/settings")
                      ? "bg-sidebar-hover text-white"
                      : "text-sidebar-text hover:text-white hover:bg-sidebar-hover"
                  )}
                >
                  <GearIcon />
                </Link>
              </Tooltip>

              <Tooltip label="Export / Restore" show>
                <button
                  onClick={() => setShowBackup(true)}
                  aria-label="Export or restore"
                  className="w-full flex justify-center px-2 py-2.5 rounded-lg text-sidebar-text hover:text-white hover:bg-sidebar-hover transition-all"
                >
                  <DownloadIcon />
                </button>
              </Tooltip>

              <Tooltip label={theme === "dark" ? "Light mode" : "Dark mode"} show>
                <button
                  onClick={toggle}
                  aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                  className="w-full flex justify-center px-2 py-2.5 rounded-lg text-sidebar-text hover:text-white hover:bg-sidebar-hover transition-all"
                >
                  {theme === "dark" ? <SunIcon /> : <MoonIcon />}
                </button>
              </Tooltip>

              <Tooltip label="Sign out" show>
                <button
                  onClick={handleSignOut}
                  disabled={signingOut}
                  aria-label="Sign out"
                  className="w-full flex justify-center px-2 py-2.5 rounded-lg text-sidebar-text hover:text-white hover:bg-sidebar-hover transition-all disabled:opacity-50"
                >
                  <SignOutIcon />
                </button>
              </Tooltip>
            </div>
          )}
        </div>
      </aside>
    );
  };

  return (
    <>
      <div className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-sidebar border-b border-sidebar-border flex items-center justify-between px-4 z-40">
        <button
          onClick={() => setMobileOpen(true)}
          aria-label="Open sidebar"
          className="w-9 h-9 rounded-lg flex items-center justify-center text-sidebar-text hover:text-white hover:bg-sidebar-hover transition-all"
        >
          <MenuIcon />
        </button>

        <Link href="/dashboard" className="flex items-center gap-2">
          <img
            src="/logo.png"
            alt="MyLife"
            className="h-7 w-7 object-contain rounded-lg"
          />
          <span className="font-display text-xl text-white tracking-tight">
            My<span className="text-accent italic">Life</span>
          </span>
        </Link>

        <button
          onClick={toggle}
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          className="w-9 h-9 rounded-lg flex items-center justify-center text-sidebar-text hover:text-white hover:bg-sidebar-hover transition-all"
        >
          {theme === "dark" ? <SunIcon /> : <MoonIcon />}
        </button>
      </div>

      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/60 z-40 backdrop-blur-sm"
          onClick={closeMobile}
        />
      )}

      <div className="lg:hidden">{sidebarContent(true)}</div>
      <div className="hidden lg:block">{mounted && sidebarContent(false)}</div>

      {showBackup && (
        <BackupModal
          onClose={() => setShowBackup(false)}
          userEmail={userEmail}
        />
      )}
    </>
  );
}
