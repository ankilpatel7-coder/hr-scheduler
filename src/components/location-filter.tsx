"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { MapPin } from "lucide-react";

type LocationOption = { id: string; name: string };

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
