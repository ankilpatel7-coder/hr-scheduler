/**
 * /[tenant]/my-documents — employee documents page v3.
 *
 * v3 fix: opens the existing DocumentSignModal in-page when employees click
 * "Sign now", instead of navigating to /[tenant]/documents/[id] (which is
 * an admin-only route and was bouncing employees to the dashboard).
 *
 * Server-side it just loads + groups data; the client wrapper handles
 * the collapsible sections + sign modal + refresh.
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { getServerAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { FileText, ArrowLeft } from "lucide-react";
import MyDocsClient, { type SigRow } from "./my-docs-client";
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
      document: {
        include: {
          folder: { select: { id: true, name: true, color: true } },
        },
      },
    },
    orderBy: [{ status: "asc" }, { document: { createdAt: "desc" } }],
  });

  const rows: SigRow[] = sigs.map((s) => ({
    id: s.id,
    documentId: s.document.id,
    title: s.document.title,
    description: s.document.description,
    fileName: s.document.fileName,
    fileUrl: s.document.fileUrl,
    required: s.document.required,
    requireSignature: s.document.requireSignature,
    version: s.document.version,
    status: s.status as "PENDING" | "SIGNED" | "WAIVED",
    signedAtISO: s.signedAt ? s.signedAt.toISOString() : null,
    signedFileUrl: s.signedFileUrl,
    waivedAtISO: s.waivedAt ? s.waivedAt.toISOString() : null,
    waiveReason: s.waiveReason,
    folderId: s.document.folderId,
    folderName: s.document.folder?.name ?? null,
    folderColor: s.document.folder?.color ?? null,
  }));

  return (
    <div className="min-h-screen"><main className="max-w-3xl mx-auto px-6 py-10">
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
          Hi {userName}. Sign the documents below to keep your access active.{" "}
          <strong>Required documents block clock-in until signed.</strong>
        </p>

        <MyDocsClient rows={rows} />
      </main>
      <DocsChatWidget />
    </div>
  );
}
