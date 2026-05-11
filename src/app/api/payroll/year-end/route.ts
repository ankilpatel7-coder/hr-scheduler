/**
 * Year-end aggregations endpoint.
 *
 * GET /api/payroll/year-end?year=2026
 *   Returns per-employee W-2 summaries + per-quarter 941 summaries for the
 *   given calendar year. Admin-only.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/guards";
import { computeW2Data, compute941Data } from "@/lib/payroll/year-end";

export async function GET(req: Request) {
  const auth = await requireRole(["ADMIN"]);
  if ("error" in auth) return auth.error;
  if (auth.isSuperAdmin || !auth.tenantId) {
    return NextResponse.json({ error: "No tenant context" }, { status: 400 });
  }
  const tenantId = auth.tenantId;

  const { searchParams } = new URL(req.url);
  const yearStr = searchParams.get("year");
  const year = yearStr ? parseInt(yearStr, 10) : new Date().getFullYear();
  if (Number.isNaN(year) || year < 2020 || year > 2100) {
    return NextResponse.json({ error: "Invalid year" }, { status: 400 });
  }

  // Find every employee with at least one finalized stub this year.
  const employeesWithStubs = await prisma.user.findMany({
    where: {
      tenantId,
      payStubs: {
        some: {
          payPeriod: {
            tenantId,
            periodStart: {
              gte: new Date(year, 0, 1),
              lt: new Date(year + 1, 0, 1),
            },
            status: "FINALIZED",
          },
        },
      },
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const w2s = await Promise.all(
    employeesWithStubs.map((e) => computeW2Data(tenantId, e.id, year)),
  );

  const quarters = await Promise.all(
    [1, 2, 3, 4].map((q) =>
      compute941Data(tenantId, year, q as 1 | 2 | 3 | 4),
    ),
  );

  return NextResponse.json({
    year,
    employeeCount: employeesWithStubs.length,
    w2s: w2s.filter(Boolean),
    quarters,
  });
}
