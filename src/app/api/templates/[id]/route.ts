/**
 * Schedule Templates — single template ops.
 *
 * PATCH  /api/templates/[id]   Rename a template.
 * DELETE /api/templates/[id]   Delete a template (cascades to template shifts).
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/guards";

const patchSchema = z.object({
  name: z.string().min(1).max(80).trim(),
});

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
    const first = parsed.error.issues[0];
    const field = first.path.length > 0 ? first.path.join(".") : "input";
    return NextResponse.json(
      { error: `Invalid ${field}: ${first.message}`, issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const existing = await prisma.scheduleTemplate.findUnique({
    where: { id: params.id },
    select: { tenantId: true },
  });
  if (!existing || existing.tenantId !== auth.tenantId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Check for name collision
  const collision = await prisma.scheduleTemplate.findFirst({
    where: { tenantId: auth.tenantId, name: parsed.data.name, id: { not: params.id } },
    select: { id: true },
  });
  if (collision) {
    return NextResponse.json(
      { error: `A template named "${parsed.data.name}" already exists.` },
      { status: 409 },
    );
  }

  const template = await prisma.scheduleTemplate.update({
    where: { id: params.id },
    data: { name: parsed.data.name },
  });
  return NextResponse.json({ template });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const auth = await requireRole(["ADMIN", "MANAGER"]);
  if ("error" in auth) return auth.error;
  if (auth.isSuperAdmin || !auth.tenantId) {
    return NextResponse.json({ error: "No tenant context" }, { status: 400 });
  }

  const existing = await prisma.scheduleTemplate.findUnique({
    where: { id: params.id },
    select: { tenantId: true },
  });
  if (!existing || existing.tenantId !== auth.tenantId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.scheduleTemplate.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
