/**
 * Timezone utilities for MyLife app.
 *
 * Defaults to Asia/Dubai (APP_TZ) everywhere, but every function accepts an
 * optional IANA timezone override — most modules should fetch the user's
 * real preference via getUserTimezone() and pass it through, since
 * profiles.timezone is a real per-user setting (editable in Settings) with
 * 'Asia/Dubai' as its default, not an app-wide constant.
 */

export const APP_TZ = "Asia/Dubai";

/** True if `tz` is a non-empty string Intl recognizes as a valid IANA timezone. */
export function isValidTimezone(tz: unknown): tz is string {
  if (typeof tz !== "string" || tz.trim() === "") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Fetches the signed-in user's profiles.timezone, validated, falling back
 * to APP_TZ if unset/invalid or the query fails. Centralizes what
 * Calendar/Dashboard home used to each reimplement independently.
 */
export async function getUserTimezone(
  supabase: { from: (table: string) => any },
  userId: string
): Promise<string> {
  try {
    const { data } = await supabase
      .from("profiles")
      .select("timezone")
      .eq("id", userId)
      .single();
    return isValidTimezone(data?.timezone) ? data.timezone : APP_TZ;
  } catch {
    return APP_TZ;
  }
}

/** The IANA UTC offset (e.g. "+04:00") for `tz` at `date`, honoring DST. */
function tzOffset(tz: string, date: Date): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      timeZoneName: "longOffset",
    }).formatToParts(date);
    const raw = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT";
    const match = raw.match(/GMT([+-]\d{2}:\d{2})?/);
    return match?.[1] ?? "+00:00";
  } catch {
    return "+00:00";
  }
}

/** Get current date string in the given timezone (YYYY-MM-DD). Defaults to Dubai. */
export function todayDubai(tz: string = APP_TZ): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: tz });
}

/** Get current datetime ISO string adjusted to the given timezone's offset. Defaults to Dubai. */
export function nowDubai(tz: string = APP_TZ): string {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const get = (t: string) => parts.find(p => p.type === t)?.value ?? "00";
  const year = get("year"), month = get("month"), day = get("day");
  const hour = get("hour") === "24" ? "00" : get("hour");
  const min = get("minute"), sec = get("second");

  return `${year}-${month}-${day}T${hour}:${min}:${sec}${tzOffset(tz, now)}`;
}

/** Format a UTC ISO string as local datetime in the given timezone. Defaults to Dubai. */
export function fmtDubai(iso: string | null, tz: string = APP_TZ): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-AE", {
    timeZone: tz,
    day: "2-digit", month: "short", year: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

/** Format a UTC ISO string as a local date only, in the given timezone. Defaults to Dubai. */
export function fmtDateDubai(iso: string | null, tz: string = APP_TZ): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-AE", {
    timeZone: tz,
    day: "2-digit", month: "short", year: "numeric",
  });
}
