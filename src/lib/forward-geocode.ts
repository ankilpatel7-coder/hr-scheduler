/**
 * Forward geocoding — turn a street address into lat/lng using
 * OpenStreetMap Nominatim. Free, no API key, rate-limited to 1 req/sec
 * per Nominatim usage policy:
 *   https://operations.osmfoundation.org/policies/nominatim/
 *
 * We only call this server-side from admin actions (Location create/edit),
 * so request volume is naturally low.
 *
 * Used for store-location geofencing in timesheets.
 */

const USER_AGENT = "Shiftwork/1.0 (https://github.com/ankilpatel7-coder/hr-scheduler)";

export type GeocodeResult = {
  lat: number;
  lng: number;
  displayName: string | null;
};

export async function geocodeAddress(parts: {
  address?: string | null;
  addressLine1?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}): Promise<GeocodeResult | null> {
  // Build a single search string from the structured parts we have.
  // Nominatim handles loose formatting reasonably well for US addresses.
  const tokens = [
    parts.addressLine1 ?? parts.address ?? "",
    parts.city ?? "",
    parts.state ?? "",
    parts.zip ?? "",
    "USA",
  ]
    .map((t) => t.trim())
    .filter(Boolean);

  const q = tokens.join(", ");
  if (q.length < 5) return null;

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&addressdetails=0&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      // Don't cache — addresses are stored once at admin time
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{ lat: string; lon: string; display_name?: string }>;
    if (!Array.isArray(data) || data.length === 0) return null;
    const lat = parseFloat(data[0].lat);
    const lng = parseFloat(data[0].lon);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
    return { lat, lng, displayName: data[0].display_name ?? null };
  } catch {
    return null;
  }
}
