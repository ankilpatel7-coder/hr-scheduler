/**
 * Geofencing helpers for clock-entry / location distance comparisons.
 *
 * `haversineMeters` is duplicated here (also exists in @/lib/utils) so
 * server-only code in /lib doesn't depend on the broader utils file.
 */

export function haversineMeters(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const R = 6_371_000; // earth radius in meters
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export const METERS_PER_MILE = 1609.344;

export function metersToMiles(m: number): number {
  return m / METERS_PER_MILE;
}

export type LocationLike = {
  id: string;
  name: string;
  lat: number | null;
  lng: number | null;
  geofenceRadiusMeters: number;
};

export type GeofenceResult = {
  closestLocation: LocationLike | null;
  distanceMeters: number | null;
  distanceMiles: number | null;
  isInside: boolean | null; // null when no usable location data exists
};

/**
 * Given a clock-entry coord and a list of the tenant's active locations,
 * find the closest one and report whether it's inside that location's
 * geofence radius. Skips locations missing lat/lng.
 *
 * Returns isInside=null when:
 *   - the entry has no lat/lng
 *   - the tenant has no geocoded locations
 */
export function evaluateGeofence(
  entry: { lat?: number | null; lng?: number | null },
  locations: LocationLike[],
): GeofenceResult {
  if (entry.lat == null || entry.lng == null) {
    return { closestLocation: null, distanceMeters: null, distanceMiles: null, isInside: null };
  }
  let closest: LocationLike | null = null;
  let closestMeters = Number.POSITIVE_INFINITY;
  for (const loc of locations) {
    if (loc.lat == null || loc.lng == null) continue;
    const m = haversineMeters(entry.lat, entry.lng, loc.lat, loc.lng);
    if (m < closestMeters) {
      closest = loc;
      closestMeters = m;
    }
  }
  if (!closest) {
    return { closestLocation: null, distanceMeters: null, distanceMiles: null, isInside: null };
  }
  return {
    closestLocation: closest,
    distanceMeters: closestMeters,
    distanceMiles: metersToMiles(closestMeters),
    isInside: closestMeters <= closest.geofenceRadiusMeters,
  };
}
