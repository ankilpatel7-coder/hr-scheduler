/**
 * /[tenant]/calendar/[id] — event detail page with embedded PDF viewer.
 */

import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getServerAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ArrowLeft, Calendar as CalendarIcon, Download, Paperclip } from "lucide-react";
import { format } from "date-fns";

export const dynamic = "force-dynamic";

const TYPE_COLORS: Record<string, string> = {
  HOLIDAY: "#3B6D11",
  MEETING: "#3D5C8C",
  CLOSED:  "#A32D2D",
  EVENT:   "#C99A2C",
  OTHER:   "#7A7872",
};

const TYPE_LABELS: Record<string, string> = {
  HOLIDAY: "Holiday",
  MEETING: "Meeting",
  CLOSED:  "Closed",
  EVENT:   "Event",
  OTHER:   "Other",
};

export default async function CalendarEventDetail({
  params,
}: {
  params: { tenant: string; id: string };
}) {
  const session = await getServerAuth();
  if (!session) redirect(`/login?from=/${params.tenant}/calendar/${params.id}`);
  const tenantId = (session.user as any).tenantId as string | null;
  const isSuperAdmin = (session.user as any).superAdmin === true;
  if (isSuperAdmin) redirect("/superadmin");
  if (!tenantId) redirect("/login");

  const tenant = await prisma.tenant.findUnique({
    where: { slug: params.tenant },
    select: { id: true },
  });
  if (!tenant || tenant.id !== tenantId) redirect("/login");

  const event = await prisma.calendarEvent.findFirst({
    where: { id: params.id, tenantId },
    include: { createdBy: { select: { name: true } } },
  });
  if (!event) notFound();

  const color = event.color || TYPE_COLORS[event.type] || "#7A7872";
  const typeLabel = TYPE_LABELS[event.type] || event.type;
  const singleDay = event.startDate.getTime() === event.endDate.getTime();
  const attachmentKb = event.attachmentSize
    ? Math.round(event.attachmentSize / 1024)
    : null;

  return (
    <div className="min-h-screen">
      <main className="max-w-4xl mx-auto px-6 py-10">
        <Link
          href={`/${params.tenant}/calendar`}
          className="inline-flex items-center gap-1 text-xs text-rust hover:underline mb-4"
        >
          <ArrowLeft size={12} /> Back to calendar
        </Link>

        <div className="card p-6">
          {/* Header */}
          <div className="flex items-start gap-3 mb-4">
            <div
              className="w-1 self-stretch rounded-full shrink-0"
              style={{ background: color, minHeight: "48px" }}
            />
            <div className="flex-1">
              <div
                className="inline-block text-[10px] uppercase tracking-wider font-semibold mb-1"
                style={{ color }}
              >
                {typeLabel}
              </div>
              <h1 className="display text-3xl text-ink leading-tight">{event.title}</h1>
              <div className="flex items-center gap-1.5 text-sm text-smoke mt-2">
                <CalendarIcon size={13} />
                {singleDay
                  ? format(event.startDate, "EEEE, MMMM d, yyyy")
                  : `${format(event.startDate, "EEE MMM d")} – ${format(event.endDate, "EEE MMM d, yyyy")}`}
              </div>
              <div className="text-[11px] text-smoke mt-1">
                Added by {event.createdBy.name ?? "—"} · {format(event.createdAt, "MMM d, yyyy")}
              </div>
            </div>
          </div>

          {/* Description */}
          {event.description && (
            <div className="text-sm text-ink leading-relaxed mt-4 whitespace-pre-wrap border-t border-dust pt-4">
              {event.description}
            </div>
          )}

          {/* Attachment */}
          {event.attachmentUrl && (
            <div className="mt-6 border-t border-dust pt-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-sm text-ink">
                  <Paperclip size={14} className="text-smoke" />
                  <span className="font-medium">{event.attachmentName ?? "Attachment"}</span>
                  {attachmentKb !== null && (
                    <span className="text-[11px] text-smoke">({attachmentKb} KB)</span>
                  )}
                </div>
                <a
                  href={event.attachmentUrl}
                  download={event.attachmentName ?? undefined}
                  className="btn btn-secondary inline-flex items-center gap-1 !py-1 !text-xs"
                >
                  <Download size={12} /> Download PDF
                </a>
              </div>
              <div className="rounded overflow-hidden border border-dust">
                <iframe
                  src={event.attachmentUrl}
                  className="w-full"
                  style={{ height: "70vh", background: "#F0EBE0" }}
                  title={event.attachmentName ?? "Event PDF"}
                />
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
