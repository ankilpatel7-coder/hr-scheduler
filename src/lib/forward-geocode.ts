/**
 * Forward geocoding — turn a street address into lat/lng using
 * OpenStreetMap Nominatim. Free, no API key, rate-limited to 1 req/sec
 * per Nominatim usage policy:
 *   https://operations.osmfoundation.org/policies/nominatim/
 *
 * Strategy: try multiple lookup approaches in order, returning the first
 * match. This handles the cases where Nominatim is finicky:
 *
 *   1. Structured query (street + city + state + zip) — best for major addresses
 *   2. Free-form "address, city, state, zip, USA"
 *   3. Free-form with abbreviations expanded ("Ext" → "Extension", etc.)
 *   4. City + state + zip (no street) — gets neighborhood center
 *   5. ZIP + country only — last resort, gets ZIP centroid
 *
 * For small unincorporated communities (e.g., "Ferguson, KY 42533") fall-
 * back to ZIP centroid is often the most reliable result.
 */

const USER_AGENT = "Shiftwork/1.0 (https://github.com/ankilpatel7-coder/hr-scheduler)";

export type GeocodeResult = {
  lat: number;
  lng: number;
  displayName: string | null;
  precision: "exact" | "city" | "zip"; // how confident we are in the match
};

async function tryQuery(
  params: URLSearchParams,
  precision: "exact" | "city" | "zip",
): Promise<GeocodeResult | null> {
  params.set("format", "json");
  params.set("limit", "1");
  params.set("addressdetails", "0");
  try {
    const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`;
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{
      lat: string;
      lon: string;
      display_name?: string;
    }>;
    if (!Array.isArray(data) || data.length === 0) return null;
    const lat = parseFloat(data[0].lat);
    const lng = parseFloat(data[0].lon);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
    return { lat, lng, displayName: data[0].display_name ?? null, precision };
  } catch {
    return null;
  }
}

function expandAbbreviations(s: string): string {
  return s
    .replace(/\bExt\b\.?/gi, "Extension")
    .replace(/\bAve\b\.?/gi, "Avenue")
    .replace(/\bSt\b\.?/gi, "Street")
    .replace(/\bRd\b\.?/gi, "Road")
    .replace(/\bDr\b\.?/gi, "Drive")
    .replace(/\bBlvd\b\.?/gi, "Boulevard")
    .replace(/\bHwy\b\.?/gi, "Highway")
    .replace(/\bPkwy\b\.?/gi, "Parkway")
    .replace(/\bLn\b\.?/gi, "Lane")
    .replace(/\bCt\b\.?/gi, "Court");
}

export async function geocodeAddress(parts: {
  address?: string | null;
  addressLine1?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}): Promise<GeocodeResult | null> {
  const street = (parts.addressLine1 ?? parts.address ?? "").trim();
  const city = (parts.city ?? "").trim();
  const state = (parts.state ?? "").trim();
  const zip = (parts.zip ?? "").trim();

  // Strategy 1: structured query with full address
  if (street && city && state && zip) {
    const p = new URLSearchParams();
    p.set("street", street);
    p.set("city", city);
    p.set("state", state);
    p.set("postalcode", zip);
    p.set("country", "USA");
    const r = await tryQuery(p, "exact");
    if (r) return r;
  }

  // Strategy 2: free-form full address
  const tokens = [street, city, state, zip, "USA"].map((t) => t.trim()).filter(Boolean);
  if (tokens.length >= 2) {
    const p = new URLSearchParams();
    p.set("q", tokens.join(", "));
    const r = await tryQuery(p, "exact");
    if (r) return r;
  }

  // Strategy 3: free-form with abbreviations expanded
  if (street) {
    const expanded = expandAbbreviations(street);
    if (expanded !== street) {
      const t2 = [expanded, city, state, zip, "USA"].map((t) => t.trim()).filter(Boolean);
      const p = new URLSearchParams();
      p.set("q", t2.join(", "));
      const r = await tryQuery(p, "exact");
      if (r) return r;
    }
  }

  // Strategy 4: city + state + zip (no street) — neighborhood center
  if (city && state && zip) {
    const p = new URLSearchParams();
    p.set("city", city);
    p.set("state", state);
    p.set("postalcode", zip);
    p.set("country", "USA");
    const r = await tryQuery(p, "city");
    if (r) return r;
  }

  // Strategy 5: just ZIP + country — last resort, ZIP centroid
  if (zip) {
    const p = new URLSearchParams();
    p.set("postalcode", zip);
    p.set("country", "USA");
    const r = await tryQuery(p, "zip");
    if (r) return r;
  }

  return null;
}
