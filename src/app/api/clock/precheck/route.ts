/**
 * Clock-in precheck.
 *
 * GET /api/clock/precheck
 *   Returns whether the current user is allowed to clock in. Blocks if any
 *   REQUIRED document is unsigned (PENDING). Returns the list of blockers
 *   so the UI can route the user to /my-documents.
 *
 *   { canClockIn: boolean, blockedBy: { documentId, title }[] }
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerAuth } from "@/lib/auth";

export async function GET() {
  const session = await getServerAuth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id as string;
  const tenantId = (session.user as any).tenantId as string | null;
  if (!tenantId) {
    return NextResponse.json({ canClockIn: true, blockedBy: [] });
  }

  const blockers = await prisma.documentSignature.findMany({
    where: {
      employeeId: userId,
      status: "PENDING",
      document: { tenantId, active: true, required: true },
    },
    select: {
      document: { select: { id: true, title: true } },
    },
  });

  return NextResponse.json({
    canClockIn: blockers.length === 0,
    blockedBy: blockers.map((b) => ({
      documentId: b.document.id,
      title: b.document.title,
    })),
  });
}
