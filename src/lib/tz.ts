/**
 * Timezone-aware helpers — wrap date-fns + date-fns-tz so any date
 * calculation that's "today" / "this week" for a tenant uses the tenant's
 * configured timezone instead of the server's (UTC on Vercel).
 *
 * Usage:
 *   const dayStart = tzStartOfDay(new Date(), tenant.timezone);
 *   const display = tzFormat(date, "h:mma", tenant.timezone);
 *
 * date-fns-tz strategy:
 *   1. toZonedTime(utcDate, tz)  — gets a Date whose components (when read
 *      with date-fns's local accessors) match the tz wall clock.
 *   2. Apply date-fns boundary fn (startOfDay, etc.) to the zoned Date.
 *   3. fromZonedTime(zonedResult, tz) — convert back to a real UTC Date
 *      that represents the same instant as the boundary in the tz.
 */

import { formatInTimeZone, toZonedTime, fromZonedTime } from "date-fns-tz";
import {
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  addDays,
  subDays,
} from "date-fns";

export const DEFAULT_TZ = "America/New_York";

export function tzStartOfDay(d: Date, tz: string): Date {
  return fromZonedTime(startOfDay(toZonedTime(d, tz)), tz);
}

export function tzEndOfDay(d: Date, tz: string): Date {
  return fromZonedTime(endOfDay(toZonedTime(d, tz)), tz);
}

export function tzStartOfWeek(
  d: Date,
  tz: string,
  opts: { weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6 } = { weekStartsOn: 1 },
): Date {
  return fromZonedTime(startOfWeek(toZonedTime(d, tz), opts), tz);
}

export function tzEndOfWeek(
  d: Date,
  tz: string,
  opts: { weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6 } = { weekStartsOn: 1 },
): Date {
  return fromZonedTime(endOfWeek(toZonedTime(d, tz), opts), tz);
}

export function tzAddDays(d: Date, n: number, tz: string): Date {
  return fromZonedTime(addDays(toZonedTime(d, tz), n), tz);
}

export function tzSubDays(d: Date, n: number, tz: string): Date {
  return fromZonedTime(subDays(toZonedTime(d, tz), n), tz);
}

export function tzSubWeeks(d: Date, n: number, tz: string): Date {
  return tzSubDays(d, n * 7, tz);
}

/**
 * Format a Date using date-fns format tokens in the given timezone.
 *   tzFormat(now, "h:mma", "America/New_York") -> "4:08PM"
 *   tzFormat(now, "EEEE, MMMM d", "America/New_York") -> "Friday, May 8"
 */
export function tzFormat(d: Date, fmt: string, tz: string): string {
  return formatInTimeZone(d, tz, fmt);
}

/**
 * YYYY-MM-DD string for the date in the given tz. Used for URL params
 * and for grouping-by-day keys.
 */
export function tzYmd(d: Date, tz: string): string {
  return tzFormat(d, "yyyy-MM-dd", tz);
}
