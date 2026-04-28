"use client";
import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import Avatar from "@/components/avatar";
import AnimatedNumber from "@/components/animated-number";
import {
  Users,
  CalendarDays,
  Activity,
  Inbox,
  Repeat,
  AlertTriangle,
  ArrowUpRight,
  TrendingUp,
  MapPin,
} from "lucide-react";
import { format } from "date-fns";

type Roster = {
  id: string;
  employeeId: string;
  employeeName: string;
  photoUrl: string | null;
  hourlyWage: number;
  startTime: string;
  endTime: string;
  role: string | null;
  location: { id: string; name: string } | null;
  isClockedIn: boolean;
};

export default function OpsConsole({ firstName }: { firstName: string }) {
  const [data, setData] = useState<any>(null);
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);
  const [locationFilter, setLocationFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const q = locationFilter ? `?locationId=${locationFilter}` : "";
    const [a, l] = await Promise.all([
      fetch(`/api/analytics${q}`),
      fetch("/api/locations"),
    ]);
    if (a.ok) setData(await a.json());
    if (l.ok) {
      setLocations((await l.json()).locations.filter((x: any) => x.active));
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationFilter]);

  return (
    <main className="max-w-[1500px] mx-auto px-6 py-10 animate-fade-in">
      {/* Hero */}
      <div className="mb-8 flex items-end justify-between flex-wrap gap-4 animate-slide-up">
        <div>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-2 h-2 rounded-full bg-moss animate-pulse-glow"></div>
            <div className="label-eyebrow">Live · Operations Console</div>
          </div>
          <h1 className="display text-5xl md:text-6xl text-ink leading-[1.05]">
            Hello,{" "}
            <span className="bg-gradient-to-r from-rust to-glow bg-clip-text text-transparent italic">
              {firstName}
            </span>
            .
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <label className="!mb-0 mr-1">Location</label>
          <select
            value={locationFilter}
            onChange={(e) => setLocationFilter(e.target.value)}
            className="!w-auto"
          >
            <option value="">All locations</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading || !data ? (
        <div className="text-smoke">Loading analytics…</div>
      ) : (
        <div className="space-y-6">
          {/* Alert row */}
          {(data.stats.pendingTimeOff > 0 ||
            data.stats.pendingSwaps > 0 ||
            data.stats.draftShifts > 0 ||
            data.stats.otAtRisk > 0) && (
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-3 stagger">
              {data.stats.pendingTimeOff > 0 && (
                <AlertCard
                  icon={<Inbox size={16} />}
                  count={data.stats.pendingTimeOff}
                  label="Time-off pending"
                  href="/time-off"
                />
              )}
              {data.stats.pendingSwaps > 0 && (
                <AlertCard
                  icon={<Repeat size={16} />}
                  count={data.stats.pendingSwaps}
                  label="Swap approvals"
                  href="/swaps"
                />
              )}
              {data.stats.draftShifts > 0 && (
                <AlertCard
                  icon={<CalendarDays size={16} />}
                  count={data.stats.draftShifts}
                  label="Draft shifts"
                  href="/schedule"
                />
              )}
              {data.stats.otAtRisk > 0 && (
                <AlertCard
                  icon={<AlertTriangle size={16} />}
                  count={data.stats.otAtRisk}
                  label="At/near 40 hrs"
                  href="/timesheets"
                  warn
                />
              )}
            </div>
          )}

          {/* Top stats */}
          <div className="grid md:grid-cols-3 gap-6 stagger">
            <StatCard
              icon={<Users size={22} />}
              label="Active employees"
              value={data.stats.totalEmployees}
              href="/employees"
            />
            <StatCard
              icon={<CalendarDays size={22} />}
              label="Shifts today"
              value={data.stats.todayShifts}
              href="/schedule"
            />
            <StatCard
              icon={<Activity size={22} />}
              label="Clocked in now"
              value={data.stats.clockedInNow}
              href="/timesheets"
              live={data.stats.clockedInNow > 0}
            />
          </div>

          {/* Today's roster */}
          <div className="card p-6 animate-slide-up">
            <div className="flex items-baseline justify-between mb-5 flex-wrap gap-2">
              <div>
                <div className="label-eyebrow mb-1">{format(new Date(), "EEEE, MMM d")}</div>
                <h2 className="display text-2xl text-ink">Today's roster</h2>
              </div>
              <div className="text-sm text-smoke">
                {data.todayRoster.length} shift{data.todayRoster.length !== 1 ? "s" : ""}
              </div>
            </div>
            {data.todayRoster.length === 0 ? (
              <div className="text-sm text-smoke italic py-4">
                Nobody is scheduled today
                {locationFilter ? " at this location" : ""}.
              </div>
            ) : (
              <RosterTimeline shifts={data.todayRoster} />
            )}
          </div>

          {/* Charts row */}
          <div className="grid md:grid-cols-2 gap-6">
            {/* Hours by day */}
            <div className="card p-6 animate-slide-up">
              <div className="label-eyebrow mb-1">This week</div>
              <h2 className="display text-2xl text-ink mb-5">Hours by day</h2>
              <BarChartHours data={data.weekHoursByDay} />
              <div className="mt-4 flex items-center gap-4 text-xs text-smoke">
                <Legend color="#4f8eff" label="Scheduled" />
                <Legend color="#2dd4ff" label="Actual" />
              </div>
            </div>

            {/* Labor trend */}
            <div className="card p-6 animate-slide-up">
              <div className="label-eyebrow mb-1">8 weeks · trend</div>
              <h2 className="display text-2xl text-ink mb-5 flex items-center gap-2">
                Labor cost <TrendingUp size={20} className="text-glow" />
              </h2>
              <LineChartCost data={data.laborTrend} />
              <div className="mt-3 flex justify-between text-xs">
                <span className="text-smoke">{data.laborTrend[0]?.label}</span>
                <span className="text-ink font-mono">
                  Latest: $
                  {(data.laborTrend[data.laborTrend.length - 1]?.cost ?? 0).toFixed(0)}
                </span>
              </div>
            </div>
          </div>

          {/* Location comparison */}
          {data.locationStats.length > 0 && (
            <div className="card p-6 animate-slide-up">
              <div className="label-eyebrow mb-1">This week</div>
              <h2 className="display text-2xl text-ink mb-5 flex items-center gap-2">
                <MapPin size={20} className="text-rust" /> By location
              </h2>
              <LocationBars data={data.locationStats} />
            </div>
          )}
        </div>
      )}
    </main>
  );
}

/* ----------------- Roster timeline ----------------- */
function RosterTimeline({ shifts }: { shifts: Roster[] }) {
  // Build a 6am–11pm range (17 hours) and place each shift on it
  const startHour = 6;
  const endHour = 23;
  const totalMin = (endHour - startHour) * 60;

  function pos(d: string) {
    const dt = new Date(d);
    const m = dt.getHours() * 60 + dt.getMinutes() - startHour * 60;
    return (Math.max(0, Math.min(m, totalMin)) / totalMin) * 100;
  }

  return (
    <div>
      {/* Hour ruler */}
      <div className="relative ml-[200px] h-5 border-b border-dust mb-2">
        {Array.from({ length: endHour - startHour + 1 }).map((_, i) => {
          const h = startHour + i;
          const left = (i / (endHour - startHour)) * 100;
          const label = h === 12 ? "12p" : h > 12 ? `${h - 12}p` : `${h}a`;
          return (
            <div
              key={h}
              className="absolute top-0 h-full"
              style={{ left: `${left}%` }}
            >
              <div className="text-[10px] text-smoke font-mono leading-none">{label}</div>
              <div className="absolute top-3 w-px h-2 bg-dust"></div>
            </div>
          );
        })}
      </div>

      {/* Rows */}
      <div className="space-y-2">
        {shifts.map((s) => {
          const left = pos(s.startTime);
          const right = pos(s.endTime);
          const width = Math.max(2, right - left);
          return (
            <div key={s.id} className="flex items-center gap-3">
              <div className="w-[200px] flex items-center gap-2 flex-shrink-0">
                <Avatar name={s.employeeName} photoUrl={s.photoUrl} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-ink truncate flex items-center gap-1.5">
                    {s.employeeName}
                    {s.isClockedIn && (
                      <span
                        className="w-1.5 h-1.5 rounded-full bg-moss animate-pulse-glow flex-shrink-0"
                        title="Currently clocked in"
                      ></span>
                    )}
                  </div>
                  <div className="font-mono text-[10px] text-smoke truncate">
                    {s.location?.name ?? "—"}
                  </div>
                </div>
              </div>
              <div className="relative flex-1 h-8 bg-dust/30 rounded">
                <div
                  className={`absolute top-0 h-full rounded flex items-center px-2 text-[10px] font-mono text-white ${
                    s.isClockedIn
                      ? "bg-gradient-to-r from-moss to-rust shadow-glow-cyan"
                      : "bg-gradient-to-r from-rust to-glow"
                  }`}
                  style={{ left: `${left}%`, width: `${width}%` }}
                  title={`${format(new Date(s.startTime), "h:mma")} – ${format(new Date(s.endTime), "h:mma")}`}
                >
                  <span className="truncate">
                    {format(new Date(s.startTime), "h:mma")} –{" "}
                    {format(new Date(s.endTime), "h:mma")}
                    {s.role && ` · ${s.role}`}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ----------------- Bar chart: hours by day ----------------- */
function BarChartHours({ data }: { data: any[] }) {
  const max = Math.max(8, ...data.map((d) => Math.max(d.scheduled, d.actual)));
  return (
    <div className="flex items-end gap-2 h-40">
      {data.map((d) => {
        const sH = (d.scheduled / max) * 100;
        const aH = (d.actual / max) * 100;
        return (
          <div key={d.day} className="flex-1 flex flex-col items-center gap-1">
            <div className="text-[10px] font-mono text-smoke">
              {Math.round(d.actual || d.scheduled)}h
            </div>
            <div className="w-full flex gap-0.5 items-end h-32">
              <div
                className="flex-1 rounded-t transition-all"
                style={{
                  height: `${sH}%`,
                  background:
                    "linear-gradient(180deg, #4f8eff 0%, rgba(79,142,255,0.4) 100%)",
                  boxShadow: "0 0 12px rgba(79,142,255,0.3)",
                }}
                title={`Scheduled: ${d.scheduled.toFixed(1)}h`}
              ></div>
              <div
                className="flex-1 rounded-t transition-all"
                style={{
                  height: `${aH}%`,
                  background:
                    "linear-gradient(180deg, #2dd4ff 0%, rgba(45,212,255,0.4) 100%)",
                  boxShadow: "0 0 12px rgba(45,212,255,0.3)",
                }}
                title={`Actual: ${d.actual.toFixed(1)}h`}
              ></div>
            </div>
            <div className="text-[10px] text-smoke">{d.label}</div>
          </div>
        );
      })}
    </div>
  );
}

/* ----------------- Line chart: 8 week labor cost ----------------- */
function LineChartCost({ data }: { data: any[] }) {
  const max = Math.max(100, ...data.map((d) => d.cost));
  const w = 500;
  const h = 140;
  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - (d.cost / max) * h * 0.85 - 8;
    return { x, y, ...d };
  });
  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");
  const areaPath = `${path} L ${w} ${h} L 0 ${h} Z`;

  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
      <defs>
        <linearGradient id="costFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2dd4ff" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#4f8eff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="costLine" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#4f8eff" />
          <stop offset="100%" stopColor="#2dd4ff" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#costFill)" />
      <path d={path} fill="none" stroke="url(#costLine)" strokeWidth="2.5" />
      {points.map((p, i) => (
        <g key={i}>
          <circle
            cx={p.x}
            cy={p.y}
            r="3"
            fill="#0e1530"
            stroke="#2dd4ff"
            strokeWidth="2"
          />
        </g>
      ))}
    </svg>
  );
}

/* ----------------- Stacked location bar ----------------- */
function LocationBars({ data }: { data: any[] }) {
  const max = Math.max(1, ...data.map((d) => d.cost));
  return (
    <div className="space-y-3">
      {data.map((l) => {
        const w = (l.cost / max) * 100;
        return (
          <div key={l.id}>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-ink">{l.name}</span>
              <span className="font-mono text-glow">${l.cost.toFixed(0)}</span>
            </div>
            <div className="h-3 rounded-full bg-dust/30 overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${w}%`,
                  background: "linear-gradient(90deg, #4f8eff 0%, #2dd4ff 100%)",
                  boxShadow: "0 0 12px rgba(45,212,255,0.4)",
                }}
              ></div>
            </div>
            <div className="text-[10px] text-smoke font-mono mt-0.5">
              {l.hours.toFixed(1)} hours
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ----------------- Helpers (reused from prior dashboard) ----------------- */
function StatCard({
  icon,
  label,
  value,
  href,
  live,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  href: string;
  live?: boolean;
}) {
  return (
    <Link
      href={href}
      className="card p-7 hover:border-rust transition-all group animate-slide-up relative overflow-hidden"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-rust/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
      <div className="relative">
        <div className="flex items-start justify-between mb-5">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-rust/15 to-glow/10 border border-rust/30 flex items-center justify-center text-rust">
            {icon}
          </div>
          {live && (
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-moss animate-pulse-glow"></span>
              <span className="font-mono text-[10px] uppercase tracking-widest text-moss">live</span>
            </div>
          )}
        </div>
        <div className="label-eyebrow mb-2">{label}</div>
        <div className="display text-5xl text-ink tabular-nums">
          <AnimatedNumber value={value} decimals={0} />
        </div>
      </div>
    </Link>
  );
}

function AlertCard({
  icon,
  count,
  label,
  href,
  warn,
}: {
  icon: React.ReactNode;
  count: number;
  label: string;
  href: string;
  warn?: boolean;
}) {
  return (
    <Link
      href={href}
      className="card p-4 flex items-center gap-3 hover:border-rust transition-all animate-slide-up"
      style={
        warn
          ? {
              borderColor: "rgba(251, 191, 36, 0.4)",
              background:
                "linear-gradient(180deg, rgba(251,191,36,0.08) 0%, rgba(15,22,38,0.7) 100%)",
            }
          : undefined
      }
    >
      <div
        className="w-9 h-9 rounded-lg border flex items-center justify-center flex-shrink-0"
        style={
          warn
            ? { background: "rgba(251,191,36,0.15)", borderColor: "rgba(251,191,36,0.4)", color: "#fbbf24" }
            : undefined
        }
      >
        <span className={warn ? "" : "text-rust"}>{icon}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="display text-2xl leading-none tabular-nums text-ink">
          <AnimatedNumber value={count} decimals={0} />
        </div>
        <div className="text-[11px] text-smoke mt-0.5 truncate">{label}</div>
      </div>
      <ArrowUpRight size={14} className="text-smoke flex-shrink-0" />
    </Link>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-3 h-3 rounded" style={{ background: color }}></span>
      <span>{label}</span>
    </div>
  );
}
