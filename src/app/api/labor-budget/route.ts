/**
 * Labor budget API — per-tenant daily/weekly $ caps.
 *
 * GET /api/labor-budget        → returns the tenant's budget config (or zeros)
 * PUT /api/labor-budget        → upserts the tenant's budget config (admin only)
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/guards";

const putSchema = z.object({
  budgetMon: z.number().min(0),
  budgetTue: z.number().min(0),
  budgetWed: z.number().min(0),
  budgetThu: z.number().min(0),
  budgetFri: z.number().min(0),
  budgetSat: z.number().min(0),
  budgetSun: z.number().min(0),
  budgetWeekly: z.number().min(0),
});

const ZERO = {
  budgetMon: 0, budgetTue: 0, budgetWed: 0, budgetThu: 0,
  budgetFri: 0, budgetSat: 0, budgetSun: 0, budgetWeekly: 0,
};

export async function GET() {
  const auth = await requireRole(["ADMIN", "MANAGER"]);
  if ("error" in auth) return auth.error;
  if (auth.isSuperAdmin || !auth.tenantId) {
    return NextResponse.json({ error: "No tenant context" }, { status: 400 });
  }

  const budget = await prisma.laborBudget.findUnique({
    where: { tenantId: auth.tenantId },
  });
  return NextResponse.json({ budget: budget ?? { tenantId: auth.tenantId, ...ZERO } });
}

export async function PUT(req: Request) {
  const auth = await requireRole(["ADMIN"]);
  if ("error" in auth) return auth.error;
  if (auth.isSuperAdmin || !auth.tenantId) {
    return NextResponse.json({ error: "No tenant context" }, { status: 400 });
  }

  const body = await req.json();
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
  }

  const budget = await prisma.laborBudget.upsert({
    where: { tenantId: auth.tenantId },
    update: parsed.data,
    create: { tenantId: auth.tenantId, ...parsed.data },
  });

  return NextResponse.json({ budget });
}
