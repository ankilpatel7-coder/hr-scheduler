"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  Legend,
} from "recharts";
import { format } from "date-fns";
import { Users, Activity, Clock, AlertTriangle, MapPin } from "lucide-react";

type Roster = {
  shiftId: string;
  employee: { id: string; name: string; photoUrl: string | null };
  location: { id: string; name: string } | null;
  startTime: string;
  endTime: string;
  role: string | null;
  status: "scheduled" | "clocked_in" | "completed" | "no_show";
  clockedInAt: string | null;
};

type AnalyticsData = {
  today: {
    roster: Roster[];
    total: number;
    clockedIn: number;
    completed: number;
    noShow: number;
  };
  weeklyByDay: { day: string; scheduled: number; actual: number }[];
  trend: { week: string; cost: number; hours: number }[];
  locationComparison: {
    locationId: string;
    locationName: string;
    hours: number;
    cost: number;
  }[];
  filterableLocations: { id: string; name: string }[];
  viewerRole: "ADMIN" | "MANAGER" | "LEAD" | "EMPLOYEE";
};

export default function DashboardAnalytics() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [locationFilter, setLocationFilter] = useState<string>("");

  async function load() {
    setLoading(true);
    const q = locationFilter ? `?locationId=${locationFilter}` : "";
    const res = await fetch(`/api/analytics${q}`);
    if (res.ok) {
      setData(await res.json());
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationFilter]);

  if (loading || !data) {
    return (
      <div className="card p-8 animate-pulse-glow">
        <div className="text-smoke text-sm">Loading analytics…</div>
      </div>
    );
  }

  const isAdmin = data.viewerRole === "ADMIN";

  return (
    <div className="space-y-6">
      {/* Today's Roster */}
      <div className="card p-7 animate-slide-up">
        <div className="flex items-baseline justify-between mb-6 flex-wrap gap-3">
          <div>
            <div className="label-eyebrow mb-2">Today's roster</div>
            <h2 className="display text-2xl text-ink">
              {data.today.total} scheduled
              <span className="text-smoke text-base font-sans ml-2">
                · {data.today.clockedIn} on clock · {data.today.completed} done
                {data.today.noShow > 0 && (
                  <>
                    {" · "}
                    <span className="text-rose">{data.today.noShow} no-show</span>
                  </>
                )}
              </span>
            </h2>
          </div>
          {data.filterableLocations.length > 1 && (
            <select
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className="!w-auto !py-1.5"
            >
              <option value="">All locations</option>
              {data.filterableLocations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {data.today.roster.length === 0 ? (
          <div className="text-smoke text-sm italic py-6 text-center">
            Nobody scheduled today.
          </div>
        ) : (
          <div className="space-y-3">
            {data.today.roster.map((r) => (
              <RosterRow key={r.shiftId} roster={r} />
            ))}
          </div>
        )}
      </div>

      {/* Weekly Hours Chart */}
      <div className="card p-7 animate-slide-up">
        <div className="flex items-baseline justify-between mb-2">
          <div>
            <div className="label-eyebrow mb-2">This week</div>
            <h2 className="display text-2xl text-ink">Hours scheduled vs actual</h2>
          </div>
        </div>
        <div className="text-xs text-smoke mb-4">
          Bars compare what was scheduled (cyan) vs actually clocked-in (blue) per day.
        </div>
        <div style={{ width: "100%", height: 240 }}>
          <ResponsiveContainer>
            <BarChart data={data.weeklyByDay}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="day" stroke="#64748b" fontSize={11} />
              <YAxis stroke="#64748b" fontSize={11} />
              <Tooltip
                contentStyle={{
                  background: "#ffffff",
                  border: "1px solid #e2e8f0", boxShadow: "0 4px 12px rgba(15, 23, 42, 0.08)",
                  borderRadius: 6,
                  fontSize: 12,
                  color: "#0f172a",
                }}
                labelStyle={{ color: "#64748b" }}
              />
              <Legend wrapperStyle={{ fontSize: 12, color: "#64748b" }} />
              <Bar dataKey="scheduled" fill="#10b981" name="Scheduled hrs" radius={[4, 4, 0, 0]} />
              <Bar dataKey="actual" fill="#6366f1" name="Actual hrs" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 8-week labor trend (admin only) */}
      {isAdmin && data.trend.length > 0 && (
        <div className="card p-7 animate-slide-up">
          <div className="label-eyebrow mb-2">8-week trend</div>
          <h2 className="display text-2xl text-ink mb-4">Labor cost</h2>
          <div style={{ width: "100%", height: 240 }}>
            <ResponsiveContainer>
              <LineChart data={data.trend}>
                <defs>
                  <linearGradient id="costGrad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#6366f1" />
                    <stop offset="100%" stopColor="#10b981" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="week" stroke="#64748b" fontSize={11} />
                <YAxis
                  stroke="#64748b"
                  fontSize={11}
                  tickFormatter={(v) => `$${(v / 1000).toFixed(1)}k`}
                />
                <Tooltip
                  contentStyle={{
                    background: "#ffffff",
                    border: "1px solid #e2e8f0", boxShadow: "0 4px 12px rgba(15, 23, 42, 0.08)",
                    borderRadius: 6,
                    fontSize: 12,
                    color: "#0f172a",
                  }}
                  labelStyle={{ color: "#64748b" }}
                  formatter={(value: any) => [`$${Number(value).toFixed(2)}`, "Cost"]}
                />
                <Line
                  type="monotone"
                  dataKey="cost"
                  stroke="url(#costGrad)"
                  strokeWidth={3}
                  dot={{ fill: "#818cf8", r: 4 }}
                  activeDot={{ r: 6, fill: "#10b981" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Location comparison */}
      {isAdmin && data.locationComparison.length > 1 && (
        <div className="card p-7 animate-slide-up">
          <div className="label-eyebrow mb-2">This week</div>
          <h2 className="display text-2xl text-ink mb-4">By location</h2>
          <div style={{ width: "100%", height: 240 }}>
            <ResponsiveContainer>
              <BarChart data={data.locationComparison} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  type="number"
                  stroke="#64748b"
                  fontSize={11}
                  tickFormatter={(v) => `$${v}`}
                />
                <YAxis
                  type="category"
                  dataKey="locationName"
                  stroke="#64748b"
                  fontSize={11}
                  width={120}
                />
                <Tooltip
                  contentStyle={{
                    background: "#ffffff",
                    border: "1px solid #e2e8f0", boxShadow: "0 4px 12px rgba(15, 23, 42, 0.08)",
                    borderRadius: 6,
                    fontSize: 12,
                    color: "#0f172a",
                  }}
                  formatter={(value: any) => [`$${Number(value).toFixed(2)}`, "Labor cost"]}
                />
                <Bar dataKey="cost" fill="#6366f1" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

function RosterRow({ roster }: { roster: Roster }) {
  const start = new Date(roster.startTime);
  const end = new Date(roster.endTime);
  const now = new Date();
  const totalMin = (end.getTime() - start.getTime()) / 60000;
  const elapsedMin = Math.max(
    0,
    Math.min(totalMin, (now.getTime() - start.getTime()) / 60000)
  );
  const progressPct = (elapsedMin / totalMin) * 100;

  const statusInfo = {
    scheduled: { color: "text-smoke", icon: Clock, label: "Scheduled" },
    clocked_in: { color: "text-moss", icon: Activity, label: "On clock" },
    completed: { color: "text-glow", icon: Clock, label: "Completed" },
    no_show: { color: "text-rose", icon: AlertTriangle, label: "No-show" },
  }[roster.status];
  const Icon = statusInfo.icon;

  return (
    <Link
      href={`/employees/${roster.employee.id}`}
      className="flex items-center gap-4 py-3 px-3 rounded-lg hover:bg-rust/5 transition-colors group"
    >
      {/* Avatar */}
      {roster.employee.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={roster.employee.photoUrl}
          alt={roster.employee.name}
          className="w-10 h-10 rounded-full object-cover border border-dust flex-shrink-0"
        />
      ) : (
        <div className="w-10 h-10 rounded-full bg-rust/15 border border-rust/40 flex items-center justify-center text-xs font-medium text-ink flex-shrink-0">
          {roster.employee.name
            .split(" ")
            .map((p) => p[0])
            .slice(0, 2)
            .join("")}
        </div>
      )}

      {/* Name + meta + bar */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <div className="font-medium text-ink truncate group-hover:text-rust transition-colors">
            {roster.employee.name}
          </div>
          {roster.location && (
            <span className="text-[11px] text-smoke flex items-center gap-1">
              <MapPin size={10} />
              {roster.location.name}
            </span>
          )}
          {roster.role && (
            <span className="text-[11px] text-smoke">· {roster.role}</span>
          )}
        </div>

        <div className="mt-1.5">
          <div className="flex items-center gap-2 text-[10px] text-smoke font-mono">
            <span>{format(start, "h:mma")}</span>
            <div className="flex-1 h-1.5 rounded-full bg-paper/60 border border-dust overflow-hidden relative">
              <div
                className={`h-full rounded-full transition-all ${
                  roster.status === "clocked_in"
                    ? "bg-moss animate-pulse-glow"
                    : roster.status === "completed"
                    ? "bg-rust"
                    : roster.status === "no_show"
                    ? "bg-rose/50"
                    : "bg-dust"
                }`}
                style={{
                  width:
                    roster.status === "scheduled"
                      ? "0%"
                      : roster.status === "completed"
                      ? "100%"
                      : `${progressPct}%`,
                }}
              />
            </div>
            <span>{format(end, "h:mma")}</span>
          </div>
        </div>
      </div>

      {/* Status */}
      <div className={`flex items-center gap-1.5 ${statusInfo.color} flex-shrink-0`}>
        <Icon size={14} />
        <span className="text-xs font-medium">{statusInfo.label}</span>
      </div>
    </Link>
  );
}
