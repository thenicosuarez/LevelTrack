// Shot adherence: the share of recent dosing periods in which the user logged
// a shot. A weekly injector who never misses scores 100%, not 4/30.

const INTERVAL_DAYS: Record<string, number> = {
  daily: 1,
  weekly: 7,
  biweekly: 14,
};

function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso}T00:00:00Z`);
  return Math.round((to - from) / 86_400_000);
}

export function computeShotAdherence(opts: {
  shotDates: string[];            // YYYY-MM-DD of each logged GLP-1 shot
  frequency: string | null | undefined;
  today: string;                  // YYYY-MM-DD
  startDate?: string | null;      // when the user began their medication, if known
  windowDays?: number;
}): number {
  const { shotDates, frequency, today, startDate, windowDays = 30 } = opts;
  const interval = INTERVAL_DAYS[frequency ?? ""] ?? 7;

  // Days-ago of each distinct past shot (0 = today).
  const shotAges = Array.from(new Set(shotDates.filter(d => d <= today)))
    .map(d => daysBetween(d, today));
  const startAge = startDate && startDate <= today ? daysBetween(startDate, today) : -1;
  const firstAge = Math.max(startAge, ...shotAges);
  if (firstAge < 0) return 0;

  // The current period isn't missed while the next shot is merely due today
  // (last shot exactly one interval ago): measure up to yesterday instead.
  const lastAge = shotAges.length ? Math.min(...shotAges) : Infinity;
  const anchor = lastAge === interval ? 1 : 0;

  // Count whole periods back from the anchor, within the window and not
  // before the user started, so new users aren't penalised.
  const windowLen = Math.min(windowDays, firstAge + 1) - anchor;
  const periods = Math.max(1, Math.floor(windowLen / interval));

  let covered = 0;
  for (let p = 0; p < periods; p++) {
    const newest = anchor + p * interval;
    const oldest = newest + interval - 1;
    if (shotAges.some(age => age >= newest && age <= oldest)) covered++;
  }
  return Math.round((covered / periods) * 100);
}
