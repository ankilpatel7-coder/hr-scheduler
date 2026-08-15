/**
 * /[tenant]/timesheets/adjustments — activity log for clock entries.
 *
 * Answers "why did someone change this shift?" by surfacing two kinds of
 * event that were previously written to the database but never shown:
 *
 *   - Time adjustments  : editNote + editedBy + editedAt
 *   - Approval decisions: approvalNote + approvedBy + approvedAt + status
 *
 * Read-only. Admin and Manager only, with manager scoping applied so a
 * location manager sees only their own people.
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { getServerAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getScopedEmployeeIds } from "@/lib/guards";
import { ArrowLeft, History, Pencil, CheckCircle2, XCircle } from "lucide-react";
import Pagination from "@/components/pagination";

export const dynamic = "force-dynamic";

const DAY_MS = 86_400_000;

function fmt(d: Date | null, tz: string): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d);
}

function fmtTimeOnly(d: Date | null, tz: string): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
    .format(d)
    .toLowerCase()
    .replace(/\s/g, "");
}

export default async function AdjustmentsPage({
  params,
  searchParams,
}: {
  params: { tenant: string };
  searchParams?: { days?: string; page?: string };
}) {
  const session = await getServerAuth();
  if (!session) redirect(`/login?from=/${params.tenant}/timesheets/adjustments`);
  const role = (session.user as any).role;
  const userId = (session.user as any).id as string;
  const tenantId = (session.user as any).tenantId as string | null;
  const isSuperAdmin = (session.user as any).superAdmin === true;
  if (isSuperAdmin) redirect("/superadmin");
  if (!tenantId) redirect("/login");
  if (role !== "ADMIN" && role !== "MANAGER") {
    redirect(`/${params.tenant}/dashboard`);
  }

  const tenant = await prisma.tenant.findUnique({
    where: { slug: params.tenant },
    select: { id: true, timezone: true },
  });
  if (!tenant || tenant.id !== tenantId) redirect("/login");
  const tz = tenant.timezone || "America/New_York";

  const daysRaw = Number(searchParams?.days ?? 30);
  const days = [7, 30, 90, 365].includes(daysRaw) ? daysRaw : 30;
  const since = new Date(Date.now() - days * DAY_MS);

  const scopedIds = await getScopedEmployeeIds(userId, role);
  const scope = scopedIds ? { userId: { in: scopedIds } } : {};

  const PAGE_SIZE = 25;
  const pageRaw = Number(searchParams?.page ?? 1);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;

  const logWhere = {
    tenantId,
    clockIn: { gte: since },
    ...scope,
    OR: [
      { editNote: { not: null } },
      { approvalStatus: { not: "PENDING" as const } },
    ],
  };

  const totalEntries = await prisma.clockEntry.count({ where: logWhere });

  const entries = await prisma.clockEntry.findMany({
    where: logWhere,
    select: {
      id: true,
      userId: true,
      clockIn: true,
      clockOut: true,
      editedBy: true,
      editNote: true,
      editedAt: true,
      approvalStatus: true,
      approvalNote: true,
      approvedAt: true,
      user: { select: { id: true, name: true, email: true } },
      approvedBy: { select: { id: true, name: true } },
    },
    orderBy: [{ clockIn: "desc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  // editedBy is a bare user id (no relation on the model), so resolve names
  // in one extra query rather than N.
  const editorIds = Array.from(
    new Set(entries.map((e) => e.editedBy).filter((v): v is string => Boolean(v))),
  );
  const editors = editorIds.length
    ? await prisma.user.findMany({
        where: { id: { in: editorIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const editorById = new Map(editors.map((u) => [u.id, u.name || u.email]));

  const adjustedCount = entries.filter((e) => e.editNote).length;
  const approvalCount = entries.filter(
    (e) => e.approvalStatus !== "PENDING",
  ).length;

  return (
    <div className="min-h-screen">
      <main className="max-w-5xl mx-auto px-6 py-10">
        <Link
          href={`/${params.tenant}/timesheets`}
          className="inline-flex items-center gap-1 text-xs text-rust hover:underline mb-3"
        >
          <ArrowLeft size={12} /> Back to timesheets
        </Link>

        <div className="flex items-center gap-2 mb-2">
          <History size={20} className="text-rust" />
          <h1 className="display text-3xl text-ink">Activity log</h1>
        </div>
        <p className="text-sm text-smoke mb-6">
          Every time adjustment and approval decision, with the reason given.
        </p>

        <div className="flex items-center gap-2 mb-6 flex-wrap">
          <span className="text-[11px] text-smoke uppercase tracking-wider font-semibold">
            Period:
          </span>
          {[7, 30, 90, 365].map((d) => (
            <Link
              key={d}
              href={`/${params.tenant}/timesheets/adjustments?days=${d}&page=1`}
              className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                days === d
                  ? "bg-rust text-gold-on border-transparent"
                  : "border-dust bg-paper text-ink hover:bg-steel"
              }`}
            >
              {d === 365 ? "1 year" : `${d} days`}
            </Link>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3 mb-6 max-w-sm">
          <div className="rounded-lg border border-dust bg-paper px-4 py-3">
            <div className="text-[10px] uppercase tracking-wider text-smoke font-semibold">
              Time adjustments
            </div>
            <div className="display text-2xl text-ink mt-0.5 tabular-nums">
              {adjustedCount}
            </div>
          </div>
          <div className="rounded-lg border border-dust bg-paper px-4 py-3">
            <div className="text-[10px] uppercase tracking-wider text-smoke font-semibold">
              Approval decisions
            </div>
            <div className="display text-2xl text-ink mt-0.5 tabular-nums">
              {approvalCount}
            </div>
          </div>
        </div>

        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          total={totalEntries}
          baseHref={`/${params.tenant}/timesheets/adjustments?days=${days}`}
          label="events"
        />

        {entries.length === 0 ? (
          <div className="card p-8 text-center text-sm text-smoke italic">
            No adjustments or approval decisions in the last{" "}
            {days === 365 ? "year" : `${days} days`}.
          </div>
        ) : (
          <div className="card overflow-hidden">
            <ul className="divide-y divide-dust">
              {entries.map((e) => {
                const editorName = e.editedBy
                  ? editorById.get(e.editedBy) ?? "Unknown"
                  : null;
                const shiftLabel = `${fmt(e.clockIn, tz)} → ${
                  e.clockOut ? fmtTimeOnly(e.clockOut, tz) : "still open"
                }`;
                return (
                  <li key={e.id} className="px-4 py-3">
                    <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1.5">
                      <div className="text-sm font-medium text-ink">
                        {e.user.name || e.user.email}
                      </div>
                      <div className="text-[11px] text-smoke font-mono">
                        {shiftLabel}
                      </div>
                    </div>

                    {e.editNote && (
                      <div className="flex items-start gap-2 mt-1.5">
                        <Pencil size={12} className="text-smoke mt-0.5 shrink-0" />
                        <div className="min-w-0">
                          <div className="text-[13px] text-ink">{e.editNote}</div>
                          <div className="text-[11px] text-smoke mt-0.5">
                            Adjusted by {editorName ?? "—"} · {fmt(e.editedAt, tz)}
                          </div>
                        </div>
                      </div>
                    )}

                    {e.approvalStatus !== "PENDING" && (
                      <div className="flex items-start gap-2 mt-1.5">
                        {e.approvalStatus === "APPROVED" ? (
                          <CheckCircle2
                            size={12}
                            className="mt-0.5 shrink-0"
                            style={{ color: "#3B6D11" }}
                          />
                        ) : (
                          <XCircle
                            size={12}
                            className="mt-0.5 shrink-0"
                            style={{ color: "#A32D2D" }}
                          />
                        )}
                        <div className="min-w-0">
                          <div className="text-[13px] text-ink">
                            {e.approvalStatus === "APPROVED"
                              ? "Approved"
                              : "Rejected"}
                            {e.approvalNote ? ` — ${e.approvalNote}` : ""}
                          </div>
                          <div className="text-[11px] text-smoke mt-0.5">
                            {e.approvedBy?.name ?? "—"} · {fmt(e.approvedAt, tz)}
                          </div>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {entries.length >= 400 && (
          <p className="text-[11px] text-smoke mt-3">
            Showing the 400 most recent. Narrow the period to see older entries.
          </p>
        )}
      </main>
    </div>
  );
}
