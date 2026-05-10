/**
 * ShiftTag CRUD per tenant.
 *   GET  /api/tags
 *   POST /api/tags
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/guards";
import { isValidCategoryColor, DEFAULT_TAG_COLOR } from "@/lib/category-colors";

const createSchema = z.object({
  name: z.string().min(1).max(40),
  color: z.string().optional(),
});

export async function GET() {
  const auth = await requireRole(["ADMIN", "MANAGER", "LEAD", "EMPLOYEE"]);
  if ("error" in auth) return auth.error;
  if (auth.isSuperAdmin || !auth.tenantId) {
    return NextResponse.json({ error: "No tenant context" }, { status: 400 });
  }
  const tags = await prisma.shiftTag.findMany({
    where: { tenantId: auth.tenantId, active: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ tags });
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
      : DEFAULT_TAG_COLOR;

  const dup = await prisma.shiftTag.findUnique({
    where: { tenantId_name: { tenantId: auth.tenantId, name } },
  });
  if (dup) {
    return NextResponse.json({ error: `Tag "${name}" already exists.` }, { status: 409 });
  }

  const tag = await prisma.shiftTag.create({
    data: { tenantId: auth.tenantId, name, color },
  });
  return NextResponse.json({ tag });
}
