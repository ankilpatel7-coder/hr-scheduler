/**
 * /[tenant]/documents — admin documents page v2 (folder tree + bulk select).
 *
 * Server component: loads folders + docs, then hands off to client.
 */

import { redirect } from "next/navigation";
import Navbar from "@/components/navbar";
import { getServerAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import DocumentsClient from "./documents-client";
import DocsChatWidget from "@/components/docs-chat-widget";

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

  const [folders, docs] = await Promise.all([
    prisma.documentFolder.findMany({
      where: { tenantId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: {
        _count: { select: { documents: { where: { active: true } } } },
      },
    }),
    prisma.document.findMany({
      where: { tenantId, active: true },
      orderBy: { createdAt: "desc" },
      include: {
        uploadedBy: { select: { id: true, name: true } },
        folder: { select: { id: true, name: true, color: true } },
        signatures: { select: { status: true } },
      },
    }),
  ]);

  const folderList = folders.map((f) => ({
    id: f.id,
    parentId: f.parentId,
    name: f.name,
    description: f.description,
    color: f.color,
    sortOrder: f.sortOrder,
    documentCount: f._count.documents,
  }));

  const docList = docs.map((d) => {
    const total = d.signatures.length;
    const signed = d.signatures.filter((s) => s.status === "SIGNED").length;
    const waived = d.signatures.filter((s) => s.status === "WAIVED").length;
    return {
      id: d.id,
      title: d.title,
      fileName: d.fileName,
      fileUrl: d.fileUrl,
      fileSize: d.fileSize,
      required: d.required,
      version: d.version,
      folderId: d.folderId,
      folderName: d.folder?.name ?? null,
      folderColor: d.folder?.color ?? null,
      uploadedByName: d.uploadedBy.name,
      createdAt: d.createdAt.toISOString(),
      total,
      signed,
      waived,
      pending: total - signed - waived,
    };
  });

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <DocumentsClient
          tenantSlug={params.tenant}
          initialFolders={folderList}
          initialDocs={docList}
        />
      </main>
      <DocsChatWidget />
    </div>
  );
}
