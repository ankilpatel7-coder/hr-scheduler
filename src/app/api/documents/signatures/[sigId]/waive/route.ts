/**
 * Waive (or unwaive) a single document signature.
 *
 * POST   /api/documents/signatures/[sigId]/waive
 *        Body: { reason?: string }
 *        Marks the signature WAIVED with an audit trail (admin id + timestamp).
 *
 * DELETE /api/documents/signatures/[sigId]/waive
 *        Restores the signature to PENDING (clears waiver fields).
 *
 * Admin only. Tenant-scoped.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/guards";

const bodySchema = z.object({
  reason: z.string().max(500).nullable().optional(),
});

export async function POST(
  req: Request,
  { params }: { params: { sigId: string } },
) {
  const auth = await requireRole(["ADMIN", "MANAGER"]);
  if ("error" in auth) return auth.error;
  if (auth.isSuperAdmin || !auth.tenantId) {
    return NextResponse.json({ error: "No tenant context" }, { status: 400 });
  }

  // Verify the signature belongs to a doc in this tenant
  const sig = await prisma.documentSignature.findFirst({
    where: {
      id: params.sigId,
      document: { tenantId: auth.tenantId },
    },
  });
  if (!sig) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (sig.status !== "PENDING") {
    return NextResponse.json(
      { error: `Signature is already ${sig.status.toLowerCase()}` },
      { status: 409 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  const reason = parsed.success ? parsed.data.reason ?? null : null;

  await prisma.documentSignature.update({
    where: { id: params.sigId },
    data: {
      status: "WAIVED",
      waivedById: auth.userId,
      waivedAt: new Date(),
      waiveReason: reason,
    },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { sigId: string } },
) {
  const auth = await requireRole(["ADMIN", "MANAGER"]);
  if ("error" in auth) return auth.error;
  if (auth.isSuperAdmin || !auth.tenantId) {
    return NextResponse.json({ error: "No tenant context" }, { status: 400 });
  }

  const sig = await prisma.documentSignature.findFirst({
    where: {
      id: params.sigId,
      document: { tenantId: auth.tenantId },
    },
  });
  if (!sig) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (sig.status !== "WAIVED") {
    return NextResponse.json(
      { error: "Only waived signatures can be unwaived" },
      { status: 409 },
    );
  }

  await prisma.documentSignature.update({
    where: { id: params.sigId },
    data: {
      status: "PENDING",
      waivedById: null,
      waivedAt: null,
      waiveReason: null,
    },
  });

  return NextResponse.json({ ok: true });
}
