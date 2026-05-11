/**
 * Per-employee payroll setup endpoint.
 *
 * GET   /api/employees/[id]/payroll-setup
 *   Returns the employee's current payroll-config fields + tenant locations
 *   for the primary-location dropdown.
 *
 * PATCH /api/employees/[id]/payroll-setup
 *   Updates primaryLocationId, localTaxJurisdiction, and pre-tax deduction
 *   amounts. Admin/manager only. Tenant-scoped.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/guards";
import { LOCAL_TAX_JURISDICTIONS } from "@/lib/payroll/local-tax";

const patchSchema = z.object({
  primaryLocationId: z.string().nullable(),
  localTaxJurisdiction: z.string().nullable(),
  preTax401kPercent: z.number().min(0).max(100),
  preTax401kAmount: z.number().min(0),
  preTaxHealthPremium: z.number().min(0),
  preTaxHsaAmount: z.number().min(0),
  preTaxFsaAmount: z.number().min(0),
});

async function loadEmployee(employeeId: string, tenantId: string) {
  return prisma.user.findFirst({
    where: { id: employeeId, tenantId },
    select: {
      id: true,
      name: true,
      email: true,
      primaryLocationId: true,
      primaryLocation: { select: { id: true, name: true, locState: true } },
      localTaxJurisdiction: true,
      preTax401kPercent: true,
      preTax401kAmount: true,
      preTaxHealthPremium: true,
      preTaxHsaAmount: true,
      preTaxFsaAmount: true,
    },
  });
}

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const auth = await requireRole(["ADMIN", "MANAGER"]);
  if ("error" in auth) return auth.error;
  if (auth.isSuperAdmin || !auth.tenantId) {
    return NextResponse.json({ error: "No tenant context" }, { status: 400 });
  }

  const employee = await loadEmployee(params.id, auth.tenantId);
  if (!employee) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const locations = await prisma.location.findMany({
    where: { tenantId: auth.tenantId, active: true },
    select: { id: true, name: true, locState: true, legalName: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({
    employee,
    locations,
    jurisdictions: LOCAL_TAX_JURISDICTIONS,
  });
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  const auth = await requireRole(["ADMIN", "MANAGER"]);
  if ("error" in auth) return auth.error;
  if (auth.isSuperAdmin || !auth.tenantId) {
    return NextResponse.json({ error: "No tenant context" }, { status: 400 });
  }

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const data = parsed.data;

  // Verify employee belongs to this tenant
  const employee = await prisma.user.findFirst({
    where: { id: params.id, tenantId: auth.tenantId },
    select: { id: true },
  });
  if (!employee) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Verify primaryLocationId (if set) belongs to this tenant
  if (data.primaryLocationId) {
    const loc = await prisma.location.findFirst({
      where: { id: data.primaryLocationId, tenantId: auth.tenantId },
      select: { id: true },
    });
    if (!loc) {
      return NextResponse.json(
        { error: "Primary location not in your tenant" },
        { status: 403 },
      );
    }
  }

  // Verify localTaxJurisdiction is one we know about
  if (data.localTaxJurisdiction) {
    const known = LOCAL_TAX_JURISDICTIONS.some(
      (j) => j.code === data.localTaxJurisdiction,
    );
    if (!known) {
      return NextResponse.json(
        { error: `Unknown local tax jurisdiction: ${data.localTaxJurisdiction}` },
        { status: 400 },
      );
    }
  }

  await prisma.user.update({
    where: { id: params.id },
    data: {
      primaryLocationId: data.primaryLocationId,
      localTaxJurisdiction: data.localTaxJurisdiction,
      preTax401kPercent: data.preTax401kPercent,
      preTax401kAmount: data.preTax401kAmount,
      preTaxHealthPremium: data.preTaxHealthPremium,
      preTaxHsaAmount: data.preTaxHsaAmount,
      preTaxFsaAmount: data.preTaxFsaAmount,
    },
  });

  const fresh = await loadEmployee(params.id, auth.tenantId);
  return NextResponse.json({ ok: true, employee: fresh });
}
