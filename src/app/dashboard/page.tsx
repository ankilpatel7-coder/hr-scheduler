import { redirect } from "next/navigation";
import Link from "next/link";
import { getServerAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import Navbar from "@/components/navbar";
import { fmtDate, fmtTime, durationHours } from "@/lib/utils";
import {
  Clock,
  Users,
  CalendarDays,
  FileBarChart,
  AlertTriangle,
  Inbox,
  Repeat,
  MapPin,
} from "lucide-react";

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

  // Employee-specific stats
  const openEntry =
    role === "EMPLOYEE"
      ? await prisma.clockEntry.findFirst({
          where: { userId, clockOut: null },
        })
      : null;

  const myUpcomingShifts =
    role === "EMPLOYEE"
      ? await prisma.shift.findMany({
          where: { employeeId: userId, startTime: { gte: now }, published: true },
          orderBy: { startTime: "asc" },
          take: 5,
          include: { location: { select: { name: true } } },
        })
      : [];

  const myWeekEntries =
    role === "EMPLOYEE"
      ? await prisma.clockEntry.findMany({
          where: { userId, clockIn: { gte: weekAgo } },
        })
      : [];

  const myWeekHours = myWeekEntries.reduce(
    (acc, e) => acc + durationHours(e.clockIn, e.clockOut),
    0
  );

  const myPendingTimeOff =
    role === "EMPLOYEE"
      ? await prisma.timeOffRequest.count({
          where: { userId, status: "PENDING" },
        })
      : 0;

  // Manager/Admin stats
  const totalEmployees =
    role !== "EMPLOYEE"
      ? await prisma.user.count({ where: { active: true } })
      : 0;

  const todayShifts =
    role !== "EMPLOYEE"
      ? await prisma.shift.count({
          where: { startTime: { gte: startOfDay, lt: endOfDay } },
        })
      : 0;

  const currentlyClockedIn =
    role !== "EMPLOYEE"
      ? await prisma.clockEntry.count({ where: { clockOut: null } })
      : 0;

  const pendingTimeOff =
    role !== "EMPLOYEE"
      ? await prisma.timeOffRequest.count({ where: { status: "PENDING" } })
      : 0;

  const pendingSwaps =
    role !== "EMPLOYEE"
      ? await prisma.shiftSwap.count({ where: { status: "CLAIMED" } })
      : 0;

  const draftShifts =
    role !== "EMPLOYEE"
      ? await prisma.shift.count({
          where: { published: false, startTime: { gte: startOfDay } },
        })
      : 0;

  // OT projection: any employee with 36+ hours actual+scheduled this week
  let otAtRisk = 0;
  if (role !== "EMPLOYEE") {
    const entries = await prisma.clockEntry.findMany({
      where: { clockIn: { gte: weekStart, lt: weekEnd } },
      select: { userId: true, clockIn: true, clockOut: true },
    });
    const scheduled = await prisma.shift.findMany({
      where: { startTime: { gte: now, lt: weekEnd }, published: true },
      select: { employeeId: true, startTime: true, endTime: true },
    });
    const tot = new Map<string, number>();
    for (const e of entries) {
      tot.set(
        e.userId,
        (tot.get(e.userId) ?? 0) + durationHours(e.clockIn, e.clockOut)
      );
    }
    for (const s of scheduled) {
      tot.set(
        s.employeeId,
        (tot.get(s.employeeId) ?? 0) + durationHours(s.startTime, s.endTime)
      );
    }
    for (const v of tot.values()) {
      if (v >= 36) otAtRisk++;
    }
  }

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-7xl mx-auto px-6 py-10">
        <div className="mb-10">
          <div className="text-[10px] tracking-[0.3em] uppercase text-smoke mb-2">
            {role === "EMPLOYEE" ? "Your shift" : "Today at a glance"}
          </div>
          <h1 className="display text-5xl md:text-6xl">
            Hello, <span className="italic">{session.user?.name?.split(" ")[0]}</span>.
          </h1>
          <p className="text-smoke mt-3 max-w-xl">
            {role === "EMPLOYEE"
              ? openEntry
                ? "You're currently clocked in. Clock out when you're done."
                : "You're not clocked in. Head to the clock-in page when your shift starts."
              : "A snapshot of the team today. Drill into any section below."}
          </p>
        </div>

        {role === "EMPLOYEE" ? (
          <div className="grid md:grid-cols-2 gap-6">
            <Link
              href="/clock"
              className="card p-8 hover:border-ink transition-colors group"
            >
              <div className="flex items-start justify-between mb-6">
                <Clock size={28} className="text-rust" />
                <span className={`chip ${openEntry ? "chip-moss" : "chip-rust"}`}>
                  {openEntry ? "Clocked in" : "Clocked out"}
                </span>
              </div>
              <div className="display text-3xl mb-1">
                {openEntry ? "Clock out" : "Clock in"}
              </div>
              <div className="text-sm text-smoke">
                {openEntry
                  ? `Started at ${fmtTime(openEntry.clockIn)}`
                  : "Snap a selfie and you're on the clock"}
              </div>
            </Link>

            <div className="card p-8">
              <div className="flex items-start justify-between mb-6">
                <CalendarDays size={28} className="text-ink" />
                <span className="chip">This week</span>
              </div>
              <div className="display text-3xl mb-1">
                {myWeekHours.toFixed(1)}{" "}
                <span className="text-base font-normal text-smoke">hours</span>
              </div>
              <div className="text-sm text-smoke">
                Across {myWeekEntries.length} shift
                {myWeekEntries.length !== 1 ? "s" : ""}
              </div>
            </div>

            {myPendingTimeOff > 0 && (
              <Link
                href="/time-off"
                className="md:col-span-2 card p-5 bg-rust/5 border-rust/30 hover:border-rust transition-colors flex items-center gap-3"
              >
                <Inbox size={20} className="text-rust" />
                <div className="flex-1">
                  <div className="font-medium text-sm">
                    {myPendingTimeOff} pending time-off request
                    {myPendingTimeOff > 1 ? "s" : ""}
                  </div>
                  <div className="text-xs text-smoke">Awaiting manager decision</div>
                </div>
                <span className="text-xs uppercase tracking-widest text-smoke">
                  View →
                </span>
              </Link>
            )}

            <div className="md:col-span-2 card p-8">
              <div className="flex items-baseline justify-between mb-6">
                <h2 className="display text-2xl">Upcoming shifts</h2>
                <Link
                  href="/my-shifts"
                  className="text-xs uppercase tracking-widest text-smoke hover:text-ink"
                >
                  View all →
                </Link>
              </div>
              {myUpcomingShifts.length === 0 ? (
                <div className="text-sm text-smoke italic">
                  No published shifts. Your manager will publish them when ready.
                </div>
              ) : (
                <ul className="divide-y divide-dust">
                  {myUpcomingShifts.map((s) => (
                    <li
                      key={s.id}
                      className="py-3 flex items-baseline justify-between flex-wrap gap-2"
                    >
                      <div>
                        <div className="font-medium">{fmtDate(s.startTime)}</div>
                        <div className="text-sm text-smoke">
                          {fmtTime(s.startTime)} — {fmtTime(s.endTime)}
                          {s.role && ` · ${s.role}`}
                          {s.location && ` · @ ${s.location.name}`}
                        </div>
                      </div>
                      <div className="text-sm font-mono text-smoke">
                        {durationHours(s.startTime, s.endTime).toFixed(1)}h
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Alert row */}
            {(pendingTimeOff > 0 ||
              pendingSwaps > 0 ||
              draftShifts > 0 ||
              otAtRisk > 0) && (
              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-3">
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
            <div className="grid md:grid-cols-3 gap-6">
              <StatCard
                icon={<Users size={24} />}
                label="Active employees"
                value={totalEmployees.toString()}
                href="/employees"
              />
              <StatCard
                icon={<CalendarDays size={24} />}
                label="Shifts today"
                value={todayShifts.toString()}
                href="/schedule"
              />
              <StatCard
                icon={<Clock size={24} />}
                label="Clocked in now"
                value={currentlyClockedIn.toString()}
                href="/timesheets"
              />
            </div>

            {/* Action cards */}
            <div className="grid md:grid-cols-3 gap-6">
              <Link
                href="/schedule"
                className="card p-8 hover:border-ink transition-colors"
              >
                <CalendarDays size={24} className="mb-4 text-rust" />
                <div className="display text-2xl mb-1">Build schedule</div>
                <div className="text-sm text-smoke">
                  Draft shifts, then publish to notify the team.
                </div>
              </Link>
              <Link
                href="/employees"
                className="card p-8 hover:border-ink transition-colors"
              >
                <Users size={24} className="mb-4 text-rust" />
                <div className="display text-2xl mb-1">Manage team</div>
                <div className="text-sm text-smoke">
                  Wages, locations, roles, deactivation.
                </div>
              </Link>
              <Link
                href="/timesheets"
                className="card p-8 hover:border-ink transition-colors"
              >
                <FileBarChart size={24} className="mb-4 text-rust" />
                <div className="display text-2xl mb-1">Run payroll</div>
                <div className="text-sm text-smoke">
                  Export CSV, Excel, or PDF.
                </div>
              </Link>
              {role === "ADMIN" && (
                <Link
                  href="/locations"
                  className="card p-8 hover:border-ink transition-colors"
                >
                  <MapPin size={24} className="mb-4 text-rust" />
                  <div className="display text-2xl mb-1">Locations</div>
                  <div className="text-sm text-smoke">
                    Add stores, restaurants, or branches.
                  </div>
                </Link>
              )}
              <Link
                href="/time-off"
                className="card p-8 hover:border-ink transition-colors"
              >
                <Inbox size={24} className="mb-4 text-rust" />
                <div className="display text-2xl mb-1">Time off</div>
                <div className="text-sm text-smoke">
                  Review requests, approve or deny.
                </div>
              </Link>
              <Link
                href="/swaps"
                className="card p-8 hover:border-ink transition-colors"
              >
                <Repeat size={24} className="mb-4 text-rust" />
                <div className="display text-2xl mb-1">Swap board</div>
                <div className="text-sm text-smoke">
                  Approve coverage between employees.
                </div>
              </Link>
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
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  href: string;
}) {
  return (
    <Link href={href} className="card p-8 hover:border-ink transition-colors">
      <div className="text-smoke mb-4">{icon}</div>
      <div className="text-[10px] uppercase tracking-[0.2em] text-smoke mb-2">
        {label}
      </div>
      <div className="display text-5xl">{value}</div>
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
      className={`card p-4 flex items-center gap-3 hover:border-ink transition-colors ${
        warn ? "bg-rust/5 border-rust/30" : ""
      }`}
    >
      <div className={warn ? "text-rust" : "text-smoke"}>{icon}</div>
      <div className="flex-1">
        <div className="display text-2xl leading-none">{count}</div>
        <div className="text-xs text-smoke mt-0.5">{label}</div>
      </div>
      <span className="text-xs text-smoke">→</span>
    </Link>
  );
}
