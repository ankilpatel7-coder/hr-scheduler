"use client";

/**
 * Location filter sitting above the dashboard roster widget. Defaults to
 * the user's last-picked location (or first available) via localStorage.
 * Pushes ?locationId= to the URL and forces a refresh.
 */

import { useEffect, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { MapPin } from "lucide-react";

type LocationOption = { id: string; name: string };
const STORAGE_KEY = "shiftwork:lastLocationId";

export default function RosterLocationFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: session } = useSession();

  const role = (session?.user as any)?.role;
  const canFilter = role === "ADMIN" || role === "MANAGER";

  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [loading, setLoading] = useState(true);
  const value = searchParams?.get("locationId") ?? "";

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

  // On first load with no value, default to last-picked or first location.
  useEffect(() => {
    if (loading || !canFilter || locations.length === 0) return;
    if (value) return;
    let preferred: string | null = null;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && locations.some((l) => l.id === stored)) preferred = stored;
    } catch {}
    const pick = preferred ?? locations[0].id;
    setUrl(pick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, locations]);

  function setUrl(id: string) {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    if (id) {
      params.set("locationId", id);
      try { localStorage.setItem(STORAGE_KEY, id); } catch {}
    } else {
      params.delete("locationId");
    }
    const url = `${pathname}?${params.toString()}`;
    // Nuclear: hard navigate so server component definitively re-renders.
    window.location.assign(url);
  }

  if (!canFilter) return null;
  if (loading) return null;
  if (locations.length <= 1) return null;

  return (
    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-dust bg-paper">
      <MapPin size={13} className="text-smoke" />
      <select
        value={value}
        onChange={(e) => setUrl(e.target.value)}
        className="!w-auto !py-0 !text-xs !border-0 !bg-transparent"
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
