/**
 * /[tenant]/calendar — company events + monthly grid.
 *
 * Accessible to ALL roles (employees view, admins/managers manage).
 * Shows a monthly grid with events, plus a list below with details.
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { getServerAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Calendar as CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import CalendarView from "./calendar-view";

export const dynamic = "force-dynamic";

export default async function CalendarPage({
  params,
  searchParams,
}: {
  params: { tenant: string };
  searchParams?: { month?: string };
}) {
  const session = await getServerAuth();
  if (!session) redirect(`/login?from=/${params.tenant}/calendar`);
  const role = (session.user as any).role as "ADMIN" | "MANAGER" | "LEAD" | "EMPLOYEE";
  const tenantId = (session.user as any).tenantId as string | null;
  const isSuperAdmin = (session.user as any).superAdmin === true;
  if (isSuperAdmin) redirect("/superadmin");
  if (!tenantId) redirect("/login");

  const tenant = await prisma.tenant.findUnique({
    where: { slug: params.tenant },
    select: { id: true },
  });
  if (!tenant || tenant.id !== tenantId) redirect("/login");

  // Which month are we viewing?
  const now = new Date();
  const monthStr = searchParams?.month;
  let anchor = now;
  if (monthStr && /^\d{4}-\d{2}$/.test(monthStr)) {
    const [y, m] = monthStr.split("-").map(Number);
    anchor = new Date(Date.UTC(y, m - 1, 1, 12));
  }

  // Fetch events that overlap the visible month window (+2 weeks buffer for grid edges)
  const monthStart = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 0));
  const gridFrom = new Date(monthStart);
  gridFrom.setUTCDate(gridFrom.getUTCDate() - 14);
  const gridTo = new Date(monthEnd);
  gridTo.setUTCDate(gridTo.getUTCDate() + 14);

  const events = await prisma.calendarEvent.findMany({
    where: {
      tenantId,
      startDate: { lte: gridTo },
      endDate: { gte: gridFrom },
    },
    orderBy: { startDate: "asc" },
    include: { createdBy: { select: { id: true, name: true } } },
  });

  const canManage = role === "ADMIN" || role === "MANAGER";

  return (
    <div className="min-h-screen">
      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="flex items-center gap-2 mb-2">
          <CalendarIcon size={20} className="text-rust" />
          <h1 className="display text-3xl text-ink">Calendar</h1>
        </div>
        <p className="text-sm text-smoke mb-6">
          Company events, holidays, meetings. Click any event for details.
        </p>

        <CalendarView
          tenantSlug={params.tenant}
          canManage={canManage}
          monthAnchorIso={anchor.toISOString()}
          events={events.map((e) => ({
            id: e.id,
            title: e.title,
            description: e.description,
            type: e.type,
            startDate: format(e.startDate, "yyyy-MM-dd"),
            endDate: format(e.endDate, "yyyy-MM-dd"),
            color: e.color,
            attachmentUrl: e.attachmentUrl,
            attachmentName: e.attachmentName,
            attachmentSize: e.attachmentSize,
            createdByName: e.createdBy.name ?? "—",
          }))}
        />
      </main>
    </div>
  );
}
