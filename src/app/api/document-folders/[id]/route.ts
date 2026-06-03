/**
 * PATCH /api/document-folders/[id]   Rename / recolor / reparent
 * DELETE /api/document-folders/[id]  Delete folder (docs become unfiled)
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/guards";

const patchSchema = z.object({
  name: z.string().min(1).max(100).trim().optional(),
  description: z.string().nullable().optional(),
  parentId: z.string().nullable().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  sortOrder: z.number().int().optional(),
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

  const existing = await prisma.documentFolder.findFirst({
    where: { id: params.id, tenantId: auth.tenantId },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

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

  // Prevent making a folder its own ancestor
  if (parsed.data.parentId === params.id) {
    return NextResponse.json({ error: "Cannot reparent a folder to itself" }, { status: 400 });
  }
  if (parsed.data.parentId) {
    const parent = await prisma.documentFolder.findFirst({
      where: { id: parsed.data.parentId, tenantId: auth.tenantId },
    });
    if (!parent) return NextResponse.json({ error: "Parent not found" }, { status: 400 });
    // Walk up parent chain to detect cycle
    let cursor: { id: string; parentId: string | null } | null = parent;
    while (cursor) {
      if (cursor.id === params.id) {
        return NextResponse.json({ error: "Cannot create folder cycle" }, { status: 400 });
      }
      if (!cursor.parentId) break;
      cursor = await prisma.documentFolder.findUnique({
        where: { id: cursor.parentId },
        select: { id: true, parentId: true },
      });
    }
  }

  const folder = await prisma.documentFolder.update({
    where: { id: params.id },
    data: parsed.data,
  });
  return NextResponse.json({ folder });
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

  const existing = await prisma.documentFolder.findFirst({
    where: { id: params.id, tenantId: auth.tenantId },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Documents in this folder become unfiled (folderId → null).
  // Child folders cascade-delete (per onDelete: Cascade), so child docs also unfile.
  await prisma.document.updateMany({
    where: { folderId: params.id },
    data: { folderId: null },
  });
  await prisma.documentFolder.delete({ where: { id: params.id } });

  return NextResponse.json({ ok: true });
}
