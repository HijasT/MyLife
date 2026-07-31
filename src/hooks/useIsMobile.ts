"use client";

import { useEffect, useState } from "react";

// Mirrors Tailwind's `lg` breakpoint (1024px) — the same threshold
// `dashboard/layout.tsx` and `Sidebar.tsx` already switch on between the
// desktop sidebar-offset shell and the full-width mobile drawer shell, so
// "mobile" means the same thing everywhere in the app.
const MOBILE_QUERY = "(max-width: 1023px)";

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.matchMedia(MOBILE_QUERY).matches
  );

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}
