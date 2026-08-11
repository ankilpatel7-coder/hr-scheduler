/**
 * POST /api/employees/[id]/pin
 *
 * Tenant ADMIN/MANAGER resets an employee's PIN. Returns the new temp PIN
 * for the admin to communicate to the employee out-of-band.
 *
 * Tenant boundary enforced: admin can only reset PINs for employees in their tenant.
 * Manager scoping: Managers can only reset for EMPLOYEE/LEAD at their location(s).
 */

import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { requireRole, getScopedEmployeeIds } from "@/lib/guards";
import { generateUniquePin } from "@/lib/pin";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireRole(["ADMIN", "MANAGER"]);
  if ("error" in auth) return auth.error;
  if (auth.isSuperAdmin || !auth.tenantId) {
    return NextResponse.json({ error: "No tenant context" }, { status: 400 });
  }
  const tenantId = auth.tenantId;

  const target = await prisma.user.findUnique({
    where: { id: params.id },
    select: { id: true, name: true, email: true, role: true, tenantId: true },
  });
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (target.tenantId !== tenantId) {
    return NextResponse.json({ error: "Forbidden — different tenant" }, { status: 403 });
  }

  if (auth.role === "MANAGER") {
    if (target.role !== "EMPLOYEE" && target.role !== "LEAD") {
      return NextResponse.json({ error: "Managers can only reset PINs for Employees and Leads." }, { status: 403 });
    }
    const scoped = await getScopedEmployeeIds(auth.userId, "MANAGER");
    if (!scoped || !scoped.includes(target.id)) {
      return NextResponse.json({ error: "You can only reset PINs for staff at your location(s)." }, { status: 403 });
    }
  }

  // Guaranteed not to collide with another active employee in this tenant —
  // a duplicate would break kiosk login for both of them.
  let tempPin: string;
  try {
    tempPin = await generateUniquePin(tenantId);
  } catch {
    return NextResponse.json(
      { error: "Could not generate an unused PIN. Please try again." },
      { status: 500 },
    );
  }
  const pinHash = await bcrypt.hash(tempPin, 10);
  await prisma.user.update({
    where: { id: target.id },
    data: { pinHash, pinUpdatedAt: new Date() },
  });

  return NextResponse.json({
    user: { id: target.id, email: target.email, name: target.name },
    tempPin,
  });
}
