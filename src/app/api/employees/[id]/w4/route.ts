/**
 * v12.1: Employee W-4 settings API.
 * GET/PATCH the W-4 / payroll fields for an employee. Tenant-scoped.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/guards";

const FILING_STATUSES = ["SINGLE", "MARRIED_JOINT", "MARRIED_SEPARATE", "HEAD_OF_HOUSEHOLD"] as const;

const w4Schema = z.object({
  filingStatus: z.enum(FILING_STATUSES).optional(),
  multipleJobsCheckbox: z.boolean().optional(),
  dependentsCredit: z.number().min(0).optional(),
  otherIncome: z.number().min(0).optional(),
  deductionsAdjustment: z.number().min(0).optional(),
  extraWithholding: z.number().min(0).optional(),
  kyExemptionsAllowance: z.number().int().min(0).nullable().optional(),
});

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireRole(["ADMIN", "MANAGER"]);
  if ("error" in auth) return auth.error;
  if (auth.isSuperAdmin || !auth.tenantId) {
    return NextResponse.json({ error: "No tenant context" }, { status: 400 });
  }
  const tenantId = auth.tenantId;

  const employee = await prisma.user.findUnique({
    where: { id: params.id },
    select: {
      id: true, name: true, email: true, tenantId: true,
      filingStatus: true,
      multipleJobsCheckbox: true,
      dependentsCredit: true,
      otherIncome: true,
      deductionsAdjustment: true,
      extraWithholding: true,
      kyExemptionsAllowance: true,
    },
  });
  if (!employee) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (employee.tenantId !== tenantId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ employee });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireRole(["ADMIN"]);
  if ("error" in auth) return auth.error;
  if (auth.isSuperAdmin || !auth.tenantId) {
    return NextResponse.json({ error: "No tenant context" }, { status: 400 });
  }
  const tenantId = auth.tenantId;

  const body = await req.json().catch(() => null);
  const parsed = w4Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
  }

  const employee = await prisma.user.findUnique({ where: { id: params.id }, select: { tenantId: true } });
  if (!employee) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (employee.tenantId !== tenantId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const updated = await prisma.user.update({
    where: { id: params.id },
    data: parsed.data as any,
    select: {
      id: true, name: true,
      filingStatus: true, multipleJobsCheckbox: true, dependentsCredit: true,
      otherIncome: true, deductionsAdjustment: true, extraWithholding: true,
      kyExemptionsAllowance: true,
    },
  });
  return NextResponse.json({ employee: updated });
}
