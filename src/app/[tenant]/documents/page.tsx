/**
 * /[tenant]/documents — admin upload + list.
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/navbar";
import { getServerAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { FileText, ArrowLeft } from "lucide-react";
import { format } from "date-fns";
import DocumentUploadForm from "@/components/document-upload-form";
import DocumentRowActions from "@/components/document-row-actions";

export const dynamic = "force-dynamic";

export default async function DocumentsAdminPage({
  params,
}: {
  params: { tenant: string };
}) {
  const session = await getServerAuth();
  if (!session) redirect(`/login?from=/${params.tenant}/documents`);
  const role = (session.user as any).role;
  const tenantId = (session.user as any).tenantId as string | null;
  const isSuperAdmin = (session.user as any).superAdmin === true;
  if (isSuperAdmin) redirect("/superadmin");
  if (!tenantId) redirect("/login");
  if (role !== "ADMIN") redirect(`/${params.tenant}/dashboard`);

  const tenant = await prisma.tenant.findUnique({
    where: { slug: params.tenant },
    select: { id: true },
  });
  if (!tenant || tenant.id !== tenantId) redirect("/login");

  const docs = await prisma.document.findMany({
    where: { tenantId, active: true },
    orderBy: { createdAt: "desc" },
    include: {
      uploadedBy: { select: { id: true, name: true } },
      signatures: { select: { status: true } },
    },
  });

  const annotated = docs.map((d) => {
    const total = d.signatures.length;
    const signed = d.signatures.filter((s) => s.status === "SIGNED").length;
    const waived = d.signatures.filter((s) => s.status === "WAIVED").length;
    return { ...d, total, signed, waived, pending: total - signed - waived };
  });

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-5xl mx-auto px-6 py-10">
        <Link
          href={`/${params.tenant}/dashboard`}
          className="inline-flex items-center gap-1 text-xs text-rust hover:underline mb-3"
        >
          <ArrowLeft size={12} /> Back to dashboard
        </Link>
        <div className="flex items-center gap-2 mb-2">
          <FileText size={20} className="text-rust" />
          <h1 className="display text-3xl text-ink">Documents</h1>
        </div>
        <p className="text-sm text-smoke mb-6">
          Upload PDFs that every active employee must sign. Required documents
          block clock-in until signed. Signed copies are saved on each
          employee&rsquo;s profile.
        </p>

        <div className="grid md:grid-cols-[1fr,2fr] gap-6 items-start">
          <DocumentUploadForm />

          <div>
            <h2 className="display text-xl text-ink mb-3">Active documents</h2>
            {annotated.length === 0 ? (
              <div className="card p-8 text-center">
                <FileText size={32} className="text-smoke mx-auto mb-3" />
                <p className="text-sm text-ink/70">No documents yet.</p>
              </div>
            ) : (
              <div className="card divide-y divide-ink/5">
                {annotated.map((d) => {
                  const pct = d.total === 0 ? 0 : ((d.signed + d.waived) / d.total) * 100;
                  const tone =
                    pct >= 100 ? "#059669" : pct >= 50 ? "#d97706" : "#dc2626";
                  return (
                    <div key={d.id} className="p-4 hover:bg-ink/[0.02]">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="min-w-0 flex-1">
                          <Link
                            href={`/${params.tenant}/documents/${d.id}`}
                            className="text-sm font-medium text-ink hover:underline"
                          >
                            {d.title}
                          </Link>
                          <div className="text-[11px] text-smoke mt-0.5">
                            {(d.fileSize / 1024).toFixed(0)} KB · uploaded {format(d.createdAt, "MMM d, yyyy")} by {d.uploadedBy.name}
                            {d.required && (
                              <span
                                className="ml-2 inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide"
                                style={{ background: "rgba(220,38,38,0.08)", color: "#dc2626" }}
                              >
                                Required
                              </span>
                            )}
                          </div>
                          {d.description && (
                            <div className="text-xs text-smoke mt-1 italic">{d.description}</div>
                          )}
                        </div>
                        <DocumentRowActions documentId={d.id} fileUrl={d.fileUrl} />
                      </div>
                      <div className="mt-3">
                        <div className="flex items-baseline justify-between text-[11px] text-smoke mb-1">
                          <span>Signature progress</span>
                          <span className="font-mono" style={{ color: tone }}>
                            {d.signed} signed
                            {d.waived > 0 ? ` · ${d.waived} waived` : ""}
                            {" "}
                            / {d.total} total
                          </span>
                        </div>
                        <div className="relative h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(15,23,42,0.06)" }}>
                          <div
                            className="absolute inset-y-0 left-0 rounded-full transition-all"
                            style={{
                              width: `${pct}%`,
                              background: `linear-gradient(90deg, ${tone}aa, ${tone})`,
                              boxShadow: `0 0 8px ${tone}40`,
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
