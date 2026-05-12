/**
 * /[tenant]/timesheets/by-employee?from=YYYY-MM-DD&to=YYYY-MM-DD&locationId=&employeeId=
 *
 * Pivoted timesheet view:
 *   - Rows: employees (filterable to a single employee)
 *   - Columns: each date in the range
 *   - Cells: hours worked that day
 *   - Last column: total hours for the employee in the range
 *   - Last row: column totals + grand total
 *
 * Filters: from/to dates, location, employee dropdown. PDF export.
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { getServerAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import Navbar from "@/components/navbar";
import { ArrowLeft, List, MapPin, User } from "lucide-react";
import TimesheetPdfButton from "@/components/timesheet-pdf-button";
import {
  format,
  startOfWeek,
  endOfWeek,
  subWeeks,
  addDays,
  differenceInCalendarDays,
} from "date-fns";

export const dynamic = "force-dynamic";

function parseDate(s: string | undefined, fallback: Date): Date {
  if (!s) return fallback;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return fallback;
  return d;
}

function durationHours(a: Date, b: Date | null): number {
  if (!b) return 0;
  return Math.max(0, (b.getTime() - a.getTime()) / 3_600_000);
}

export default async function TimesheetsByEmployeePage({
  params,
  searchParams,
}: {
  params: { tenant: string };
  searchParams: { from?: string; to?: string; locationId?: string; employeeId?: string };
}) {
  const session = await getServerAuth();
  if (!session) redirect(`/login?from=/${params.tenant}/timesheets/by-employee`);
  const role = (session.user as any).role;
  const tenantId = (session.user as any).tenantId as string | null;
  const isSuperAdmin = (session.user as any).superAdmin === true;
  if (isSuperAdmin) redirect("/superadmin");
  if (!tenantId) redirect("/login");
  if (role !== "ADMIN" && role !== "MANAGER") {
    redirect(`/${params.tenant}/dashboard`);
  }

  const tenant = await prisma.tenant.findUnique({
    where: { slug: params.tenant },
    select: { id: true, businessName: true },
  });
  if (!tenant || tenant.id !== tenantId) redirect("/login");

  const now = new Date();
  const defaultFrom = startOfWeek(now, { weekStartsOn: 1 });
  const defaultTo = endOfWeek(now, { weekStartsOn: 1 });
  const from = parseDate(searchParams.from, defaultFrom);
  const to = parseDate(searchParams.to, defaultTo);
  const fromStart = new Date(from);
  fromStart.setHours(0, 0, 0, 0);
  const toEnd = new Date(to);
  toEnd.setHours(23, 59, 59, 999);

  const days = Math.min(31, Math.max(1, differenceInCalendarDays(toEnd, fromStart) + 1));
  const dateColumns = Array.from({ length: days }, (_, i) => addDays(fromStart, i));

  const [locations, allEmployees] = await Promise.all([
    prisma.location.findMany({
      where: { tenantId, active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({
      where: { tenantId, role: { not: "ADMIN" } },
      select: { id: true, name: true, active: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const locationId = searchParams.locationId || null;
  const employeeId = searchParams.employeeId || null;

  const where: any = {
    tenantId,
    approvalStatus: "APPROVED",
    clockIn: { lte: toEnd },
    OR: [{ clockOut: null }, { clockOut: { gte: fromStart } }],
  };
  if (employeeId) where.userId = employeeId;

  const entries = await prisma.clockEntry.findMany({
    where,
    select: {
      id: true,
      userId: true,
      clockIn: true,
      clockOut: true,
      breaks: { select: { breakStart: true, breakEnd: true, breakType: true } },
      user: {
        select: {
          id: true,
          name: true,
          hourlyWage: true,
          department: true,
          jobRole: true,
        },
      },
    },
    orderBy: { clockIn: "asc" },
  });

  let filteredEntries = entries;
  if (locationId) {
    const empLocRows = await prisma.employeeLocation.findMany({
      where: { locationId },
      select: { userId: true },
    });
    const allowedUserIds = new Set(empLocRows.map((r) => r.userId));
    filteredEntries = entries.filter((e) => allowedUserIds.has(e.userId));
  }

  type EmpRow = {
    id: string;
    name: string;
    department: string | null;
    jobRole: string | null;
    hourlyWage: number;
    perDay: Map<string, number>;
    total: number;
  };
  const empMap = new Map<string, EmpRow>();

  for (const e of filteredEntries) {
    const dayKey = format(e.clockIn, "yyyy-MM-dd");
    const start = e.clockIn;
    const end = e.clockOut ?? now;
    const effStart = start < fromStart ? fromStart : start;
    const effEnd = end > toEnd ? toEnd : end;
    if (effEnd <= effStart) continue;
    // Deduct UNPAID breaks (MEAL_30 + OTHER) from the worked hours.
    // SHORT_15 stays in because it's paid by convention.
    let unpaidBreakHrs = 0;
    for (const b of (e as any).breaks ?? []) {
      if (b.breakType === "SHORT_15") continue;
      const bStart = new Date(b.breakStart);
      const bEnd = b.breakEnd ? new Date(b.breakEnd) : now;
      // Clip to this entry's effective range
      const bs = bStart < effStart ? effStart : bStart;
      const be = bEnd > effEnd ? effEnd : bEnd;
      if (be > bs) unpaidBreakHrs += (be.getTime() - bs.getTime()) / 3_600_000;
    }
    const hrs = durationHours(effStart, effEnd);
    const hrsAdjusted = Math.max(0, hrs - unpaidBreakHrs);

    let row = empMap.get(e.userId);
    if (!row) {
      row = {
        id: e.userId,
        name: e.user.name,
        department: e.user.department,
        jobRole: e.user.jobRole,
        hourlyWage: e.user.hourlyWage,
        perDay: new Map(),
        total: 0,
      };
      empMap.set(e.userId, row);
    }
    row.perDay.set(dayKey, (row.perDay.get(dayKey) ?? 0) + hrsAdjusted);
    row.total += hrsAdjusted;
  }

  const rows = Array.from(empMap.values()).sort((a, b) => a.name.localeCompare(b.name));

  const dayTotals = dateColumns.map((d) => {
    const key = format(d, "yyyy-MM-dd");
    let sum = 0;
    for (const r of rows) sum += r.perDay.get(key) ?? 0;
    return sum;
  });
  const grandTotal = rows.reduce((s, r) => s + r.total, 0);
  const grandPay = rows.reduce((s, r) => s + r.total * r.hourlyWage, 0);

  function fmt(h: number): string {
    return h === 0 ? "—" : h.toFixed(2);
  }

  function rangeUrl(rangeFrom: Date, rangeTo: Date): string {
    const f = format(rangeFrom, "yyyy-MM-dd");
    const t = format(rangeTo, "yyyy-MM-dd");
    const locPart = locationId ? `&locationId=${locationId}` : "";
    const empPart = employeeId ? `&employeeId=${employeeId}` : "";
    return `/${params.tenant}/timesheets/by-employee?from=${f}&to=${t}${locPart}${empPart}`;
  }

  const thisWeek = { from: startOfWeek(now, { weekStartsOn: 1 }), to: endOfWeek(now, { weekStartsOn: 1 }) };
  const lastWeek = { from: subWeeks(thisWeek.from, 1), to: subWeeks(thisWeek.to, 1) };
  const last14 = { from: addDays(now, -13), to: now };

  // Build PDF filename
  const fromStr = format(fromStart, "yyyy-MM-dd");
  const toStr = format(toEnd, "yyyy-MM-dd");
  const empPart = employeeId
    ? "-" + (allEmployees.find((e) => e.id === employeeId)?.name.replace(/\s+/g, "-") ?? "employee")
    : "";
  const pdfFilename = `timesheets-${params.tenant}${empPart}-${fromStr}-to-${toStr}.pdf`;

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-[1400px] mx-auto px-6 py-10 space-y-6">
        <div className="print:hidden">
          <Link
            href={`/${params.tenant}/timesheets`}
            className="inline-flex items-center gap-1 text-xs text-rust hover:underline mb-3"
          >
            <ArrowLeft size={12} />
            Back to chronological view
          </Link>
          <div className="flex items-baseline justify-between flex-wrap gap-3">
            <div>
              <div className="label-eyebrow mb-1">Hours and pay</div>
              <h1 className="display text-4xl text-ink">Timesheets · by employee</h1>
            </div>
            <div className="flex items-center gap-3">
              <Link
                href={`/${params.tenant}/timesheets?from=${fromStr}&to=${toStr}${locationId ? `&locationId=${locationId}` : ""}${employeeId ? `&employeeId=${employeeId}` : ""}`}
                className="text-xs text-rust hover:underline inline-flex items-center gap-1"
              >
                <List size={12} /> Switch to list view
              </Link>
              <TimesheetPdfButton filename={pdfFilename} />
            </div>
          </div>
        </div>

        {/* Filters */}
        <form className="card p-4 flex items-end gap-3 flex-wrap print:hidden" action="" method="get">
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-smoke font-medium mb-1">From</label>
            <input
              type="date"
              name="from"
              defaultValue={fromStr}
              className="text-sm rounded border border-ink/10 px-3 py-2 bg-white"
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-smoke font-medium mb-1">To</label>
            <input
              type="date"
              name="to"
              defaultValue={toStr}
              className="text-sm rounded border border-ink/10 px-3 py-2 bg-white"
            />
          </div>
          {locations.length > 0 && (
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-smoke font-medium mb-1">
                <MapPin size={11} className="inline mr-1" /> Location
              </label>
              <select
                name="locationId"
                defaultValue={locationId ?? ""}
                className="text-sm rounded border border-ink/10 px-3 py-2 bg-white"
              >
                <option value="">All locations</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-smoke font-medium mb-1">
              <User size={11} className="inline mr-1" /> Employee
            </label>
            <select
              name="employeeId"
              defaultValue={employeeId ?? ""}
              className="text-sm rounded border border-ink/10 px-3 py-2 bg-white"
            >
              <option value="">All employees</option>
              {allEmployees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}{!e.active ? " (inactive)" : ""}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn btn-rust">Apply</button>

          <div className="flex items-center gap-2 ml-auto">
            <Link href={rangeUrl(thisWeek.from, thisWeek.to)} className="btn btn-secondary text-xs">This week</Link>
            <Link href={rangeUrl(lastWeek.from, lastWeek.to)} className="btn btn-secondary text-xs">Last week</Link>
            <Link href={rangeUrl(last14.from, last14.to)} className="btn btn-secondary text-xs">Last 14 days</Link>
          </div>
        </form>

        {/* === Printable area === */}
        <div id="timesheet-printable" className="space-y-4">
          {/* PDF-only header (hidden on screen, visible in PDF capture).
              We force display via inline style so html2canvas picks it up. */}
          <div className="screen:hidden print-header" style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>
              {tenant.businessName} — Timesheet by Employee
            </div>
            <div style={{ fontSize: 12, color: "#555" }}>
              {format(fromStart, "MMM d, yyyy")} – {format(toEnd, "MMM d, yyyy")}
              {employeeId && allEmployees.find((e) => e.id === employeeId)
                ? ` · ${allEmployees.find((e) => e.id === employeeId)!.name}`
                : ""}
              {locationId && locations.find((l) => l.id === locationId)
                ? ` · ${locations.find((l) => l.id === locationId)!.name}`
                : ""}
            </div>
          </div>

          {/* Summary tiles */}
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Total hours" value={`${grandTotal.toFixed(1)} hrs`} />
            <Stat label="Estimated pay" value={`$${grandPay.toFixed(2)}`} />
            <Stat label="Employees with hours" value={rows.length.toString()} />
          </div>

          {/* Pivot table */}
          <div className="card overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-ink/10 bg-paper">
                  <th className="sticky left-0 z-10 bg-paper px-3 py-2 text-left text-[10px] uppercase tracking-wider text-smoke font-medium whitespace-nowrap">
                    Employee
                  </th>
                  {dateColumns.map((d) => (
                    <th key={d.toISOString()} className="px-2 py-2 text-right text-[10px] uppercase tracking-wider text-smoke font-medium whitespace-nowrap min-w-[58px]">
                      <div>{format(d, "EEE")}</div>
                      <div className="font-mono normal-case tracking-normal">{format(d, "MMM d")}</div>
                    </th>
                  ))}
                  <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wider text-smoke font-medium whitespace-nowrap bg-ink/[0.03]">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={dateColumns.length + 2} className="px-3 py-12 text-center text-smoke italic">
                      No hours in this range.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.id} className="border-b border-ink/5 hover:bg-ink/[0.02]">
                      <td className="sticky left-0 z-10 bg-white px-3 py-2 whitespace-nowrap">
                        <div className="font-medium text-ink">{r.name}</div>
                        <div className="text-[10px] text-smoke">
                          {r.jobRole || r.department || "—"} · ${r.hourlyWage.toFixed(2)}/hr
                        </div>
                      </td>
                      {dateColumns.map((d) => {
                        const key = format(d, "yyyy-MM-dd");
                        const h = r.perDay.get(key) ?? 0;
                        return (
                          <td
                            key={key}
                            className={`px-2 py-2 text-right font-mono tabular-nums ${
                              h === 0 ? "text-smoke" : "text-ink"
                            }`}
                          >
                            {fmt(h)}
                          </td>
                        );
                      })}
                      <td className="px-3 py-2 text-right font-mono tabular-nums font-medium text-ink bg-ink/[0.02]">
                        {r.total.toFixed(2)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {rows.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-ink/20 bg-ink/[0.03] font-medium">
                    <td className="sticky left-0 z-10 bg-ink/[0.03] px-3 py-2">Daily totals</td>
                    {dayTotals.map((t, i) => (
                      <td key={i} className="px-2 py-2 text-right font-mono tabular-nums">
                        {t === 0 ? "—" : t.toFixed(2)}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right font-mono tabular-nums font-bold text-ink">
                      {grandTotal.toFixed(2)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <div className="text-[10px] uppercase tracking-[0.15em] text-smoke font-medium">{label}</div>
      <div className="display text-2xl text-ink mt-1">{value}</div>
    </div>
  );
}
