/**
 * /api/tenant/settings — admin can update their own tenant's operational
 * settings (currently: requireClockApproval).
 *
 * GET   → current settings
 * PATCH → update settings
 *
 * Admin only. Limited to fields exposed here (no PII-style edits).
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/guards";

const patchSchema = z.object({
  requireClockApproval: z.boolean().optional(),
  enableHouseShifts: z.boolean().optional(),
  requireBreakSelfie: z.boolean().optional(),
});

export async function GET() {
  const auth = await requireRole(["ADMIN", "MANAGER"]);
  if ("error" in auth) return auth.error;
  if (auth.isSuperAdmin || !auth.tenantId) {
    return NextResponse.json({ error: "No tenant context" }, { status: 400 });
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: auth.tenantId },
    select: {
      requireClockApproval: true,
      enableHouseShifts: true,
      requireBreakSelfie: true,
      businessName: true,
    },
  });

  return NextResponse.json({ tenant });
}

export async function PATCH(req: Request) {
  const auth = await requireRole(["ADMIN"]);
  if ("error" in auth) return auth.error;
  if (auth.isSuperAdmin || !auth.tenantId) {
    return NextResponse.json({ error: "No tenant context" }, { status: 400 });
  }

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const field = first.path.length > 0 ? first.path.join(".") : "input";
    return NextResponse.json(
      { error: `Invalid ${field}: ${first.message}`, issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const tenant = await prisma.tenant.update({
    where: { id: auth.tenantId },
    data: parsed.data,
    select: {
      requireClockApproval: true,
      enableHouseShifts: true,
      requireBreakSelfie: true,
      businessName: true,
    },
  });

  return NextResponse.json({ tenant });
}
