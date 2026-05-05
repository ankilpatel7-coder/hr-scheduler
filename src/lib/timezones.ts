/**
 * Curated list of US-focused timezones for tenant configuration.
 *
 * Stored as IANA tz identifiers (e.g. "America/New_York") which are stable
 * and DST-aware. The display label is what super-admins see in the dropdown.
 *
 * Add more zones here as new tenants need them — no schema change required.
 */

export const TIMEZONES: { value: string; label: string }[] = [
  { value: "America/New_York",        label: "Eastern — New York / Kentucky / Florida" },
  { value: "America/Chicago",         label: "Central — Chicago / Texas / Tennessee" },
  { value: "America/Denver",          label: "Mountain — Denver / Colorado / Utah" },
  { value: "America/Phoenix",         label: "Mountain (no DST) — Arizona" },
  { value: "America/Los_Angeles",     label: "Pacific — Los Angeles / California / Washington" },
  { value: "America/Anchorage",       label: "Alaska — Anchorage" },
  { value: "Pacific/Honolulu",        label: "Hawaii — Honolulu" },
  { value: "America/Indiana/Indianapolis", label: "Eastern — Indianapolis (most of Indiana)" },
  { value: "America/Detroit",         label: "Eastern — Detroit / Michigan" },
  { value: "America/Boise",           label: "Mountain — Boise (S. Idaho)" },
  { value: "America/Puerto_Rico",     label: "Atlantic — Puerto Rico (no DST)" },
  { value: "UTC",                     label: "UTC (server time)" },
];

export const DEFAULT_TIMEZONE = "America/New_York";

export function isValidTimezone(tz: string): boolean {
  return TIMEZONES.some((t) => t.value === tz);
}
