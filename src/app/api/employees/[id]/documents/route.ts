/**
 * Per-employee document list.
 *
 * GET /api/employees/[id]/documents
 *   Employees can fetch their own; ADMIN/MANAGER can fetch anyone's.
 *
 *   Returns a list of { signature, document } pairs. Includes:
 *     - PENDING signatures (need to sign)
 *     - SIGNED signatures (with signedFileUrl)
 *     - WAIVED signatures (admin marked optional)
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerAuth } from "@/lib/auth";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const session = await getServerAuth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id as string;
  const role = (session.user as any).role as string;
  const tenantId = (session.user as any).tenantId as string | null;
  if (!tenantId) {
    return NextResponse.json({ error: "No tenant context" }, { status: 400 });
  }

  // Permission: own docs, OR manager/admin viewing someone else's
  if (params.id !== userId && role !== "ADMIN" && role !== "MANAGER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Verify target belongs to same tenant
  const target = await prisma.user.findFirst({
    where: { id: params.id, tenantId },
    select: { id: true, name: true },
  });
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const sigs = await prisma.documentSignature.findMany({
    where: {
      employeeId: params.id,
      document: { tenantId, active: true },
    },
    include: {
      document: {
        select: {
          id: true,
          title: true,
          description: true,
          fileName: true,
          fileSize: true,
          required: true,
          createdAt: true,
        },
      },
    },
    orderBy: [
      { status: "asc" }, // PENDING first
      { document: { createdAt: "desc" } },
    ],
  });

  return NextResponse.json({
    employee: target,
    signatures: sigs.map((s) => ({
      id: s.id,
      status: s.status,
      signedAt: s.signedAt,
      signedFileUrl: s.signedFileUrl,
      waivedAt: s.waivedAt,
      waiveReason: s.waiveReason,
      document: s.document,
    })),
  });
}
