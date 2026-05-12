/**
 * /[tenant]/employees/[id]/documents — admin view of ONE employee's documents.
 *
 * Same shape as /my-documents but for any employee, admin/manager access.
 */

import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/navbar";
import { getServerAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { FileText, ArrowLeft, CheckCircle2, ExternalLink, AlertCircle } from "lucide-react";
import { format } from "date-fns";

export const dynamic = "force-dynamic";

export default async function EmployeeDocumentsPage({
  params,
}: {
  params: { tenant: string; id: string };
}) {
  const session = await getServerAuth();
  if (!session) redirect(`/login?from=/${params.tenant}/employees/${params.id}/documents`);
  const role = (session.user as any).role;
  const tenantId = (session.user as any).tenantId as string | null;
  const isSuperAdmin = (session.user as any).superAdmin === true;
  if (isSuperAdmin) redirect("/superadmin");
  if (!tenantId) redirect("/login");
  if (role !== "ADMIN" && role !== "MANAGER") {
    redirect(`/${params.tenant}/dashboard`);
  }

  const employee = await prisma.user.findFirst({
    where: { id: params.id, tenantId },
    select: { id: true, name: true, email: true, active: true },
  });
  if (!employee) notFound();

  const sigs = await prisma.documentSignature.findMany({
    where: {
      employeeId: params.id,
      document: { tenantId, active: true },
    },
    include: {
      document: true,
      waivedBy: { select: { id: true, name: true } },
    },
    orderBy: [{ status: "asc" }, { document: { createdAt: "desc" } }],
  });

  const pending = sigs.filter((s) => s.status === "PENDING");
  const signed = sigs.filter((s) => s.status === "SIGNED");
  const waived = sigs.filter((s) => s.status === "WAIVED");

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-3xl mx-auto px-6 py-10">
        <Link
          href={`/${params.tenant}/employees/${employee.id}`}
          className="inline-flex items-center gap-1 text-xs text-rust hover:underline mb-3"
        >
          <ArrowLeft size={12} /> Back to {employee.name}
        </Link>
        <div className="flex items-center gap-2 mb-2">
          <FileText size={20} className="text-rust" />
          <h1 className="display text-3xl text-ink">{employee.name}&rsquo;s documents</h1>
        </div>
        <div className="text-xs text-smoke mb-6">
          {sigs.length} total · {signed.length} signed · {pending.length} pending · {waived.length} waived
        </div>

        <div className="space-y-6">
          {pending.length > 0 && (
            <Section title="Pending" icon={<AlertCircle size={16} className="text-amber-600" />}>
              {pending.map((s) => (
                <div key={s.id} className="p-4 flex items-center gap-3">
                  <FileText size={18} className="text-amber-600 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-ink">{s.document.title}</div>
                    {s.document.required && (
                      <span
                        className="mt-1 inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide"
                        style={{ background: "rgba(220,38,38,0.08)", color: "#dc2626" }}
                      >
                        Required
                      </span>
                    )}
                  </div>
                  <Link
                    href={`/${params.tenant}/documents/${s.document.id}`}
                    className="text-xs text-rust hover:underline shrink-0"
                  >
                    Manage →
                  </Link>
                </div>
              ))}
            </Section>
          )}

          {signed.length > 0 && (
            <Section title="Signed" icon={<CheckCircle2 size={16} className="text-green-600" />}>
              {signed.map((s) => (
                <div key={s.id} className="p-4 flex items-center gap-3">
                  <CheckCircle2 size={18} className="text-green-600 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-ink">{s.document.title}</div>
                    <div className="text-[11px] text-smoke mt-0.5">
                      Signed {s.signedAt ? format(s.signedAt, "MMM d, yyyy 'at' h:mm a") : "?"}
                    </div>
                  </div>
                  {s.signedFileUrl && (
                    <a
                      href={s.signedFileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-rust hover:underline inline-flex items-center gap-1 shrink-0"
                    >
                      View signed copy <ExternalLink size={11} />
                    </a>
                  )}
                </div>
              ))}
            </Section>
          )}

          {waived.length > 0 && (
            <Section title="Waived" icon={<FileText size={16} className="text-indigo-600" />}>
              {waived.map((s) => (
                <div key={s.id} className="p-4 flex items-center gap-3">
                  <FileText size={18} className="text-indigo-600 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-ink">{s.document.title}</div>
                    <div className="text-[11px] text-smoke mt-0.5">
                      Waived
                      {s.waivedAt ? ` ${format(s.waivedAt, "MMM d, yyyy")}` : ""}
                      {s.waivedBy?.name ? ` by ${s.waivedBy.name}` : ""}
                      {s.waiveReason ? ` — "${s.waiveReason}"` : ""}
                    </div>
                  </div>
                </div>
              ))}
            </Section>
          )}

          {sigs.length === 0 && (
            <div className="card p-8 text-center">
              <FileText size={32} className="text-smoke mx-auto mb-3" />
              <p className="text-sm text-ink/70">No documents assigned to this employee.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="display text-xl text-ink mb-3 flex items-center gap-2">
        {icon}
        {title}
      </h2>
      <div className="card divide-y divide-ink/5">{children}</div>
    </section>
  );
}
