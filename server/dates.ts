// Calendar dates in the user's own time zone. Using UTC for "today" puts a
// US evening shot on tomorrow's date and fires 9:00 reminders overnight.

export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || tz.length === 0 || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

// Local date (YYYY-MM-DD), time (HH:MM) and weekday (0 = Sunday) at `at` in `tz`.
export function zonedParts(tz: string, at: Date = new Date()): { date: string; hhmm: string; weekday: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
      weekday: "short",
    }).formatToParts(at).map(p => [p.type, p.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hhmm: `${parts.hour}:${parts.minute}`,
    weekday: WEEKDAYS[parts.weekday],
  };
}

export function todayIn(tz: string, at: Date = new Date()): string {
  return zonedParts(tz, at).date;
}

// Adds whole days to a YYYY-MM-DD date (calendar arithmetic, no time zone).
export function shiftDate(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Whether a shot reminder is due right now for this user: reminders on, it's
// their injection weekday and their reminder minute, all on their own clock.
// Returns the user's local date (for de-duplication) when due, else null.
export function reminderDueDate(
  user: { reminderEnabled: boolean | null; reminderTime: string | null; glp1InjectionDay: string | null; timezone: string | null },
  now: Date,
): string | null {
  if (!user.reminderEnabled || !user.reminderTime || !user.glp1InjectionDay) return null;
  const local = zonedParts(isValidTimeZone(user.timezone) ? user.timezone : "UTC", now);
  if (WEEKDAYS[user.glp1InjectionDay] !== local.weekday) return null;
  return user.reminderTime === local.hhmm ? local.date : null;
}
