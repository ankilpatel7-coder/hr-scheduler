/**
 * Document folders API.
 *
 * GET  /api/document-folders               List folder tree
 * POST /api/document-folders               Create folder { name, parentId?, color? }
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/guards";

const postSchema = z.object({
  name: z.string().min(1).max(100).trim(),
  description: z.string().nullable().optional(),
  parentId: z.string().nullable().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
});

export async function GET() {
  const auth = await requireRole(["ADMIN", "MANAGER", "LEAD", "EMPLOYEE"]);
  if ("error" in auth) return auth.error;
  if (auth.isSuperAdmin || !auth.tenantId) {
    return NextResponse.json({ error: "No tenant context" }, { status: 400 });
  }

  const folders = await prisma.documentFolder.findMany({
    where: { tenantId: auth.tenantId },
    orderBy: [{ parentId: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { documents: true, children: true } } },
  });

  return NextResponse.json({ folders });
}

export async function POST(req: Request) {
  const auth = await requireRole(["ADMIN", "MANAGER"]);
  if ("error" in auth) return auth.error;
  if (auth.isSuperAdmin || !auth.tenantId) {
    return NextResponse.json({ error: "No tenant context" }, { status: 400 });
  }

  const body = await req.json();
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const field = first.path.length > 0 ? first.path.join(".") : "input";
    return NextResponse.json(
      { error: `Invalid ${field}: ${first.message}`, issues: parsed.error.issues },
      { status: 400 },
    );
  }

  // Validate parentId is in same tenant
  if (parsed.data.parentId) {
    const parent = await prisma.documentFolder.findFirst({
      where: { id: parsed.data.parentId, tenantId: auth.tenantId },
      select: { id: true },
    });
    if (!parent) return NextResponse.json({ error: "Parent not found" }, { status: 400 });
  }

  const folder = await prisma.documentFolder.create({
    data: {
      tenantId: auth.tenantId,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      parentId: parsed.data.parentId ?? null,
      color: parsed.data.color ?? null,
      createdById: auth.userId,
    },
  });

  return NextResponse.json({ folder });
}
