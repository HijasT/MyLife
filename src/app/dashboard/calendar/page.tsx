"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type EventType = "work" | "birthday" | "event" | "due_paid" | "note";
type ShiftKey =
  | "Morning"
  | "Mid1"
  | "Mid2"
  | "Afternoon"
  | "F.Morning"
  | "F.Afternoon"
  | "Holiday Duty"
  | "Overtime"
  | "Day Off"
  | "Paid Leave"
  | "Custom";

type RecurType = "none" | "weekly" | "monthly" | "yearly";
type EditScope = "single" | "future";

type EventMeta = {
  seriesId?: string;
  shiftName?: string;
};

type CalEvent = {
  id: string;
  date: string;
  title: string;
  eventType: EventType;
  sourceModule: string;
  workStart?: string;
  workEnd?: string;
  color: string;
  notes: string;
  isRecurring: boolean;
  recurType?: string;
};

const SHIFTS: Record<
  ShiftKey,
  { start: string; end: string; label: string; noTime?: boolean }
> = {
  Morning: { start: "07:00", end: "15:00", label: "Morning (7–3)" },
  Mid1: { start: "09:00", end: "17:00", label: "Mid 1 (9–5)" },
  Mid2: { start: "10:00", end: "18:00", label: "Mid 2 (10–6)" },
  Afternoon: { start: "14:00", end: "22:00", label: "Afternoon (2–10)" },
  "F.Morning": { start: "07:30", end: "12:00", label: "F.Morning (7:30–12)" },
  "F.Afternoon": { start: "14:00", end: "19:00", label: "F.Afternoon (2–7)" },
  "Holiday Duty": { start: "07:00", end: "15:00", label: "Holiday Duty" },
  Overtime: { start: "15:00", end: "19:00", label: "Overtime" },
  "Day Off": { start: "", end: "", label: "Day Off", noTime: true },
  "Paid Leave": { start: "", end: "", label: "Paid Leave", noTime: true },
  Custom: { start: "09:00", end: "17:00", label: "Custom" },
};

const SHIFT_COLORS: Record<ShiftKey, string> = {
  Morning: "#3b82f6",
  Mid1: "#6366f1",
  Mid2: "#8b5cf6",
  Afternoon: "#f59e0b",
  "F.Morning": "#06b6d4",
  "F.Afternoon": "#0ea5e9",
  "Holiday Duty": "#ef4444",
  Overtime: "#f97316",
  "Day Off": "#9ca3af",
  "Paid Leave": "#22c55e",
  Custom: "#3b82f6",
};

const EVENT_COLORS: Record<EventType, string> = {
  work: "#3b82f6",
  birthday: "#ec4899",
  event: "#8b5cf6",
  due_paid: "#16a34a",
  note: "#6b7280",
};

const EVENT_LABELS: Record<EventType, string> = {
  work: "Work",
  birthday: "Anniversary 🎂",
  event: "Event",
  due_paid: "Due paid ✓",
  note: "Note",
};

const META_PREFIX = "__MLMETA__";

function encodeMetaNotes(userNotes: string, meta: EventMeta) {
  const payload = JSON.stringify(meta);
  const cleanNotes = userNotes.trim();
  return `${META_PREFIX}${payload}\n${cleanNotes}`;
}

function parseMetaNotes(notes: string): { meta: EventMeta; plainNotes: string } {
  if (!notes?.startsWith(META_PREFIX)) {
    return { meta: {}, plainNotes: notes ?? "" };
  }

  const firstLineEnd = notes.indexOf("\n");
  const metaLine =
    firstLineEnd >= 0 ? notes.slice(0, firstLineEnd) : notes;
  const plainNotes =
    firstLineEnd >= 0 ? notes.slice(firstLineEnd + 1) : "";

  try {
    const raw = metaLine.replace(META_PREFIX, "");
    return {
      meta: JSON.parse(raw) as EventMeta,
      plainNotes,
    };
  } catch {
    return { meta: {}, plainNotes: notes ?? "" };
  }
}

function getEventMeta(ev: CalEvent) {
  return parseMetaNotes(ev.notes).meta;
}

function getPlainNotes(ev: CalEvent) {
  return parseMetaNotes(ev.notes).plainNotes;
}

function safeArrayIncludes<T>(arr: T[], val: T) {
  return Array.isArray(arr) && arr.includes(val);
}

function parseYmd(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return { y, m, d };
}

function formatYmd(y: number, m: number, d: number) {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function makeUtcDate(ymd: string) {
  const { y, m, d } = parseYmd(ymd);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

function toYmdFromDate(date: Date) {
  return formatYmd(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate()
  );
}

function addDaysYmd(ymd: string, days: number) {
  const d = makeUtcDate(ymd);
  d.setUTCDate(d.getUTCDate() + days);
  return toYmdFromDate(d);
}

function isValidYmd(ymd: string) {
  const { y, m, d } = parseYmd(ymd);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() + 1 === m &&
    dt.getUTCDate() === d
  );
}

function addMonthsSameDay(ymd: string, monthsToAdd: number) {
  const { y, m, d } = parseYmd(ymd);
  const targetMonthIndex = m - 1 + monthsToAdd;
  const newYear = y + Math.floor(targetMonthIndex / 12);
  const newMonth = ((targetMonthIndex % 12) + 12) % 12 + 1;
  const candidate = formatYmd(newYear, newMonth, d);
  return isValidYmd(candidate) ? candidate : null;
}

function addYearsSameDay(ymd: string, yearsToAdd: number) {
  const { y, m, d } = parseYmd(ymd);
  const candidate = formatYmd(y + yearsToAdd, m, d);
  return isValidYmd(candidate) ? candidate : null;
}

function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let current = from;
  while (current <= to) {
    out.push(current);
    current = addDaysYmd(current, 1);
  }
  return out;
}

function getMonthInTz(timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());

  const year = parts.find((p) => p.type === "year")?.value ?? "1970";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  return `${year}-${month}`;
}

function getTodayInTz(timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const year = parts.find((p) => p.type === "year")?.value ?? "1970";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function daysInMonth(y: number, m: number) {
  return new Date(y, m, 0).getDate();
}

function firstDayOfMonth(y: number, m: number) {
  return new Date(Date.UTC(y, m - 1, 1, 12, 0, 0)).getUTCDay();
}

function fmtMonth(m: string, timezone: string) {
  const [y, mo] = m.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, 1, 12, 0, 0)).toLocaleDateString(
    "en-AE",
    {
      timeZone: timezone,
      month: "long",
      year: "numeric",
    }
  );
}

function prevMonth(m: string) {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(Date.UTC(y, mo - 2, 1, 12, 0, 0));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function nextMonth(m: string) {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(Date.UTC(y, mo, 1, 12, 0, 0));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function workHours(s?: string, e?: string) {
  if (!s || !e) return 0;
  const [sh, sm] = s.split(":").map(Number);
  const [eh, em] = e.split(":").map(Number);
  return Math.max(0, eh + em / 60 - (sh + sm / 60));
}

function fmt12(t?: string): string {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function getWeekNumber(date: string) {
  const d = makeUtcDate(date);
  return Math.ceil(d.getUTCDate() / 7);
}

function buildOccurrences(
  startDate: string,
  recurType: RecurType
): string[] {
  if (recurType === "none") return [startDate];

  const out: string[] = [];
  if (recurType === "weekly") {
    for (let i = 0; i < 52; i++) out.push(addDaysYmd(startDate, i * 7));
  } else if (recurType === "monthly") {
    for (let i = 0; i < 24; i++) {
      const d = addMonthsSameDay(startDate, i);
      if (d) out.push(d);
    }
  } else if (recurType === "yearly") {
    for (let i = 0; i < 10; i++) {
      const d = addYearsSameDay(startDate, i);
      if (d) out.push(d);
    }
  }

  return out;
}

function legacyShiftNameFromTitle(title: string): string | undefined {
  if (title.startsWith("Work:")) return title.split(":")[1]?.trim() || "Work";
  return undefined;
}

function displayTitle(ev: CalEvent) {
  if (ev.title.startsWith("Work:")) return ev.title.replace(/^Work:/, "").trim();
  return ev.title;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dbToEvent = (r: any): CalEvent => ({
  id: r.id,
  date: r.date,
  title: r.title,
  eventType: r.event_type as EventType,
  sourceModule: r.source_module ?? "manual",
  workStart: r.work_start ?? undefined,
  workEnd: r.work_end ?? undefined,
  color: r.color ?? "#F5A623",
  notes: r.notes ?? "",
  isRecurring: r.is_recurring ?? false,
  recurType: r.recur_type ?? undefined,
});

export default function CalendarPage() {
  const supabase = createClient();

  const [userId, setUserId] = useState<string | null>(null);
  const [timezone, setTimezone] = useState("UTC");
  const [month, setMonth] = useState(getMonthInTz("UTC"));
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"month" | "week">("month");
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");

  const [editingEvent, setEditingEvent] = useState<CalEvent | null>(null);
  const [editScope, setEditScope] = useState<EditScope>("single");

  const [addType, setAddType] = useState<EventType>("work");
  const [addShift, setAddShift] = useState<ShiftKey>("Morning");
  const [addTitle, setAddTitle] = useState("");
  const [addStart, setAddStart] = useState("07:00");
  const [addEnd, setAddEnd] = useState("15:00");
  const [addDateFrom, setAddDateFrom] = useState(getTodayInTz("UTC"));
  const [addDateTo, setAddDateTo] = useState(getTodayInTz("UTC"));
  const [addNotes, setAddNotes] = useState("");
  const [addRecurType, setAddRecurType] = useState<RecurType>("none");
  const [addAnnivType, setAddAnnivType] = useState("Birthday");
  const [addAnnivName, setAddAnnivName] = useState("");
  const [filterTypes, setFilterTypes] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [addSaving, setAddSaving] = useState(false);

  const filterMenuRef = useRef<HTMLDivElement | null>(null);
  const selectedPanelRef = useRef<HTMLDivElement | null>(null);

  const isDark =
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark");

  const todayStr = getTodayInTz(timezone);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");

      try {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError || !user) {
          setError("Failed to load session.");
          setLoading(false);
          return;
        }

        setUserId(user.id);

        const { data: profile } = await supabase
          .from("profiles")
          .select("timezone")
          .eq("id", user.id)
          .single();

        const tz = profile?.timezone || "UTC";
        setTimezone(tz);
        setMonth(getMonthInTz(tz));
        setAddDateFrom(getTodayInTz(tz));
        setAddDateTo(getTodayInTz(tz));

        await loadEvents(user.id, getMonthInTz(tz));
      } catch {
        setError("Failed to load calendar.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  useEffect(() => {
    const modalOpen = showAdd;
    document.body.style.overflow = modalOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [showAdd]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (
        showFilterMenu &&
        filterMenuRef.current &&
        !filterMenuRef.current.contains(e.target as Node)
      ) {
        setShowFilterMenu(false);
      }
    }

    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [showFilterMenu]);

  useEffect(() => {
    if (selectedDate && selectedPanelRef.current) {
      selectedPanelRef.current.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  }, [selectedDate]);

  async function loadEvents(uid: string, m: string) {
    setError("");
    try {
      const [y, mo] = m.split("-").map(Number);
      const start = `${y}-${String(mo).padStart(2, "0")}-01`;
      const end = `${y}-${String(mo).padStart(2, "0")}-${String(
        daysInMonth(y, mo)
      ).padStart(2, "0")}`;

      const [{ data: d1, error: e1 }, { data: d2, error: e2 }] =
        await Promise.all([
          supabase
            .from("calendar_events")
            .select("*")
            .eq("user_id", uid)
            .gte("date", start)
            .lte("date", end)
            .order("date"),
          supabase
            .from("calendar_events")
            .select("*")
            .eq("user_id", uid)
            .eq("is_recurring", true),
        ]);

      if (e1 || e2) {
        setError("Failed to load events.");
        return;
      }

      const all = [
        ...(d1 ?? []),
        ...(d2 ?? []).filter(
          (r: { id: string }) => !(d1 ?? []).some((x: { id: string }) => x.id === r.id)
        ),
      ];

      setEvents(all.map(dbToEvent));
    } catch {
      setError("Failed to load events.");
    }
  }

  async function changeMonth(m: string) {
    setMonth(m);
    if (userId) await loadEvents(userId, m);
  }

  function resetForm(baseDate?: string) {
    const target = baseDate ?? todayStr;
    setEditingEvent(null);
    setEditScope("single");
    setAddType("work");
    setAddShift("Morning");
    setAddTitle("");
    setAddStart("07:00");
    setAddEnd("15:00");
    setAddDateFrom(target);
    setAddDateTo(target);
    setAddNotes("");
    setAddRecurType("none");
    setAddAnnivType("Birthday");
    setAddAnnivName("");
  }

  function selectShift(s: ShiftKey) {
    setAddShift(s);
    const sh = SHIFTS[s];
    if (!sh.noTime) {
      setAddStart(sh.start);
      setAddEnd(sh.end);
    }
    if (addType === "work" && s !== "Custom" && !editingEvent) {
      setAddTitle(s);
    }
  }

  function openEditEvent(ev: CalEvent) {
    const meta = getEventMeta(ev);
    const plainNotes = getPlainNotes(ev);
    const legacyShift = legacyShiftNameFromTitle(ev.title);
    const shiftName = meta.shiftName || legacyShift || "Custom";
    const safeShift = safeArrayIncludes(Object.keys(SHIFTS), shiftName as ShiftKey)
      ? (shiftName as ShiftKey)
      : "Custom";

    setEditingEvent(ev);
    setEditScope("single");
    setAddType(ev.eventType);
    setAddShift(safeShift);
    setAddTitle(displayTitle(ev));
    setAddStart(ev.workStart ?? "07:00");
    setAddEnd(ev.workEnd ?? "15:00");
    setAddDateFrom(ev.date);
    setAddDateTo(ev.date);
    setAddNotes(plainNotes);
    setAddRecurType(
      ev.isRecurring && (ev.recurType === "weekly" || ev.recurType === "monthly" || ev.recurType === "yearly")
        ? (ev.recurType as RecurType)
        : "none"
    );

    if (ev.eventType === "birthday") {
      const title = displayTitle(ev);
      const colonIndex = title.indexOf(":");
      if (colonIndex > -1) {
        setAddAnnivType(title.slice(0, colonIndex).trim() || "Birthday");
        setAddAnnivName(title.slice(colonIndex + 1).trim() || "");
      } else {
        setAddAnnivType("Birthday");
        setAddAnnivName(title);
      }
    } else {
      setAddAnnivType("Birthday");
      setAddAnnivName("");
    }

    setShowAdd(true);
  }

  async function addOrUpdateEvent() {
    if (!userId) return;

    const isWork = addType === "work";
    const shift = SHIFTS[addShift];
    const noTime = shift.noTime;

    const annivTitle =
      addType === "birthday"
        ? addTitle.trim() ||
          (addAnnivName ? `${addAnnivType}: ${addAnnivName}` : addAnnivType)
        : "";

    const baseTitle =
      addTitle.trim() ||
      (isWork
        ? addShift
        : addType === "birthday"
        ? annivTitle
        : "");

    if (!baseTitle) {
      setError("Please enter a title.");
      return;
    }

    if (addDateFrom > addDateTo) {
      setError("End date cannot be before start date.");
      return;
    }

    if (addRecurType !== "none" && addDateFrom !== addDateTo) {
      setError("Recurring events must use a single date.");
      return;
    }

    setAddSaving(true);
    setError("");

    try {
      if (!editingEvent) {
        const seriesId =
          addRecurType !== "none" ? crypto.randomUUID() : undefined;

        const occurrenceDates =
          addRecurType === "none"
            ? datesBetween(addDateFrom, addDateTo)
            : buildOccurrences(addDateFrom, addRecurType);

        const color = isWork ? SHIFT_COLORS[addShift] : EVENT_COLORS[addType];
        const meta: EventMeta = {};
        if (isWork) meta.shiftName = addShift;
        if (seriesId) meta.seriesId = seriesId;

        const notesWithMeta = encodeMetaNotes(addNotes, meta);

        const rows = occurrenceDates.map((date) => ({
          user_id: userId,
          date,
          title: baseTitle,
          event_type: addType,
          source_module: "manual",
          work_start: isWork && !noTime ? addStart : null,
          work_end: isWork && !noTime ? addEnd : null,
          color,
          notes: notesWithMeta,
          is_recurring: addRecurType !== "none",
          recur_type: addRecurType !== "none" ? addRecurType : null,
        }));

        const { data, error } = await supabase
          .from("calendar_events")
          .insert(rows)
          .select("*");

        if (error) {
          setError("Failed to add event.");
          return;
        }

        if (data) {
          setEvents((p) => [...p, ...data.map(dbToEvent)]);
          setShowAdd(false);
          resetForm(selectedDate ?? todayStr);
          showToast(
            `Added ${occurrenceDates.length} event${
              occurrenceDates.length > 1 ? "s" : ""
            }`
          );
        }
      } else {
        const meta = getEventMeta(editingEvent);
        const color = isWork ? SHIFT_COLORS[addShift] : EVENT_COLORS[addType];
        const nextMeta: EventMeta = {
          ...meta,
          shiftName: isWork ? addShift : undefined,
        };
        const notesWithMeta = encodeMetaNotes(addNotes, nextMeta);

        const updatePayload = {
          title: baseTitle,
          event_type: addType,
          work_start: isWork && !noTime ? addStart : null,
          work_end: isWork && !noTime ? addEnd : null,
          color,
          notes: notesWithMeta,
          is_recurring: addRecurType !== "none",
          recur_type: addRecurType !== "none" ? addRecurType : null,
        };

        let affectedIds: string[] = [];
        const seriesId = meta.seriesId;

        if (
          editScope === "future" &&
          seriesId &&
          editingEvent.isRecurring
        ) {
          affectedIds = events
            .filter((e) => {
              const eMeta = getEventMeta(e);
              return eMeta.seriesId === seriesId && e.date >= editingEvent.date;
            })
            .map((e) => e.id);

          if (affectedIds.length === 0) {
            affectedIds = [editingEvent.id];
          }

          const { data, error } = await supabase
            .from("calendar_events")
            .update(updatePayload)
            .in("id", affectedIds)
            .select("*");

          if (error) {
            setError("Failed to update future events.");
            return;
          }

          if (data) {
            const mapped = data.map(dbToEvent);
            const mappedById = new Map(mapped.map((x) => [x.id, x]));
            setEvents((prev) =>
              prev.map((ev) => mappedById.get(ev.id) ?? ev)
            );
          }

          showToast(
            `Updated ${affectedIds.length} future entr${
              affectedIds.length === 1 ? "y" : "ies"
            }`
          );
        } else {
          const { data, error } = await supabase
            .from("calendar_events")
            .update(updatePayload)
            .eq("id", editingEvent.id)
            .select("*")
            .single();

          if (error) {
            setError("Failed to update event.");
            return;
          }

          if (data) {
            const updated = dbToEvent(data);
            setEvents((prev) =>
              prev.map((ev) => (ev.id === editingEvent.id ? updated : ev))
            );
          }

          showToast("Event updated");
        }

        setShowAdd(false);
        resetForm(selectedDate ?? todayStr);
      }
    } catch {
      setError(editingEvent ? "Failed to update event." : "Failed to add event.");
    } finally {
      setAddSaving(false);
    }
  }

  async function deleteEvent(id: string) {
    const ev = events.find((e) => e.id === id);
    if (!ev) return;

    try {
      const meta = getEventMeta(ev);
      if (ev.isRecurring && meta.seriesId) {
        const futureIds = events
          .filter((e) => {
            const eMeta = getEventMeta(e);
            return eMeta.seriesId === meta.seriesId && e.date >= todayStr;
          })
          .map((e) => e.id);

        if (futureIds.length > 0) {
          const { error } = await supabase
            .from("calendar_events")
            .delete()
            .in("id", futureIds);

          if (error) {
            setError("Failed to delete future recurring events.");
            return;
          }

          setEvents((p) => p.filter((e) => !futureIds.includes(e.id)));
          showToast(
            `Deleted ${futureIds.length} future entr${
              futureIds.length === 1 ? "y" : "ies"
            } — past entries kept`
          );
          return;
        }
      }

      if (ev.isRecurring && ev.recurType === "yearly") {
        const futureIds = events
          .filter(
            (e) =>
              e.title === ev.title &&
              e.eventType === ev.eventType &&
              e.date >= todayStr
          )
          .map((e) => e.id);

        if (futureIds.length > 0) {
          const { error } = await supabase
            .from("calendar_events")
            .delete()
            .in("id", futureIds);

          if (error) {
            setError("Failed to delete future recurring events.");
            return;
          }

          setEvents((p) => p.filter((e) => !futureIds.includes(e.id)));
          showToast(
            `Deleted ${futureIds.length} future entr${
              futureIds.length === 1 ? "y" : "ies"
            } — past entries kept`
          );
          return;
        }
      }

      const { error } = await supabase
        .from("calendar_events")
        .delete()
        .eq("id", id);

      if (error) {
        setError("Failed to delete event.");
        return;
      }

      setEvents((p) => p.filter((e) => e.id !== id));
      showToast("Deleted");
    } catch {
      setError("Failed to delete event.");
    }
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  }

  const [year, mo] = month.split("-").map(Number);
  const totalDays = daysInMonth(year, mo);
  const firstDay = firstDayOfMonth(year, mo);

  const filteredEvents = useMemo(() => {
    let evs = events;

    if (filterTypes.length) {
      evs = evs.filter((e) => filterTypes.includes(e.eventType));
    }

    const q = searchQuery.trim().toLowerCase();
    if (q) {
      evs = evs.filter((e) => {
        const plainNotes = getPlainNotes(e).toLowerCase();
        return (
          displayTitle(e).toLowerCase().includes(q) ||
          plainNotes.includes(q) ||
          e.eventType.toLowerCase().includes(q)
        );
      });
    }

    return evs;
  }, [events, filterTypes, searchQuery]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalEvent[]>();

    for (const ev of filteredEvents) {
      let date = ev.date;

      if (ev.isRecurring && ev.recurType === "monthly" && !getEventMeta(ev).seriesId) {
        const { d } = parseYmd(ev.date);
        date = formatYmd(year, mo, d);
        if (!isValidYmd(date)) continue;
      }

      if (ev.isRecurring && ev.recurType === "yearly" && !getEventMeta(ev).seriesId) {
        const { m, d } = parseYmd(ev.date);
        date = formatYmd(year, m, d);
        if (!isValidYmd(date)) continue;
      }

      if (!date.startsWith(month)) continue;
      if (!map.has(date)) map.set(date, []);
      map.get(date)!.push(ev);
    }

    return map;
  }, [filteredEvents, month, year, mo]);

  const monthStats = useMemo(() => {
    const workEvs = events.filter(
      (e) => e.eventType === "work" && e.date.startsWith(month)
    );
    let hours = 0;
    const days = new Set<string>();
    const shiftCounts: Record<string, number> = {};

    for (const e of workEvs) {
      hours += workHours(e.workStart, e.workEnd);
      days.add(e.date);
      const meta = getEventMeta(e);
      const shiftName = meta.shiftName || legacyShiftNameFromTitle(e.title) || "Work";
      shiftCounts[shiftName] = (shiftCounts[shiftName] ?? 0) + 1;
    }

    const extraShifts = Object.entries(shiftCounts)
      .filter(([s]) => ["Holiday Duty", "Overtime"].includes(s))
      .reduce((t, [, c]) => t + c, 0);

    const leaves = Object.entries(shiftCounts)
      .filter(([s]) => ["Day Off", "Paid Leave"].includes(s))
      .reduce((t, [, c]) => t + c, 0);

    return {
      days: days.size,
      hours: Math.round(hours * 10) / 10,
      extra: extraShifts,
      leaves,
      shiftCounts,
    };
  }, [events, month]);

  const weekDates = useMemo(() => {
    const today = makeUtcDate(todayStr);
    const dow = today.getUTCDay();
    const sundayStart = new Date(today);
    sundayStart.setUTCDate(today.getUTCDate() - dow + weekOffset * 7);

    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(sundayStart);
      d.setUTCDate(sundayStart.getUTCDate() + i);
      return toYmdFromDate(d);
    });
  }, [weekOffset, todayStr]);

  const weekStats = useMemo(() => {
    let hours = 0;
    const days = new Set<string>();

    for (const date of weekDates) {
      const dayEvs = eventsByDate.get(date) ?? filteredEvents.filter((e) => e.date === date);
      const work = dayEvs.filter((e) => e.eventType === "work");
      if (work.length > 0) days.add(date);
      work.forEach((e) => {
        hours += workHours(e.workStart, e.workEnd);
      });
    }

    return { days: days.size, hours: Math.round(hours * 10) / 10 };
  }, [weekDates, eventsByDate, filteredEvents]);

  const dayEvents = useMemo(() => {
    if (!selectedDate) return [];
    return eventsByDate.get(selectedDate) ?? filteredEvents.filter((e) => e.date === selectedDate);
  }, [selectedDate, eventsByDate, filteredEvents]);

  const V = {
    bg: isDark ? "#0d0f14" : "#f9f8f5",
    card: isDark ? "#16191f" : "#ffffff",
    border: isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)",
    text: isDark ? "#f0ede8" : "#1a1a1a",
    muted: isDark ? "#9ba3b2" : "#6b7280",
    faint: isDark ? "#5c6375" : "#9ca3af",
    input: isDark ? "#1e2130" : "#f9fafb",
    accent: "#F5A623",
  };

  const btn = {
    padding: "8px 14px",
    borderRadius: 10,
    border: `1px solid ${V.border}`,
    background: V.card,
    color: V.text,
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
  } as const;

  const btnP = {
    ...btn,
    background: V.accent,
    border: "none",
    color: "#fff",
    fontWeight: 700,
  } as const;

  const inp = {
    padding: "8px 12px",
    borderRadius: 8,
    border: `1px solid ${V.border}`,
    background: V.input,
    color: V.text,
    fontSize: 13,
    outline: "none",
  } as const;

  const lbl = {
    display: "flex" as const,
    flexDirection: "column" as const,
    gap: 5,
    fontSize: 12,
    fontWeight: 700,
    color: V.muted,
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
  };

  if (loading) {
    return (
      <div
        style={{
          minHeight: "60vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: V.bg,
        }}
      >
        <div
          style={{
            width: 28,
            height: 28,
            border: `2.5px solid ${V.accent}`,
            borderTopColor: "transparent",
            borderRadius: "50%",
            animation: "spin 0.7s linear infinite",
          }}
        />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: V.bg,
        color: V.text,
        fontFamily: "system-ui,sans-serif",
      }}
    >
      <div
        style={{
          padding: "22px 24px 0",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>
            My <span style={{ color: V.accent, fontStyle: "italic" }}>Calendar</span>
          </div>
          <div style={{ fontSize: 13, color: V.faint, marginTop: 2 }}>
            Work hours · Events · Life log
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <div
            style={{
              display: "flex",
              borderRadius: 10,
              overflow: "hidden",
              border: `1px solid ${V.border}`,
            }}
          >
            {(["month", "week"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                style={{
                  padding: "7px 14px",
                  background: view === v ? V.accent : "transparent",
                  color: view === v ? "#fff" : V.muted,
                  border: "none",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 600,
                  textTransform: "capitalize",
                }}
              >
                {v}
              </button>
            ))}
          </div>
          <button
            style={btnP}
            onClick={() => {
              resetForm(selectedDate ?? todayStr);
              setShowAdd(true);
            }}
          >
            + Add event
          </button>
        </div>
      </div>

      {(error || toast) && (
        <div style={{ padding: "10px 24px 0" }}>
          {error && (
            <div
              style={{
                marginBottom: toast ? 8 : 0,
                background: isDark ? "#3a1a1a" : "#fef2f2",
                color: "#ef4444",
                border: "1px solid rgba(239,68,68,0.3)",
                padding: "10px 14px",
                borderRadius: 12,
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              {error}
            </div>
          )}
        </div>
      )}

      <div
        style={{
          padding: "8px 24px 0",
          display: "flex",
          gap: 8,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <div style={{ position: "relative" }} ref={filterMenuRef}>
          <button
            onClick={() => setShowFilterMenu((v) => !v)}
            style={{
              ...btn,
              padding: "6px 12px",
              fontSize: 12,
              display: "flex",
              alignItems: "center",
              gap: 6,
              borderColor: filterTypes.length > 0 ? V.accent : V.border,
              color: filterTypes.length > 0 ? V.accent : V.muted,
            }}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
            </svg>
            {filterTypes.length > 0
              ? `${filterTypes.length} filter${filterTypes.length > 1 ? "s" : ""}`
              : "Filter"}
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {showFilterMenu && (
            <div
              style={{
                position: "absolute",
                top: "calc(100% + 6px)",
                left: 0,
                background: V.card,
                border: `1px solid ${V.border}`,
                borderRadius: 12,
                padding: "8px 0",
                zIndex: 30,
                minWidth: 180,
                boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
              }}
            >
              {(
                [
                  ["work", "Work", "#3b82f6"],
                  ["birthday", "Anniversary", "#ec4899"],
                  ["event", "Events", "#8b5cf6"],
                  ["due_paid", "Due Tracker", "#16a34a"],
                  ["note", "Notes", "#6b7280"],
                ] as const
              ).map(([t, label, color]) => (
                <button
                  key={t}
                  onClick={() =>
                    setFilterTypes((p) =>
                      p.includes(t) ? p.filter((x) => x !== t) : [...p, t]
                    )
                  }
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    width: "100%",
                    padding: "8px 14px",
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    textAlign: "left",
                    color: filterTypes.includes(t) ? color : V.text,
                  }}
                >
                  <div
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: 4,
                      border: `2px solid ${color}`,
                      background: filterTypes.includes(t) ? color : "transparent",
                      flexShrink: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {filterTypes.includes(t) && (
                      <svg
                        width="8"
                        height="8"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#fff"
                        strokeWidth="3.5"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{label}</span>
                </button>
              ))}
              {filterTypes.length > 0 && (
                <>
                  <div style={{ height: 1, background: V.border, margin: "6px 0" }} />
                  <button
                    onClick={() => {
                      setFilterTypes([]);
                      setShowFilterMenu(false);
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      width: "100%",
                      padding: "7px 14px",
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      color: V.faint,
                      fontSize: 12,
                    }}
                  >
                    Clear all filters
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {filterTypes.length > 0 &&
          filterTypes.map((t) => {
            const labels: Record<string, string> = {
              work: "Work",
              birthday: "Anniversary",
              event: "Events",
              due_paid: "Due Tracker",
              note: "Notes",
            };
            const colors: Record<string, string> = {
              work: "#3b82f6",
              birthday: "#ec4899",
              event: "#8b5cf6",
              due_paid: "#16a34a",
              note: "#6b7280",
            };
            return (
              <span
                key={t}
                style={{
                  padding: "3px 10px",
                  borderRadius: 999,
                  fontSize: 11,
                  fontWeight: 700,
                  background: `${colors[t]}20`,
                  color: colors[t],
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                {labels[t]}
                <button
                  onClick={() => setFilterTypes((p) => p.filter((x) => x !== t))}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "inherit",
                    padding: 0,
                    fontSize: 12,
                    lineHeight: 1,
                  }}
                >
                  ×
                </button>
              </span>
            );
          })}

        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search events…"
          style={{
            padding: "5px 12px",
            borderRadius: 999,
            border: `1px solid ${V.border}`,
            background: V.input,
            color: V.text,
            fontSize: 12,
            outline: "none",
            width: 170,
          }}
        />
      </div>

      <div style={{ padding: "10px 24px 0", display: "flex", gap: 10, flexWrap: "wrap" }}>
        {[
          { label: "Work days", value: monthStats.days, color: "#3b82f6" },
          { label: "Work hours", value: `${monthStats.hours}h`, color: "#3b82f6" },
          { label: "Extra shifts", value: monthStats.extra, color: "#ef4444" },
          { label: "Leaves", value: monthStats.leaves, color: "#22c55e" },
        ].map((s) => (
          <div
            key={s.label}
            style={{
              background: V.card,
              border: `1px solid ${V.border}`,
              borderRadius: 10,
              padding: "7px 13px",
              display: "flex",
              gap: 7,
              alignItems: "center",
            }}
          >
            <span style={{ fontSize: 15, fontWeight: 800, color: s.color }}>{s.value}</span>
            <span style={{ fontSize: 11, color: V.faint }}>{s.label}</span>
          </div>
        ))}
      </div>

      {view === "month" && (
        <>
          <div style={{ padding: "12px 24px 0", display: "flex", alignItems: "center", gap: 12 }}>
            <button style={btn} onClick={() => changeMonth(prevMonth(month))}>‹</button>
            <span style={{ fontSize: 17, fontWeight: 700, minWidth: 180, textAlign: "center" }}>
              {fmtMonth(month, timezone)}
            </span>
            <button style={btn} onClick={() => changeMonth(nextMonth(month))}>›</button>
            <button style={{ ...btn, fontSize: 12, padding: "6px 12px" }} onClick={() => changeMonth(getMonthInTz(timezone))}>
              Today
            </button>
          </div>

          <div style={{ padding: "12px 24px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", marginBottom: 4 }}>
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <div
                  key={d}
                  style={{
                    textAlign: "center",
                    fontSize: 10,
                    fontWeight: 700,
                    color: V.faint,
                    padding: "4px 0",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  {d}
                </div>
              ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2 }}>
              {Array.from({ length: firstDay }).map((_, i) => (
                <div key={`e${i}`} />
              ))}

              {Array.from({ length: totalDays }).map((_, i) => {
                const day = i + 1;
                const dateStr = `${month}-${String(day).padStart(2, "0")}`;
                const dayEvs = eventsByDate.get(dateStr) ?? [];
                const isToday = dateStr === todayStr;
                const isSel = dateStr === selectedDate;
                const wH = dayEvs
                  .filter((e) => e.eventType === "work")
                  .reduce((s, e) => s + workHours(e.workStart, e.workEnd), 0);

                const typeSummary = {
                  work: dayEvs.filter((e) => e.eventType === "work").length,
                  birthday: dayEvs.filter((e) => e.eventType === "birthday").length,
                  event: dayEvs.filter((e) => e.eventType === "event").length,
                  note: dayEvs.filter((e) => e.eventType === "note").length,
                };

                return (
                  <div
                    key={day}
                    onClick={() => setSelectedDate(isSel ? null : dateStr)}
                    style={{
                      minHeight: 78,
                      borderRadius: 9,
                      border: `1px solid ${isSel ? "rgba(245,166,35,0.6)" : V.border}`,
                      background: isToday
                        ? `${V.accent}15`
                        : isSel
                        ? "rgba(245,166,35,0.05)"
                        : V.card,
                      cursor: "pointer",
                      padding: "5px 5px",
                      transition: "all 0.12s",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        marginBottom: 2,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: isToday ? 800 : 600,
                          color: isToday ? V.accent : V.text,
                          width: 20,
                          height: 20,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          borderRadius: "50%",
                          background: isToday ? `${V.accent}20` : "transparent",
                        }}
                      >
                        {day}
                      </span>

                      <div style={{ display: "flex", flexDirection: "column", gap: 2, alignItems: "flex-end" }}>
                        {wH > 0 && (
                          <span
                            style={{
                              fontSize: 9,
                              fontWeight: 700,
                              padding: "1px 4px",
                              borderRadius: 999,
                              background: "rgba(59,130,246,0.15)",
                              color: "#3b82f6",
                            }}
                          >
                            {wH.toFixed(0)}h
                          </span>
                        )}
                        {dayEvs.length > 0 && (
                          <span
                            style={{
                              fontSize: 9,
                              fontWeight: 700,
                              padding: "1px 5px",
                              borderRadius: 999,
                              background: "rgba(107,114,128,0.15)",
                              color: V.faint,
                            }}
                          >
                            {dayEvs.length}
                          </span>
                        )}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 4, marginBottom: 4, flexWrap: "wrap" }}>
                      {typeSummary.work > 0 && <span title="Work">💼</span>}
                      {typeSummary.birthday > 0 && <span title="Anniversary">🎂</span>}
                      {typeSummary.event > 0 && <span title="Event">📌</span>}
                      {typeSummary.note > 0 && <span title="Note">📝</span>}
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                      {dayEvs.slice(0, 2).map((ev) => (
                        <div
                          key={ev.id}
                          style={{
                            fontSize: 9,
                            fontWeight: 600,
                            padding: "1px 4px",
                            borderRadius: 3,
                            background: `${ev.color}20`,
                            color: ev.color,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {displayTitle(ev)}
                        </div>
                      ))}
                      {dayEvs.length > 2 && (
                        <div style={{ fontSize: 9, color: V.faint }}>+{dayEvs.length - 2}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {view === "week" && (
        <div style={{ padding: "12px 24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
            <button style={btn} onClick={() => setWeekOffset((p) => p - 1)}>‹</button>
            <span style={{ fontSize: 15, fontWeight: 700, flex: 1, textAlign: "center" }}>
              {new Date(`${weekDates[0]}T12:00:00Z`).toLocaleDateString("en-AE", {
                day: "numeric",
                month: "short",
                timeZone: timezone,
              })}{" "}
              –{" "}
              {new Date(`${weekDates[6]}T12:00:00Z`).toLocaleDateString("en-AE", {
                day: "numeric",
                month: "short",
                year: "numeric",
                timeZone: timezone,
              })}
            </span>
            <button style={btn} onClick={() => setWeekOffset((p) => p + 1)}>›</button>
            <button style={{ ...btn, fontSize: 12, padding: "6px 12px" }} onClick={() => setWeekOffset(0)}>
              This week
            </button>
          </div>

          <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
            {[
              { label: "Days worked", value: weekStats.days, color: "#3b82f6" },
              { label: "Hours", value: `${weekStats.hours}h`, color: "#3b82f6" },
            ].map((s) => (
              <div
                key={s.label}
                style={{
                  background: V.card,
                  border: `1px solid ${V.border}`,
                  borderRadius: 10,
                  padding: "8px 14px",
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                }}
              >
                <span style={{ fontSize: 16, fontWeight: 800, color: s.color }}>{s.value}</span>
                <span style={{ fontSize: 12, color: V.faint }}>{s.label}</span>
              </div>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 6 }}>
            {weekDates.map((dateStr) => {
              const dayEvs = eventsByDate.get(dateStr) ?? filteredEvents.filter((e) => e.date === dateStr);
              const isToday = dateStr === todayStr;
              const isSel = dateStr === selectedDate;
              const d = new Date(`${dateStr}T12:00:00Z`);
              const wH = dayEvs
                .filter((e) => e.eventType === "work")
                .reduce((s, e) => s + workHours(e.workStart, e.workEnd), 0);

              return (
                <div
                  key={dateStr}
                  onClick={() => setSelectedDate(isSel ? null : dateStr)}
                  style={{
                    background: isSel ? "rgba(245,166,35,0.05)" : V.card,
                    border: `1px solid ${
                      isSel
                        ? "rgba(245,166,35,0.5)"
                        : isToday
                        ? "rgba(245,166,35,0.3)"
                        : V.border
                    }`,
                    borderRadius: 12,
                    padding: "10px 10px",
                    cursor: "pointer",
                    minHeight: 120,
                  }}
                >
                  <div style={{ marginBottom: 6 }}>
                    <div style={{ fontSize: 11, color: V.faint, fontWeight: 600 }}>
                      {d.toLocaleDateString("en-AE", {
                        weekday: "short",
                        timeZone: timezone,
                      })}
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: isToday ? V.accent : V.text }}>
                      {d.toLocaleDateString("en-AE", {
                        day: "numeric",
                        timeZone: timezone,
                      })}
                    </div>
                    {wH > 0 && (
                      <div style={{ fontSize: 10, color: "#3b82f6", fontWeight: 700 }}>
                        {wH.toFixed(1)}h
                      </div>
                    )}
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    {dayEvs.map((ev) => (
                      <div
                        key={ev.id}
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          padding: "2px 6px",
                          borderRadius: 5,
                          background: `${ev.color}20`,
                          color: ev.color,
                          lineHeight: 1.4,
                        }}
                      >
                        {displayTitle(ev)}
                        {ev.eventType === "work" &&
                          ev.workStart &&
                          !SHIFTS[(getEventMeta(ev).shiftName || legacyShiftNameFromTitle(ev.title) || "Custom") as ShiftKey]?.noTime && (
                            <span style={{ color: V.faint, marginLeft: 4 }}>
                              {fmt12(ev.workStart)}–{fmt12(ev.workEnd)}
                            </span>
                          )}
                      </div>
                    ))}
                    {dayEvs.length === 0 && <div style={{ fontSize: 10, color: V.faint }}>—</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {selectedDate && (
        <div
          ref={selectedPanelRef}
          style={{
            margin: "0 24px 16px",
            background: V.card,
            border: `1px solid ${V.border}`,
            borderRadius: 14,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "11px 16px",
              borderBottom: `1px solid ${V.border}`,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div style={{ fontWeight: 800, fontSize: 14 }}>
              {new Date(`${selectedDate}T12:00:00Z`).toLocaleDateString("en-AE", {
                weekday: "long",
                day: "numeric",
                month: "long",
                timeZone: timezone,
              })}
            </div>
            <button
              style={{ ...btnP, padding: "5px 12px", fontSize: 12 }}
              onClick={() => {
                resetForm(selectedDate);
                setShowAdd(true);
              }}
            >
              + Add
            </button>
          </div>

          {dayEvents.length === 0 ? (
            <div style={{ padding: "16px", color: V.faint, fontSize: 13, textAlign: "center" }}>
              No events · Click + Add
            </div>
          ) : (
            dayEvents.map((ev) => (
              <div
                key={ev.id}
                style={{
                  padding: "11px 16px",
                  borderBottom: `1px solid ${V.border}`,
                  display: "flex",
                  gap: 10,
                  alignItems: "flex-start",
                }}
              >
                <div
                  style={{
                    width: 4,
                    alignSelf: "stretch",
                    borderRadius: 2,
                    background: ev.color,
                    flexShrink: 0,
                  }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ fontSize: 14, fontWeight: 700 }}>{displayTitle(ev)}</span>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: "2px 8px",
                        borderRadius: 999,
                        background: `${ev.color}20`,
                        color: ev.color,
                      }}
                    >
                      {EVENT_LABELS[ev.eventType] ?? ev.eventType}
                    </span>
                    {ev.isRecurring && (
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: "2px 8px",
                          borderRadius: 999,
                          background: "rgba(99,102,241,0.15)",
                          color: "#6366f1",
                        }}
                      >
                        {ev.recurType}
                      </span>
                    )}
                  </div>

                  {ev.eventType === "work" && ev.workStart && ev.workEnd && (
                    <div style={{ fontSize: 12, color: V.muted, marginTop: 2 }}>
                      ⏰ {fmt12(ev.workStart)}–{fmt12(ev.workEnd)} ·{" "}
                      {workHours(ev.workStart, ev.workEnd).toFixed(1)}h
                    </div>
                  )}

                  {getPlainNotes(ev) && (
                    <div style={{ fontSize: 12, color: V.muted, marginTop: 2 }}>
                      {getPlainNotes(ev)}
                    </div>
                  )}
                </div>

                {ev.sourceModule === "manual" && (
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      onClick={() => openEditEvent(ev)}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        color: V.faint,
                        fontSize: 14,
                      }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => deleteEvent(ev.id)}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        color: "#ef4444",
                        fontSize: 18,
                        lineHeight: 1,
                      }}
                    >
                      ×
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {Object.keys(monthStats.shiftCounts).length > 0 && (
        <div
          style={{
            margin: "0 24px 24px",
            background: V.card,
            border: `1px solid ${V.border}`,
            borderRadius: 14,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "10px 16px",
              borderBottom: `1px solid ${V.border}`,
              fontSize: 11,
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: V.faint,
              background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
            }}
          >
            Shift breakdown — {fmtMonth(month, timezone)}
          </div>
          <div style={{ padding: "12px 16px", display: "flex", flexWrap: "wrap", gap: 10 }}>
            {Object.entries(monthStats.shiftCounts)
              .sort((a, b) => b[1] - a[1])
              .map(([shift, count]) => {
                const color = SHIFT_COLORS[shift as ShiftKey] ?? "#6b7280";
                return (
                  <div
                    key={shift}
                    style={{
                      padding: "6px 14px",
                      borderRadius: 999,
                      background: `${color}15`,
                      border: `1px solid ${color}30`,
                      display: "flex",
                      gap: 6,
                      alignItems: "center",
                    }}
                  >
                    <span style={{ fontSize: 13, fontWeight: 700, color }}>{count}×</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: V.text }}>{shift}</span>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {showAdd && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            zIndex: 50,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            padding: "40px 16px 24px",
            overflowY: "auto",
          }}
          onClick={() => {
            setShowAdd(false);
            setError("");
          }}
        >
          <div
            style={{
              background: V.card,
              border: `1px solid ${V.border}`,
              borderRadius: 18,
              width: "min(620px,100%)",
              maxHeight: "92vh",
              overflow: "auto",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                padding: "18px 20px",
                borderBottom: `1px solid ${V.border}`,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div style={{ fontSize: 18, fontWeight: 800 }}>
                {editingEvent ? "Edit event" : "Add event"}
              </div>
              <button
                style={btn}
                onClick={() => {
                  setShowAdd(false);
                  setError("");
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
              {error && (
                <div
                  style={{
                    background: isDark ? "#3a1a1a" : "#fef2f2",
                    color: "#ef4444",
                    border: "1px solid rgba(239,68,68,0.3)",
                    padding: "10px 14px",
                    borderRadius: 12,
                    fontSize: 13,
                    fontWeight: 700,
                  }}
                >
                  {error}
                </div>
              )}

              <div style={lbl}>
                Type
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {(["work", "event", "birthday", "note"] as EventType[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => {
                        setAddType(t);
                        if (!editingEvent) {
                          setAddRecurType(t === "birthday" ? "yearly" : "none");
                        }
                      }}
                      style={{
                        padding: "6px 14px",
                        borderRadius: 999,
                        border: "none",
                        cursor: "pointer",
                        fontSize: 12,
                        fontWeight: 700,
                        background: addType === t ? EVENT_COLORS[t] : `${EVENT_COLORS[t]}20`,
                        color: addType === t ? "#fff" : EVENT_COLORS[t],
                      }}
                    >
                      {EVENT_LABELS[t]}
                    </button>
                  ))}
                </div>
              </div>

              {addType === "birthday" && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <label style={lbl}>
                    Type
                    <select
                      style={inp}
                      value={addAnnivType}
                      onChange={(e) => setAddAnnivType(e.target.value)}
                    >
                      <option>Birthday</option>
                      <option>Wedding</option>
                      <option>Work</option>
                      <option>Custom</option>
                    </select>
                  </label>
                  <label style={lbl}>
                    Name
                    <input
                      style={inp}
                      value={addAnnivName}
                      onChange={(e) => setAddAnnivName(e.target.value)}
                      placeholder="e.g. John"
                    />
                  </label>
                </div>
              )}

              {addType === "work" && (
                <div style={lbl}>
                  Shift
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                    {(Object.keys(SHIFTS) as ShiftKey[]).map((s) => {
                      const color = SHIFT_COLORS[s];
                      return (
                        <button
                          key={s}
                          onClick={() => selectShift(s)}
                          style={{
                            padding: "5px 11px",
                            borderRadius: 8,
                            border: `1px solid ${addShift === s ? color : V.border}`,
                            cursor: "pointer",
                            fontSize: 11,
                            fontWeight: 600,
                            background: addShift === s ? `${color}20` : V.input,
                            color: addShift === s ? color : V.text,
                          }}
                        >
                          {s}
                        </button>
                      );
                    })}
                  </div>

                  {!SHIFTS[addShift].noTime && (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 6 }}>
                      <label style={lbl}>
                        Start
                        <input
                          type="time"
                          style={inp}
                          value={addStart}
                          onChange={(e) => setAddStart(e.target.value)}
                        />
                      </label>
                      <label style={lbl}>
                        End
                        <input
                          type="time"
                          style={inp}
                          value={addEnd}
                          onChange={(e) => setAddEnd(e.target.value)}
                        />
                      </label>
                    </div>
                  )}

                  {!SHIFTS[addShift].noTime && (
                    <div style={{ fontSize: 11, color: V.faint }}>
                      ⏱ {workHours(addStart, addEnd).toFixed(1)} hours
                    </div>
                  )}
                </div>
              )}

              <label style={lbl}>
                {addType === "work"
                  ? "Title (optional — defaults to shift name)"
                  : "Title"}
                <input
                  style={{ ...inp, width: "100%", boxSizing: "border-box" as const }}
                  value={addTitle}
                  onChange={(e) => setAddTitle(e.target.value)}
                  placeholder={
                    addType === "work"
                      ? addShift
                      : addType === "birthday"
                      ? `${addAnnivType} name`
                      : "Event title"
                  }
                />
              </label>

              <div style={lbl}>
                Repeat
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {(["none", "weekly", "monthly", "yearly"] as RecurType[]).map((r) => (
                    <button
                      key={r}
                      onClick={() => setAddRecurType(r)}
                      disabled={!!editingEvent && editScope === "future"}
                      style={{
                        padding: "6px 12px",
                        borderRadius: 999,
                        border: `1px solid ${addRecurType === r ? V.accent : V.border}`,
                        background: addRecurType === r ? `${V.accent}20` : V.input,
                        color: addRecurType === r ? V.accent : V.text,
                        cursor: "pointer",
                        fontSize: 12,
                        fontWeight: 700,
                        opacity: editingEvent && editScope === "future" ? 0.7 : 1,
                      }}
                    >
                      {r}
                    </button>
                  ))}
                </div>
                {editingEvent && editScope === "future" && (
                  <div style={{ fontSize: 11, color: V.faint }}>
                    Recurrence mode is locked while editing future entries.
                  </div>
                )}
              </div>

              {editingEvent && editingEvent.isRecurring && (
                <div style={lbl}>
                  Edit scope
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {(["single", "future"] as EditScope[]).map((scope) => (
                      <button
                        key={scope}
                        onClick={() => setEditScope(scope)}
                        style={{
                          padding: "6px 12px",
                          borderRadius: 999,
                          border: `1px solid ${editScope === scope ? V.accent : V.border}`,
                          background: editScope === scope ? `${V.accent}20` : V.input,
                          color: editScope === scope ? V.accent : V.text,
                          cursor: "pointer",
                          fontSize: 12,
                          fontWeight: 700,
                        }}
                      >
                        {scope === "single" ? "This event only" : "This & future"}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {addType === "birthday" ? (
                <label style={lbl}>
                  Date
                  <input
                    type="date"
                    style={inp}
                    value={addDateFrom}
                    onChange={(e) => {
                      setAddDateFrom(e.target.value);
                      setAddDateTo(e.target.value);
                    }}
                  />
                </label>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <label style={lbl}>
                    From
                    <input
                      type="date"
                      style={inp}
                      value={addDateFrom}
                      onChange={(e) => {
                        setAddDateFrom(e.target.value);
                        if (e.target.value > addDateTo) setAddDateTo(e.target.value);
                      }}
                    />
                  </label>
                  <label style={lbl}>
                    To
                    <input
                      type="date"
                      style={inp}
                      value={addDateTo}
                      min={addDateFrom}
                      onChange={(e) => setAddDateTo(e.target.value)}
                      disabled={addRecurType !== "none"}
                    />
                  </label>
                  {addDateFrom !== addDateTo && addRecurType === "none" && (
                    <div
                      style={{
                        gridColumn: "1/-1",
                        fontSize: 12,
                        color: "#3b82f6",
                        fontWeight: 600,
                        padding: "6px 10px",
                        background: "rgba(59,130,246,0.08)",
                        borderRadius: 8,
                      }}
                    >
                      Will add {datesBetween(addDateFrom, addDateTo).length} entries
                    </div>
                  )}
                  {addRecurType !== "none" && (
                    <div
                      style={{
                        gridColumn: "1/-1",
                        fontSize: 12,
                        color: V.faint,
                        fontWeight: 600,
                        padding: "6px 10px",
                        background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)",
                        borderRadius: 8,
                      }}
                    >
                      Recurring events use a single start date and generate future entries automatically.
                    </div>
                  )}
                </div>
              )}

              <label style={lbl}>
                Notes (optional)
                <textarea
                  style={{ ...inp, resize: "vertical" as const, minHeight: 60 }}
                  value={addNotes}
                  onChange={(e) => setAddNotes(e.target.value)}
                />
              </label>
            </div>

            <div
              style={{
                padding: "0 20px 20px",
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
              }}
            >
              <button
                style={btn}
                onClick={() => {
                  setShowAdd(false);
                  setError("");
                }}
              >
                Cancel
              </button>
              <button style={btnP} onClick={addOrUpdateEvent} disabled={addSaving}>
                {addSaving
                  ? editingEvent
                    ? "Saving…"
                    : "Saving…"
                  : editingEvent
                  ? editScope === "future"
                    ? "Save future events"
                    : "Save changes"
                  : addDateFrom !== addDateTo && addRecurType === "none"
                  ? `Add ${datesBetween(addDateFrom, addDateTo).length} entries`
                  : addRecurType !== "none"
                  ? `Create ${addRecurType} series`
                  : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 20,
            right: 16,
            background: isDark ? "#1a3a2a" : "#f0fdf4",
            color: "#16a34a",
            border: "1px solid rgba(22,163,74,0.3)",
            padding: "12px 18px",
            borderRadius: 12,
            fontSize: 13,
            fontWeight: 700,
            boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
            zIndex: 200,
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}