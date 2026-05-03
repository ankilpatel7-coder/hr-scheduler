import { redirect } from "next/navigation";
import Link from "next/link";
import { getServerAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import Navbar from "@/components/navbar";
import DashboardAnalytics from "@/components/dashboard-analytics";
import { fmtDate, fmtTime, durationHours } from "@/lib/utils";
import { isStaff } from "@/lib/guards";
import {
  Clock,
  Users,
  CalendarDays,
  FileBarChart,
  AlertTriangle,
  Inbox,
  Repeat,
  MapPin,
  TrendingUp,
  Activity,
  ArrowUpRight,
} from "lucide-react";
import AnimatedNumber from "@/components/animated-number";

export default async function Dashboard() {
  const session = await getServerAuth();
  if (!session) redirect("/login");
  const role = (session.user as any).role;
  const userId = (session.user as any).id;

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay.getTime() + 86_400_000);
  const weekAgo = new Date(startOfDay.getTime() - 7 * 86_400_000);
  const dayMs = 7 * 86_400_000;
  const weekStart = new Date(startOfDay.getTime() - ((startOfDay.getDay() + 6) % 7) * 86_400_000);
  const weekEnd = new Date(weekStart.getTime() + dayMs);

  const openEntry =
    isStaff(role)
      ? await prisma.clockEntry.findFirst({ where: { userId, clockOut: null } })
      : null;

  const myUpcomingShifts =
    isStaff(role)
      ? await prisma.shift.findMany({
          where: { employeeId: userId, startTime: { gte: now }, published: true },
          orderBy: { startTime: "asc" },
          take: 5,
          include: { location: { select: { name: true } } },
        })
      : [];

  const myWeekEntries =
    isStaff(role)
      ? await prisma.clockEntry.findMany({ where: { userId, clockIn: { gte: weekAgo } } })
      : [];

  const myWeekHours = myWeekEntries.reduce(
    (acc, e) => acc + durationHours(e.clockIn, e.clockOut),
    0
  );

  const myPendingTimeOff =
    isStaff(role)
      ? await prisma.timeOffRequest.count({ where: { userId, status: "PENDING" } })
      : 0;

  const totalEmployees =
    !isStaff(role)
      ? await prisma.user.count({ where: { active: true } })
      : 0;

  const todayShifts =
    !isStaff(role)
      ? await prisma.shift.count({
          where: { startTime: { gte: startOfDay, lt: endOfDay } },
        })
      : 0;

  const currentlyClockedIn =
    !isStaff(role)
      ? await prisma.clockEntry.count({ where: { clockOut: null } })
      : 0;

  const pendingTimeOff =
    !isStaff(role)
      ? await prisma.timeOffRequest.count({ where: { status: "PENDING" } })
      : 0;

  const pendingSwaps =
    !isStaff(role)
      ? await prisma.shiftSwap.count({ where: { status: "CLAIMED" } })
      : 0;

  const draftShifts =
    !isStaff(role)
      ? await prisma.shift.count({
          where: { published: false, startTime: { gte: startOfDay } },
        })
      : 0;

  let otAtRisk = 0;
  let weekLaborHours = 0;
  let weekLaborCost = 0;
  if (!isStaff(role)) {
    const entries = await prisma.clockEntry.findMany({
      where: { clockIn: { gte: weekStart, lt: weekEnd } },
      include: { user: { select: { hourlyWage: true } } },
    });
    const scheduled = await prisma.shift.findMany({
      where: { startTime: { gte: now, lt: weekEnd }, published: true },
      include: { employee: { select: { hourlyWage: true } } },
    });
    const tot = new Map<string, number>();
    for (const e of entries) {
      const h = durationHours(e.clockIn, e.clockOut);
      tot.set(e.userId, (tot.get(e.userId) ?? 0) + h);
      weekLaborHours += h;
      weekLaborCost += h * (e.user.hourlyWage ?? 0);
    }
    for (const s of scheduled) {
      tot.set(s.employeeId, (tot.get(s.employeeId) ?? 0) + durationHours(s.startTime, s.endTime));
    }
    for (const v of tot.values()) {
      if (v >= 36) otAtRisk++;
    }
  }

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-[1500px] mx-auto px-6 py-10 animate-fade-in">
        {/* Hero */}
        <div className="mb-10 animate-slide-up">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-2 h-2 rounded-full bg-moss animate-pulse-glow"></div>
            <div className="label-eyebrow">
              {isStaff(role) ? "Live · Your Shift" : "Live · Operations Console"}
            </div>
          </div>
          <h1 className="display text-5xl md:text-6xl text-ink leading-[1.05]">
            Hello, <span className="text-rust italic">{session.user?.name?.split(" ")[0]}</span>.
          </h1>
          <p className="text-smoke mt-3 max-w-xl">
            {isStaff(role)
              ? openEntry
                ? "You're currently clocked in. Tap the clock card to clock out."
                : "Not on the clock. Head to clock-in when your shift begins."
              : "Real-time operations across your team. Drill into any panel."}
          </p>
        </div>

        {isStaff(role) ? (
          <div className="grid md:grid-cols-2 gap-6 stagger">
            <Link
              href="/clock"
              className="card p-8 hover:border-rust transition-all group animate-slide-up relative overflow-hidden"
            >
              {openEntry && (
                <div className="absolute top-4 right-4 w-2 h-2 rounded-full bg-moss animate-pulse-glow"></div>
              )}
              <div className="absolute inset-0 bg-rust/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
              <div className="relative">
                <div className="flex items-start justify-between mb-6">
                  <div className="w-12 h-12 rounded-lg bg-rust/15 border border-rust/30 flex items-center justify-center">
                    <Clock size={22} className="text-rust" />
                  </div>
                  <span className={`chip ${openEntry ? "chip-moss" : ""}`}>
                    {openEntry ? "On clock" : "Off clock"}
                  </span>
                </div>
                <div className="display text-3xl mb-1 text-ink">
                  {openEntry ? "Clock out" : "Clock in"}
                </div>
                <div className="text-sm text-smoke">
                  {openEntry ? `Started ${fmtTime(openEntry.clockIn)}` : "Snap a selfie to start"}
                </div>
              </div>
            </Link>

            <div className="card p-8 animate-slide-up">
              <div className="flex items-start justify-between mb-6">
                <div className="w-12 h-12 rounded-lg bg-rust/15 border border-rust/30 flex items-center justify-center">
                  <CalendarDays size={22} className="text-glow" />
                </div>
                <span className="chip">This week</span>
              </div>
              <div className="display text-4xl mb-1 text-ink tabular-nums">
                <AnimatedNumber value={myWeekHours} decimals={1} />{" "}
                <span className="text-base font-normal text-smoke font-sans">hrs</span>
              </div>
              <div className="text-sm text-smoke">
                {myWeekEntries.length} shift{myWeekEntries.length !== 1 ? "s" : ""}
              </div>
            </div>

            {myPendingTimeOff > 0 && (
              <Link
                href="/time-off"
                className="md:col-span-2 card p-5 hover:border-amber transition-colors flex items-center gap-4 animate-slide-up"
                style={{ borderColor: "rgba(251, 146, 60, 0.4)", background: "linear-gradient(180deg, rgba(251,146,60,0.08) 0%, rgba(15,22,38,0.7) 100%)" }}
              >
                <div className="w-10 h-10 rounded-lg bg-amber/20 border border-amber/40 flex items-center justify-center">
                  <Inbox size={18} className="text-amber" />
                </div>
                <div className="flex-1">
                  <div className="font-medium text-ink">
                    {myPendingTimeOff} pending time-off request{myPendingTimeOff > 1 ? "s" : ""}
                  </div>
                  <div className="text-xs text-smoke">Awaiting manager decision</div>
                </div>
                <ArrowUpRight size={18} className="text-smoke" />
              </Link>
            )}

            <div className="md:col-span-2 card p-8 animate-slide-up">
              <div className="flex items-baseline justify-between mb-6">
                <h2 className="display text-2xl text-ink">Upcoming shifts</h2>
                <Link
                  href="/my-shifts"
                  className="label-eyebrow hover:text-rust transition-colors flex items-center gap-1"
                >
                  View all <ArrowUpRight size={12} />
                </Link>
              </div>
              {myUpcomingShifts.length === 0 ? (
                <div className="text-sm text-smoke italic">
                  No published shifts yet. Your manager will publish them soon.
                </div>
              ) : (
                <ul className="divide-y divide-dust">
                  {myUpcomingShifts.map((s) => (
                    <li
                      key={s.id}
                      className="py-3 flex items-baseline justify-between flex-wrap gap-2"
                    >
                      <div>
                        <div className="font-medium text-ink">{fmtDate(s.startTime)}</div>
                        <div className="text-sm text-smoke">
                          <span className="font-mono">{fmtTime(s.startTime)} — {fmtTime(s.endTime)}</span>
                          {s.role && ` · ${s.role}`}
                          {s.location && ` · ${s.location.name}`}
                        </div>
                      </div>
                      <div className="font-mono text-sm text-glow">
                        {durationHours(s.startTime, s.endTime).toFixed(1)}h
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-6 animate-fade-in">
            {/* Alert row */}
            {(pendingTimeOff > 0 || pendingSwaps > 0 || draftShifts > 0 || otAtRisk > 0) && (
              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-3 stagger">
                {pendingTimeOff > 0 && (
                  <AlertCard
                    icon={<Inbox size={16} />}
                    count={pendingTimeOff}
                    label="Time-off pending"
                    href="/time-off"
                  />
                )}
                {pendingSwaps > 0 && (
                  <AlertCard
                    icon={<Repeat size={16} />}
                    count={pendingSwaps}
                    label="Swap approvals"
                    href="/swaps"
                  />
                )}
                {draftShifts > 0 && (
                  <AlertCard
                    icon={<CalendarDays size={16} />}
                    count={draftShifts}
                    label="Draft shifts"
                    href="/schedule"
                  />
                )}
                {otAtRisk > 0 && (
                  <AlertCard
                    icon={<AlertTriangle size={16} />}
                    count={otAtRisk}
                    label="At/near 40 hrs"
                    href="/timesheets"
                    warn
                  />
                )}
              </div>
            )}

            {/* Stats grid */}
            <div className="grid md:grid-cols-3 gap-6 stagger">
              <StatCard
                icon={<Users size={22} />}
                label="Active employees"
                value={totalEmployees}
                href="/employees"
              />
              <StatCard
                icon={<CalendarDays size={22} />}
                label="Shifts today"
                value={todayShifts}
                href="/schedule"
              />
              <StatCard
                icon={<Activity size={22} />}
                label="Clocked in now"
                value={currentlyClockedIn}
                href="/timesheets"
                live={currentlyClockedIn > 0}
              />
            </div>

            {/* Analytics: today's roster, charts */}
            <DashboardAnalytics />

            {/* Labor cost panel */}
            {weekLaborCost > 0 && (
              <div className="card p-6 animate-slide-up">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-rust/15 border border-rust/30 flex items-center justify-center">
                      <TrendingUp size={18} className="text-glow" />
                    </div>
                    <div>
                      <div className="label-eyebrow">Week to date</div>
                      <div className="display text-xl text-ink">Labor</div>
                    </div>
                  </div>
                  <Link href="/timesheets" className="label-eyebrow hover:text-rust transition-colors flex items-center gap-1">
                    Open <ArrowUpRight size={12} />
                  </Link>
                </div>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <div className="label-eyebrow mb-1">Hours</div>
                    <div className="display text-3xl tabular-nums text-ink">
                      <AnimatedNumber value={weekLaborHours} decimals={1} />
                    </div>
                  </div>
                  <div>
                    <div className="label-eyebrow mb-1">Cost</div>
                    <div className="display text-3xl tabular-nums text-glow text-glow">
                      $<AnimatedNumber value={weekLaborCost} decimals={2} />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Action grid */}
            <div className="grid md:grid-cols-3 gap-6 stagger">
              <ActionCard
                href="/schedule"
                icon={<CalendarDays size={22} />}
                title="Build schedule"
                desc="Draft shifts, then publish to notify your team."
              />
              <ActionCard
                href="/employees"
                icon={<Users size={22} />}
                title="Manage team"
                desc="Wages, locations, roles, deactivation."
              />
              <ActionCard
                href="/timesheets"
                icon={<FileBarChart size={22} />}
                title="Run payroll"
                desc="Export CSV, Excel, or PDF reports."
              />
              {role === "ADMIN" && (
                <ActionCard
                  href="/locations"
                  icon={<MapPin size={22} />}
                  title="Locations"
                  desc="Add stores, restaurants, or branches."
                />
              )}
              <ActionCard
                href="/time-off"
                icon={<Inbox size={22} />}
                title="Time off"
                desc="Review, approve, or deny requests."
              />
              <ActionCard
                href="/swaps"
                icon={<Repeat size={22} />}
                title="Swap board"
                desc="Approve coverage between employees."
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

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
      <div className="absolute inset-0 bg-rust/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
      <div className="relative">
        <div className="flex items-start justify-between mb-5">
          <div className="w-10 h-10 rounded-lg bg-rust/15 border border-rust/30 flex items-center justify-center text-rust">
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

function ActionCard({
  href,
  icon,
  title,
  desc,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <Link
      href={href}
      className="card p-7 hover:border-rust transition-all group animate-slide-up relative overflow-hidden"
    >
      <div className="absolute inset-0 bg-rust/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
      <div className="relative">
        <div className="w-10 h-10 rounded-lg bg-rust/15 border border-rust/30 flex items-center justify-center text-rust mb-5 group-hover:scale-105 transition-transform">
          {icon}
        </div>
        <div className="flex items-baseline justify-between mb-2">
          <div className="display text-2xl text-ink">{title}</div>
          <ArrowUpRight size={16} className="text-smoke group-hover:text-rust transition-colors" />
        </div>
        <div className="text-sm text-smoke">{desc}</div>
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
      className="card p-4 flex items-center gap-3 hover:border-rust transition-all animate-slide-up relative overflow-hidden"
      style={
        warn
          ? {
              borderColor: "rgba(251, 146, 60, 0.4)",
              background: "linear-gradient(180deg, rgba(251,146,60,0.08) 0%, rgba(15,22,38,0.7) 100%)",
            }
          : undefined
      }
    >
      <div
        className={`w-9 h-9 rounded-lg border flex items-center justify-center flex-shrink-0 ${
          warn
            ? "bg-amber/15 border-amber/40 text-amber"
            : "bg-rust/15 border-rust/30 text-rust"
        }`}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="display text-2xl leading-none tabular-nums text-ink">{count}</div>
        <div className="text-[11px] text-smoke mt-0.5 truncate">{label}</div>
      </div>
      <ArrowUpRight size={14} className="text-smoke flex-shrink-0" />
    </Link>
  );
}
