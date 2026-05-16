/**
 * /[tenant]/my-documents — employee documents page v2 (folder-grouped).
 *
 * Server component. Pure HTML <details>/<summary> for collapsibility so we
 * don't need a client wrapper. Folders with pending sigs auto-expand.
 *
 * Each folder section shows:
 *   - Pending docs first (highlighted "Sign now" CTA)
 *   - Signed / waived docs below (quieter style)
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/navbar";
import { getServerAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  FileText,
  ArrowLeft,
  Folder as FolderIcon,
  CheckCircle2,
  Clock,
  AlertCircle,
  ChevronRight,
  ExternalLink,
} from "lucide-react";
import { format } from "date-fns";
import DocsChatWidget from "@/components/docs-chat-widget";

export const dynamic = "force-dynamic";

type SigStatus = "PENDING" | "SIGNED" | "WAIVED";

type SigRow = {
  id: string;
  documentId: string;
  title: string;
  description: string | null;
  fileName: string;
  fileUrl: string;
  required: boolean;
  version: number;
  status: SigStatus;
  signedAt: Date | null;
  signedFileUrl: string | null;
  waivedAt: Date | null;
  waiveReason: string | null;
  folderId: string | null;
  folderName: string | null;
  folderColor: string | null;
};

type FolderGroup = {
  key: string;
  name: string;
  color: string | null;
  docs: SigRow[];
  pendingCount: number;
};

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
    version: s.document.version,
    status: s.status as SigStatus,
    signedAt: s.signedAt,
    signedFileUrl: s.signedFileUrl,
    waivedAt: s.waivedAt,
    waiveReason: s.waiveReason,
    folderId: s.document.folderId,
    folderName: s.document.folder?.name ?? null,
    folderColor: s.document.folder?.color ?? null,
  }));

  // Group by folder
  const groupMap = new Map<string, FolderGroup>();
  for (const r of rows) {
    const key = r.folderId ?? "__unfiled";
    if (!groupMap.has(key)) {
      groupMap.set(key, {
        key,
        name: r.folderName ?? "Other documents",
        color: r.folderColor,
        docs: [],
        pendingCount: 0,
      });
    }
    const g = groupMap.get(key)!;
    g.docs.push(r);
    if (r.status === "PENDING") g.pendingCount++;
  }

  // Sort groups: pending-having groups first, then alpha.
  const groups = Array.from(groupMap.values()).sort((a, b) => {
    if ((a.pendingCount > 0) !== (b.pendingCount > 0)) {
      return a.pendingCount > 0 ? -1 : 1;
    }
    if (a.key === "__unfiled") return 1;
    if (b.key === "__unfiled") return -1;
    return a.name.localeCompare(b.name);
  });

  // Within each group: pending first, signed below.
  for (const g of groups) {
    g.docs.sort((a, b) => {
      if (a.status === b.status) return 0;
      if (a.status === "PENDING") return -1;
      if (b.status === "PENDING") return 1;
      return 0;
    });
  }

  const totalPending = rows.filter((r) => r.status === "PENDING").length;

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
          Hi {userName}. Sign the documents below to keep your access active.{" "}
          <strong>Required documents block clock-in until signed.</strong>
        </p>

        {totalPending > 0 && (
          <div className="mb-6 rounded-2xl bg-amber-50 ring-1 ring-amber-200 px-4 py-3 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
            <div className="text-sm">
              <span className="font-semibold text-amber-900">
                {totalPending} document{totalPending === 1 ? "" : "s"} need your
                signature.
              </span>{" "}
              <span className="text-amber-800">
                Folders with pending docs are expanded below.
              </span>
            </div>
          </div>
        )}

        {groups.length === 0 ? (
          <div className="rounded-2xl bg-white ring-1 ring-slate-200 px-6 py-16 text-center text-smoke">
            <FileText className="w-10 h-10 mx-auto mb-3 text-slate-300" />
            <p className="text-sm">
              You don&apos;t have any documents assigned yet.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {groups.map((g) => (
              <details
                key={g.key}
                open={g.pendingCount > 0}
                className="group rounded-2xl bg-white ring-1 ring-slate-200 overflow-hidden"
              >
                <summary className="cursor-pointer list-none px-4 py-3 flex items-center gap-3 hover:bg-slate-50 select-none">
                  <ChevronRight className="w-4 h-4 text-slate-400 transition-transform group-open:rotate-90" />
                  {g.color ? (
                    <span
                      className="w-3.5 h-3.5 rounded-sm shrink-0"
                      style={{ backgroundColor: g.color }}
                      aria-hidden
                    />
                  ) : (
                    <FolderIcon className="w-4 h-4 text-amber-500 shrink-0" />
                  )}
                  <span className="font-semibold text-ink flex-1 truncate">
                    {g.name}
                  </span>
                  <span className="text-xs text-slate-500">
                    {g.docs.length} doc{g.docs.length === 1 ? "" : "s"}
                  </span>
                  {g.pendingCount > 0 && (
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                      {g.pendingCount} pending
                    </span>
                  )}
                </summary>
                <ul className="divide-y divide-slate-100 border-t border-slate-100">
                  {g.docs.map((d) => (
                    <DocItem
                      key={d.id}
                      doc={d}
                      tenantSlug={params.tenant}
                    />
                  ))}
                </ul>
              </details>
            ))}
          </div>
        )}
      </main>
      <DocsChatWidget />
    </div>
  );
}

function DocItem({
  doc,
  tenantSlug,
}: {
  doc: SigRow;
  tenantSlug: string;
}) {
  const isPending = doc.status === "PENDING";
  const isSigned = doc.status === "SIGNED";
  const isWaived = doc.status === "WAIVED";

  return (
    <li
      className={`px-4 py-3 flex items-center gap-3 ${
        isPending ? "bg-amber-50/40" : ""
      }`}
    >
      <span className="shrink-0">
        {isPending ? (
          <Clock className="w-5 h-5 text-amber-600" />
        ) : isSigned ? (
          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
        ) : (
          <CheckCircle2 className="w-5 h-5 text-slate-400" />
        )}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <Link
            href={`/${tenantSlug}/documents/${doc.documentId}`}
            className="font-medium text-ink hover:text-rust truncate"
          >
            {doc.title}
          </Link>
          {doc.version > 1 && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 font-medium">
              v{doc.version}
            </span>
          )}
          {doc.required && isPending && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 font-medium">
              Required
            </span>
          )}
        </div>
        <div className="mt-0.5 text-xs text-smoke">
          {isPending && (
            <span>{doc.description ?? "Awaiting your signature."}</span>
          )}
          {isSigned && doc.signedAt && (
            <span>
              Signed on{" "}
              {format(doc.signedAt, "MMM d, yyyy 'at' h:mm a")}
            </span>
          )}
          {isWaived && doc.waivedAt && (
            <span>
              Waived on {format(doc.waivedAt, "MMM d, yyyy")}
              {doc.waiveReason ? ` — ${doc.waiveReason}` : ""}
            </span>
          )}
        </div>
      </div>
      <div className="shrink-0">
        {isPending ? (
          <Link
            href={`/${tenantSlug}/documents/${doc.documentId}`}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rust text-white text-xs font-medium hover:opacity-90"
          >
            Sign now
          </Link>
        ) : isSigned && doc.signedFileUrl ? (
          <a
            href={doc.signedFileUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg ring-1 ring-slate-200 text-slate-600 text-xs hover:bg-slate-50"
          >
            <ExternalLink className="w-3 h-3" /> View signed
          </a>
        ) : (
          <a
            href={doc.fileUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg ring-1 ring-slate-200 text-slate-600 text-xs hover:bg-slate-50"
          >
            <ExternalLink className="w-3 h-3" /> Open PDF
          </a>
        )}
      </div>
    </li>
  );
}
