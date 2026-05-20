/**
 * Bulk document actions.
 *
 * POST /api/documents/bulk { ids: string[], action: ..., folderId?: string, required?: boolean }
 *
 * Actions:
 *   - move        Move all selected to folderId (null = unfiled)
 *   - archive     Set active=false on all selected (soft-delete)
 *   - unarchive   Set active=true
 *   - setRequired Set required=true/false on all selected
 *
 * Admin only.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/guards";

const bodySchema = z.object({
  ids: z.array(z.string()).min(1).max(200),
  action: z.enum(["move", "archive", "unarchive", "setRequired"]),
  folderId: z.string().nullable().optional(),
  required: z.boolean().optional(),
});

export async function POST(req: Request) {
  const auth = await requireRole(["ADMIN"]);
  if ("error" in auth) return auth.error;
  if (auth.isSuperAdmin || !auth.tenantId) {
    return NextResponse.json({ error: "No tenant context" }, { status: 400 });
  }

  const body = await req.json();
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const field = first.path.length > 0 ? first.path.join(".") : "input";
    return NextResponse.json(
      { error: `Invalid ${field}: ${first.message}`, issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { ids, action, folderId, required } = parsed.data;

  // Verify all docs belong to this tenant
  const owned = await prisma.document.findMany({
    where: { id: { in: ids }, tenantId: auth.tenantId },
    select: { id: true },
  });
  const ownedIds = owned.map((d) => d.id);
  if (ownedIds.length === 0) {
    return NextResponse.json({ error: "No matching documents in your tenant" }, { status: 404 });
  }

  let data: any;
  switch (action) {
    case "move":
      if (folderId !== undefined) {
        // Verify folder if not null
        if (folderId !== null) {
          const folder = await prisma.documentFolder.findFirst({
            where: { id: folderId, tenantId: auth.tenantId },
            select: { id: true },
          });
          if (!folder) {
            return NextResponse.json({ error: "Folder not found" }, { status: 400 });
          }
        }
        data = { folderId: folderId };
      } else {
        return NextResponse.json({ error: "folderId required for move" }, { status: 400 });
      }
      break;
    case "archive":
      data = { active: false };
      break;
    case "unarchive":
      data = { active: true };
      break;
    case "setRequired":
      if (typeof required !== "boolean") {
        return NextResponse.json({ error: "required required for setRequired" }, { status: 400 });
      }
      data = { required };
      break;
  }

  const result = await prisma.document.updateMany({
    where: { id: { in: ownedIds } },
    data,
  });

  return NextResponse.json({ updated: result.count, action });
}
