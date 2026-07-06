const JST_TIME_ZONE = "Asia/Tokyo";

const jstDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: JST_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Returns the JST calendar date (YYYY-MM-DD) for the given instant. */
export function jstDateString(date: Date = new Date()): string {
  return jstDateFormatter.format(date);
}

/** Returns today's JST calendar date (YYYY-MM-DD). */
export function todayJST(): string {
  return jstDateString(new Date());
}

/** Adds (or subtracts) days from a YYYY-MM-DD date string, staying in calendar-date arithmetic. */
export function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Returns the last `days` JST calendar dates ending at (and including) `endDateStr`, oldest first. */
export function recentDateStrings(days: number, endDateStr: string = todayJST()): string[] {
  return Array.from({ length: days }, (_, i) => addDays(endDateStr, -(days - 1 - i)));
}
