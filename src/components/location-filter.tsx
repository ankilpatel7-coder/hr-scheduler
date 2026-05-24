"use client";

/**
 * Location filter v2 — defaults to the first location for ADMIN/MANAGER
 * users instead of "All locations", and remembers the last picked location
 * across page reloads via localStorage.
 *
 * Behavior:
 *   - Staff: never renders (hidden, no filter).
 *   - Admin/manager with 0 or 1 location: still renders the dropdown only
 *     if there's >1 location. With 0/1 we render nothing and emit no value
 *     change (parent decides what to do).
 *   - Admin/manager with >=2 locations:
 *       * On first mount with no value, sets value to localStorage pick OR
 *         the first location alphabetically (by API ordering).
 *       * On every change, persists the picked id to localStorage.
 */

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { MapPin } from "lucide-react";

type LocationOption = { id: string; name: string };

const STORAGE_KEY = "shiftwork:lastLocationId";

export default function LocationFilter({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  const { data: session } = useSession();
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [loading, setLoading] = useState(true);

  const role = (session?.user as any)?.role;
  const canFilter = role === "ADMIN" || role === "MANAGER";

  // Load locations
  useEffect(() => {
    if (!canFilter) {
      setLoading(false);
      return;
    }
    fetch("/api/locations")
      .then((r) => (r.ok ? r.json() : { locations: [] }))
      .then((d) => {
        const active = (d.locations ?? []).filter((l: any) => l.active);
        setLocations(active);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [canFilter]);

  // Apply default value once locations have loaded (only if parent didn't
  // already pick one).
  useEffect(() => {
    if (loading || !canFilter || locations.length === 0) return;
    if (value) return; // parent already has a value

    // Prefer last-picked from localStorage, but only if still in the list.
    let preferred: string | null = null;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && locations.some((l) => l.id === stored)) preferred = stored;
    } catch {}
    const pick = preferred ?? locations[0].id;
    onChange(pick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, locations]);

  // Persist on every change.
  useEffect(() => {
    if (!value) return;
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {}
  }, [value]);

  if (!canFilter) return null;
  if (loading) return null;
  if (locations.length <= 1) return null;

  return (
    <div className={`flex items-center gap-2 ${className ?? ""}`}>
      <MapPin size={14} className="text-smoke" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="!w-auto !py-1.5 !text-sm"
      >
        <option value="">All locations</option>
        {locations.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </select>
    </div>
  );
}
