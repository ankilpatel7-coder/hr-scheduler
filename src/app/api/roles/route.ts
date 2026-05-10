/**
 * ShiftRole CRUD per tenant.
 *   GET  /api/roles            → list active roles (admin or staff)
 *   POST /api/roles            → admin creates a new role
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/guards";
import { isValidCategoryColor, DEFAULT_ROLE_COLOR } from "@/lib/category-colors";

const createSchema = z.object({
  name: z.string().min(1).max(40),
  color: z.string().optional(),
  sortOrder: z.number().int().optional(),
});

export async function GET() {
  const auth = await requireRole(["ADMIN", "MANAGER", "LEAD", "EMPLOYEE"]);
  if ("error" in auth) return auth.error;
  if (auth.isSuperAdmin || !auth.tenantId) {
    return NextResponse.json({ error: "No tenant context" }, { status: 400 });
  }
  const roles = await prisma.shiftRole.findMany({
    where: { tenantId: auth.tenantId, active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return NextResponse.json({ roles });
}

export async function POST(req: Request) {
  const auth = await requireRole(["ADMIN"]);
  if ("error" in auth) return auth.error;
  if (auth.isSuperAdmin || !auth.tenantId) {
    return NextResponse.json({ error: "No tenant context" }, { status: 400 });
  }
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
  }
  const name = parsed.data.name.trim();
  const color =
    parsed.data.color && isValidCategoryColor(parsed.data.color)
      ? parsed.data.color
      : DEFAULT_ROLE_COLOR;

  const dup = await prisma.shiftRole.findUnique({
    where: { tenantId_name: { tenantId: auth.tenantId, name } },
  });
  if (dup) {
    return NextResponse.json({ error: `Role "${name}" already exists.` }, { status: 409 });
  }

  const last = await prisma.shiftRole.findFirst({
    where: { tenantId: auth.tenantId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const sortOrder = parsed.data.sortOrder ?? (last?.sortOrder ?? 0) + 10;

  const role = await prisma.shiftRole.create({
    data: { tenantId: auth.tenantId, name, color, sortOrder },
  });
  return NextResponse.json({ role });
}
