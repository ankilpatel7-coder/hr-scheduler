/**
 * /[tenant]/my-documents — employee's required + signed documents.
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/navbar";
import { getServerAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { FileText, ArrowLeft } from "lucide-react";
import { format } from "date-fns";
import MyDocumentsList from "@/components/my-documents-list";
import DocsChatWidget from "@/components/docs-chat-widget";

export const dynamic = "force-dynamic";

export default async function MyDocumentsPage({
  params,
}: {
  params: { tenant: string };
}) {
  const session = await getServerAuth();
  if (!session) redirect(`/login?from=/${params.tenant}/my-documents`);
  const userId = (session.user as any).id as string;
  const userName = (session.user as any).name as string;
  const tenantId = (session.user as any).tenantId as string | null;
  if (!tenantId) redirect("/login");

  const tenant = await prisma.tenant.findUnique({
    where: { slug: params.tenant },
    select: { id: true },
  });
  if (!tenant || tenant.id !== tenantId) redirect("/login");

  const sigs = await prisma.documentSignature.findMany({
    where: {
      employeeId: userId,
      document: { tenantId, active: true },
    },
    include: {
      document: true,
    },
    orderBy: [{ status: "asc" }, { document: { createdAt: "desc" } }],
  });

  const pending = sigs.filter((s) => s.status === "PENDING");
  const completed = sigs.filter((s) => s.status !== "PENDING");

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-3xl mx-auto px-6 py-10">
        <Link
          href={`/${params.tenant}/dashboard`}
          className="inline-flex items-center gap-1 text-xs text-rust hover:underline mb-3"
        >
          <ArrowLeft size={12} /> Back to dashboard
        </Link>
        <div className="flex items-center gap-2 mb-2">
          <FileText size={20} className="text-rust" />
          <h1 className="display text-3xl text-ink">My documents</h1>
        </div>
        <p className="text-sm text-smoke mb-6">
          Hi {userName}. Sign the documents below to keep your access
          active. <strong>Required documents block clock-in until signed.</strong>
        </p>

        <MyDocumentsList
          pending={pending.map((s) => ({
            id: s.id,
            documentId: s.document.id,
            title: s.document.title,
            description: s.document.description,
            fileUrl: s.document.fileUrl,
            fileName: s.document.fileName,
            required: s.document.required,
          }))}
          completed={completed.map((s) => ({
            id: s.id,
            documentId: s.document.id,
            title: s.document.title,
            fileName: s.document.fileName,
            status: s.status as "SIGNED" | "WAIVED",
            signedAt: s.signedAt ? format(s.signedAt, "MMM d, yyyy 'at' h:mm a") : null,
            signedFileUrl: s.signedFileUrl,
            waivedAt: s.waivedAt ? format(s.waivedAt, "MMM d, yyyy") : null,
            waiveReason: s.waiveReason,
          }))}
        />
      </main>
      <DocsChatWidget />
    </div>
  );
}
