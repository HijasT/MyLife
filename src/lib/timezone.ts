/**
 * Timezone utilities for MyLife app
 * Always uses Asia/Dubai (UTC+4) as the app timezone
 */

export const APP_TZ = "Asia/Dubai";

/** Get current date string in Dubai timezone (YYYY-MM-DD) */
export function todayDubai(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: APP_TZ });
}

/** Get current datetime ISO string adjusted to Dubai timezone offset */
export function nowDubai(): string {
  const now = new Date();
  // Get Dubai time components
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TZ,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const get = (t: string) => parts.find(p => p.type === t)?.value ?? "00";
  const year = get("year"), month = get("month"), day = get("day");
  const hour = get("hour") === "24" ? "00" : get("hour");
  const min = get("minute"), sec = get("second");

  // Return as ISO with +04:00 offset
  return `${year}-${month}-${day}T${hour}:${min}:${sec}+04:00`;
}

/** Format a UTC ISO string as Dubai local datetime */
export function fmtDubai(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-AE", {
    timeZone: APP_TZ,
    day: "2-digit", month: "short", year: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

/** Format a UTC ISO string as Dubai local date only */
export function fmtDateDubai(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-AE", {
    timeZone: APP_TZ,
    day: "2-digit", month: "short", year: "numeric",
  });
}
