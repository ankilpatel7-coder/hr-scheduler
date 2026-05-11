/**
 * /[tenant]/calendar — list + manage company events.
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/navbar";
import { getServerAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Calendar, ArrowLeft } from "lucide-react";
import { format } from "date-fns";
import CalendarEventsManager from "@/components/calendar-events-manager";

export const dynamic = "force-dynamic";

export default async function CalendarPage({
  params,
}: {
  params: { tenant: string };
}) {
  const session = await getServerAuth();
  if (!session) redirect(`/login?from=/${params.tenant}/calendar`);
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
    select: { id: true },
  });
  if (!tenant || tenant.id !== tenantId) redirect("/login");

  const events = await prisma.calendarEvent.findMany({
    where: { tenantId },
    orderBy: { startDate: "asc" },
    include: { createdBy: { select: { id: true, name: true } } },
  });

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-3xl mx-auto px-6 py-10">
        <Link
          href={`/${params.tenant}/schedule`}
          className="inline-flex items-center gap-1 text-xs text-rust hover:underline mb-3"
        >
          <ArrowLeft size={12} />
          Back to schedule
        </Link>
        <div className="flex items-center gap-2 mb-2">
          <Calendar size={20} className="text-rust" />
          <h1 className="display text-3xl text-ink">Calendar events</h1>
        </div>
        <p className="text-sm text-smoke mb-6">
          Company-wide events shown on the schedule: paid holidays, all-hands
          meetings, shop-closed days. Shifts overlapping a <strong>CLOSED</strong> event
          get flagged as conflicts.
        </p>

        <CalendarEventsManager
          initial={events.map((e) => ({
            id: e.id,
            title: e.title,
            description: e.description,
            type: e.type as "HOLIDAY" | "MEETING" | "CLOSED" | "OTHER",
            startDate: format(e.startDate, "yyyy-MM-dd"),
            endDate: format(e.endDate, "yyyy-MM-dd"),
            color: e.color,
            createdByName: e.createdBy.name,
          }))}
        />
      </main>
    </div>
  );
}
