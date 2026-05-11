/**
 * /[tenant]/templates — Schedule Templates management page.
 *
 * Lists every template with metadata + shift count. Manager/admin can rename
 * or delete from here. Templates are saved from the schedule page; this page
 * is for cleanup and review.
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/guards";
import { format } from "date-fns";
import { ArrowLeft, LayoutTemplate } from "lucide-react";
import TemplatesAdminList from "@/components/templates-admin-list";

export default async function TemplatesPage({
  params,
}: {
  params: { tenant: string };
}) {
  const auth = await requireRole(["ADMIN", "MANAGER"]);
  if ("error" in auth) {
    redirect(`/${params.tenant}/login`);
  }
  if (auth.isSuperAdmin || !auth.tenantId) {
    redirect("/admin");
  }

  const templates = await prisma.scheduleTemplate.findMany({
    where: { tenantId: auth.tenantId },
    orderBy: { createdAt: "desc" },
    include: {
      createdBy: { select: { id: true, name: true } },
      _count: { select: { shifts: true } },
    },
  });

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-6">
        <Link
          href={`/${params.tenant}/schedule`}
          className="inline-flex items-center gap-1 text-xs text-rust hover:underline mb-3"
        >
          <ArrowLeft size={12} />
          Back to schedule
        </Link>
        <div className="flex items-center gap-2">
          <LayoutTemplate size={20} className="text-rust" />
          <h1 className="display text-3xl text-ink">Schedule Templates</h1>
        </div>
        <p className="text-sm text-smoke mt-1">
          Saved week patterns. Apply any of these to a future week from the
          schedule page to drop in a full shape in one click.
        </p>
      </div>

      {templates.length === 0 ? (
        <div className="card p-8 text-center">
          <LayoutTemplate size={32} className="text-smoke mx-auto mb-3" />
          <p className="text-sm text-ink/70 mb-1">No templates saved yet.</p>
          <p className="text-xs text-smoke">
            Build a week on the{" "}
            <Link href={`/${params.tenant}/schedule`} className="text-rust hover:underline">
              schedule page
            </Link>{" "}
            and click &ldquo;Save as template&rdquo;.
          </p>
        </div>
      ) : (
        <TemplatesAdminList
          tenantSlug={params.tenant}
          initial={templates.map((t) => ({
            id: t.id,
            name: t.name,
            shiftCount: t._count.shifts,
            createdAt: format(t.createdAt, "MMM d, yyyy"),
            createdByName: t.createdBy.name,
          }))}
        />
      )}
    </div>
  );
}
