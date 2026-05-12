/**
 * /[tenant]/documents/[id] — admin per-document detail.
 *
 * Shows document metadata + signature roster with status per employee.
 * Admin can waive a pending signature with a reason (audit trail kept).
 */

import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/navbar";
import { getServerAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { FileText, ArrowLeft, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import DocumentSignatureRow from "@/components/document-signature-row";

export const dynamic = "force-dynamic";

export default async function DocumentDetailPage({
  params,
}: {
  params: { tenant: string; id: string };
}) {
  const session = await getServerAuth();
  if (!session) redirect(`/login?from=/${params.tenant}/documents/${params.id}`);
  const role = (session.user as any).role;
  const tenantId = (session.user as any).tenantId as string | null;
  const isSuperAdmin = (session.user as any).superAdmin === true;
  if (isSuperAdmin) redirect("/superadmin");
  if (!tenantId) redirect("/login");
  if (role !== "ADMIN" && role !== "MANAGER") {
    redirect(`/${params.tenant}/dashboard`);
  }

  const doc = await prisma.document.findFirst({
    where: { id: params.id, tenantId },
    include: {
      uploadedBy: { select: { id: true, name: true } },
      signatures: {
        include: {
          employee: { select: { id: true, name: true, email: true, active: true } },
          waivedBy: { select: { id: true, name: true } },
        },
        orderBy: [{ status: "asc" }, { employee: { name: "asc" } }],
      },
    },
  });
  if (!doc) notFound();

  const signed = doc.signatures.filter((s) => s.status === "SIGNED").length;
  const pending = doc.signatures.filter((s) => s.status === "PENDING").length;
  const waived = doc.signatures.filter((s) => s.status === "WAIVED").length;
  const total = doc.signatures.length;
  const pct = total === 0 ? 0 : ((signed + waived) / total) * 100;
  const tone = pct >= 100 ? "#059669" : pct >= 50 ? "#d97706" : "#dc2626";

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-4xl mx-auto px-6 py-10">
        <Link
          href={`/${params.tenant}/documents`}
          className="inline-flex items-center gap-1 text-xs text-rust hover:underline mb-3"
        >
          <ArrowLeft size={12} /> Back to documents
        </Link>

        {/* Header card */}
        <div className="card p-6 mb-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-2">
                <FileText size={18} className="text-rust shrink-0" />
                <h1 className="display text-2xl text-ink">{doc.title}</h1>
                {doc.required && (
                  <span
                    className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide"
                    style={{ background: "rgba(220,38,38,0.08)", color: "#dc2626" }}
                  >
                    Required
                  </span>
                )}
              </div>
              {doc.description && (
                <p className="text-sm text-smoke mb-3">{doc.description}</p>
              )}
              <div className="text-[11px] text-smoke">
                {(doc.fileSize / 1024).toFixed(0)} KB · uploaded {format(doc.createdAt, "MMM d, yyyy")} by {doc.uploadedBy.name}
              </div>
            </div>
            <a
              href={doc.fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary inline-flex items-center gap-1.5"
            >
              <ExternalLink size={13} /> Open original PDF
            </a>
          </div>

          {/* Progress */}
          <div className="mt-5 pt-4 border-t border-dust">
            <div className="grid grid-cols-4 gap-3 mb-3">
              <Stat count={total} label="Assigned" color="#64748b" />
              <Stat count={signed} label="Signed" color="#059669" />
              <Stat count={pending} label="Pending" color="#d97706" />
              <Stat count={waived} label="Waived" color="#6366f1" />
            </div>
            <div
              className="relative h-2 rounded-full overflow-hidden"
              style={{ background: "rgba(15,23,42,0.05)" }}
            >
              <div
                className="absolute inset-y-0 left-0 rounded-full transition-all"
                style={{
                  width: `${pct}%`,
                  background: `linear-gradient(90deg, ${tone}aa, ${tone})`,
                  boxShadow: `0 0 8px ${tone}40`,
                }}
              />
            </div>
            <div className="text-[11px] text-smoke mt-1 font-mono">
              {pct.toFixed(0)}% complete
            </div>
          </div>
        </div>

        {/* Signatures roster */}
        <h2 className="display text-xl text-ink mb-3">Signature roster ({total})</h2>
        <div className="card divide-y divide-ink/5">
          {doc.signatures.length === 0 ? (
            <div className="p-8 text-center text-smoke italic text-sm">
              No assignees.
            </div>
          ) : (
            doc.signatures.map((s) => (
              <DocumentSignatureRow
                key={s.id}
                signatureId={s.id}
                employeeId={s.employee.id}
                employeeName={s.employee.name}
                employeeActive={s.employee.active}
                status={s.status as "PENDING" | "SIGNED" | "WAIVED"}
                signedAt={s.signedAt ? format(s.signedAt, "MMM d, yyyy 'at' h:mm a") : null}
                signedFileUrl={s.signedFileUrl}
                waivedByName={s.waivedBy?.name ?? null}
                waivedAt={s.waivedAt ? format(s.waivedAt, "MMM d, yyyy") : null}
                waiveReason={s.waiveReason}
                isAdmin={role === "ADMIN"}
                tenantSlug={params.tenant}
              />
            ))
          )}
        </div>
      </main>
    </div>
  );
}

function Stat({ count, label, color }: { count: number; label: string; color: string }) {
  return (
    <div className="text-center">
      <div className="display text-2xl" style={{ color }}>{count}</div>
      <div className="text-[10px] uppercase tracking-wider text-smoke font-semibold">{label}</div>
    </div>
  );
}
