/**
 * ShiftTag single-record API.
 *   PATCH  /api/tags/[id]
 *   DELETE /api/tags/[id]    → soft-delete
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/guards";
import { isValidCategoryColor } from "@/lib/category-colors";

const patchSchema = z.object({
  name: z.string().min(1).max(40).optional(),
  color: z.string().optional(),
  active: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireRole(["ADMIN"]);
  if ("error" in auth) return auth.error;
  if (auth.isSuperAdmin || !auth.tenantId) {
    return NextResponse.json({ error: "No tenant context" }, { status: 400 });
  }
  const tag = await prisma.shiftTag.findUnique({ where: { id: params.id } });
  if (!tag || tag.tenantId !== auth.tenantId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
  }
  const data: any = {};
  if (parsed.data.name) data.name = parsed.data.name.trim();
  if (parsed.data.color) {
    if (!isValidCategoryColor(parsed.data.color)) {
      return NextResponse.json({ error: "Invalid color" }, { status: 400 });
    }
    data.color = parsed.data.color;
  }
  if (parsed.data.active !== undefined) data.active = parsed.data.active;

  const updated = await prisma.shiftTag.update({ where: { id: params.id }, data });
  return NextResponse.json({ tag: updated });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireRole(["ADMIN"]);
  if ("error" in auth) return auth.error;
  if (auth.isSuperAdmin || !auth.tenantId) {
    return NextResponse.json({ error: "No tenant context" }, { status: 400 });
  }
  const tag = await prisma.shiftTag.findUnique({ where: { id: params.id } });
  if (!tag || tag.tenantId !== auth.tenantId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await prisma.shiftTag.update({ where: { id: params.id }, data: { active: false } });
  return NextResponse.json({ ok: true });
}
