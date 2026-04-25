import { format } from "date-fns";

export function fmtDate(d: Date | string) {
  return format(new Date(d), "EEE, MMM d");
}

export function fmtTime(d: Date | string) {
  return format(new Date(d), "h:mm a");
}

export function fmtDateTime(d: Date | string) {
  return format(new Date(d), "MMM d, h:mm a");
}

export function durationHours(start: Date | string, end: Date | string | null) {
  if (!end) return 0;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Math.max(0, ms / 3_600_000);
}

export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
