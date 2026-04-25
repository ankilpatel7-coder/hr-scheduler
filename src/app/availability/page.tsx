"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/navbar";
import { Check } from "lucide-react";

type Entry = {
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
  available: boolean;
};

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_FULL = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function minutesToTime(m: number) {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}
function timeToMinutes(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

export default function AvailabilityPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  useEffect(() => {
    fetch("/api/availability")
      .then((r) => r.json())
      .then((d) => {
        // Initialize one entry per day if empty
        if (!d.availability || d.availability.length === 0) {
          setEntries(
            Array.from({ length: 7 }).map((_, i) => ({
              dayOfWeek: i,
              startMinute: 9 * 60,
              endMinute: 17 * 60,
              available: i >= 1 && i <= 5, // weekdays available by default
            }))
          );
        } else {
          const byDay: Record<number, Entry> = {};
          for (const e of d.availability) byDay[e.dayOfWeek] = e;
          setEntries(
            Array.from({ length: 7 }).map((_, i) =>
              byDay[i] ?? {
                dayOfWeek: i,
                startMinute: 9 * 60,
                endMinute: 17 * 60,
                available: false,
              }
            )
          );
        }
        setLoading(false);
      });
  }, []);

  function update(day: number, patch: Partial<Entry>) {
    setEntries((prev) =>
      prev.map((e) => (e.dayOfWeek === day ? { ...e, ...patch } : e))
    );
    setSaved(false);
  }

  async function save() {
    const res = await fetch("/api/availability", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries }),
    });
    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen">
        <Navbar />
        <div className="max-w-3xl mx-auto px-6 py-16 text-center text-smoke">
          Loading…
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-3xl mx-auto px-6 py-10">
        <div className="mb-10">
          <div className="text-[10px] tracking-[0.3em] uppercase text-smoke mb-2">
            Your weekly pattern
          </div>
          <h1 className="display text-5xl">Availability</h1>
          <p className="text-smoke mt-3 max-w-xl">
            Let your managers know when you can work. They'll use this when building
            schedules.
          </p>
        </div>

        <div className="card overflow-hidden mb-6">
          {entries.map((e) => (
            <div
              key={e.dayOfWeek}
              className="p-4 border-b border-dust last:border-0 flex items-center gap-4 flex-wrap"
            >
              <button
                onClick={() => update(e.dayOfWeek, { available: !e.available })}
                className={`w-6 h-6 rounded flex items-center justify-center border ${
                  e.available
                    ? "bg-moss border-moss text-paper"
                    : "bg-paper border-dust"
                }`}
              >
                {e.available && <Check size={14} />}
              </button>
              <div className="w-24 font-medium">{DAY_FULL[e.dayOfWeek]}</div>
              {e.available ? (
                <div className="flex items-center gap-2 flex-1">
                  <input
                    type="time"
                    value={minutesToTime(e.startMinute)}
                    onChange={(ev) =>
                      update(e.dayOfWeek, {
                        startMinute: timeToMinutes(ev.target.value),
                      })
                    }
                    className="!w-auto !py-1"
                  />
                  <span className="text-smoke">to</span>
                  <input
                    type="time"
                    value={minutesToTime(e.endMinute)}
                    onChange={(ev) =>
                      update(e.dayOfWeek, {
                        endMinute: timeToMinutes(ev.target.value),
                      })
                    }
                    className="!w-auto !py-1"
                  />
                </div>
              ) : (
                <div className="text-smoke italic text-sm">Unavailable</div>
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between">
          <div>
            {saved && (
              <div className="text-sm text-moss flex items-center gap-2">
                <Check size={14} /> Saved
              </div>
            )}
          </div>
          <button onClick={save} className="btn btn-primary">
            Save availability
          </button>
        </div>
      </main>
    </div>
  );
}
