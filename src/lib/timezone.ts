// Timezone utility - always use Dubai/UAE timezone
export const USER_TZ = "Asia/Dubai";

export function nowInTZ(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: USER_TZ }));
}

export function nowISOInTZ(): string {
  const d = nowInTZ();
  return d.toISOString().slice(0, 10);
}

export function nowISO(): string {
  // Returns current datetime adjusted for Dubai timezone
  const now = new Date();
  const tzOffset = getTimezoneOffset(USER_TZ);
  const adjusted = new Date(now.getTime() + tzOffset);
  return adjusted.toISOString();
}

export function getTimezoneOffset(tz: string): number {
  const now = new Date();
  const utcDate = new Date(now.toLocaleString("en-US", { timeZone: "UTC" }));
  const tzDate  = new Date(now.toLocaleString("en-US", { timeZone: tz }));
  return tzDate.getTime() - utcDate.getTime();
}

export function fmtDateTimeTZ(iso: string | null, tz = USER_TZ): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-AE", {
    timeZone: tz,
    day: "2-digit", month: "short", year: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

export function fmtDateTZ(iso: string | null, tz = USER_TZ): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-AE", {
    timeZone: tz, day: "2-digit", month: "short", year: "numeric",
  });
}

export function todayStringTZ(tz = USER_TZ): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: tz }); // YYYY-MM-DD
}
