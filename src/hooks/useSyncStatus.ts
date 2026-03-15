"use client";

import { useEffect, useState, useCallback } from "react";

export type SyncStatus = {
  isOnline: boolean;
  lastSync: Date | null;
  lastSyncStr: string;
};

const SYNC_KEY = "mylife_last_sync";

export function useSyncStatus(): SyncStatus {
  const [isOnline, setIsOnline] = useState(true);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  useEffect(() => {
    setIsOnline(navigator.onLine);
    const stored = localStorage.getItem(SYNC_KEY);
    if (stored) setLastSync(new Date(stored));

    const onOnline  = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online",  onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online",  onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  const lastSyncStr = lastSync
    ? formatSyncTime(lastSync)
    : "Never";

  return { isOnline, lastSync, lastSyncStr };
}

export function markSynced() {
  const now = new Date();
  localStorage.setItem(SYNC_KEY, now.toISOString());
  return now;
}

function formatSyncTime(d: Date): string {
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return d.toLocaleDateString("en-AE", { day:"numeric", month:"short" });
}

// ── Offline data cache ────────────────────────────────────────────────────
export function saveToCache<T>(key: string, data: T) {
  try {
    localStorage.setItem(`mylife_cache_${key}`, JSON.stringify(data));
  } catch { /* quota exceeded — ignore */ }
}

export function loadFromCache<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(`mylife_cache_${key}`);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
