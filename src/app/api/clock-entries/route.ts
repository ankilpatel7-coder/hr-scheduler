import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/guards";

const schema = z.object({
  id: z.string(),
  clockIn: z.string().optional(),
  clockOut: z.string().nullable().optional(),
  editNote: z.string().optional(),
});

export async function PATCH(req: Request) {
  const auth = await requireRole(["ADMIN", "MANAGER"]);
  if ("error" in auth) return auth.error;

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const { id, clockIn, clockOut, editNote } = parsed.data;

  const data: any = { editedBy: auth.userId };
  if (clockIn) data.clockIn = new Date(clockIn);
  if (clockOut !== undefined) {
    data.clockOut = clockOut ? new Date(clockOut) : null;
  }
  if (editNote) data.editNote = editNote;

  const entry = await prisma.clockEntry.update({ where: { id }, data });
  return NextResponse.json({ entry });
}

export async function DELETE(req: Request) {
  const auth = await requireRole(["ADMIN", "MANAGER"]);
  if ("error" in auth) return auth.error;
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  await prisma.clockEntry.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

export async function POST(req: Request) {
  // Manager creates an entry manually (for someone who forgot)
  const auth = await requireRole(["ADMIN", "MANAGER"]);
  if ("error" in auth) return auth.error;
  const body = await req.json();
  const { userId, clockIn, clockOut, editNote } = body;
  if (!userId || !clockIn) {
    return NextResponse.json({ error: "Missing userId or clockIn" }, { status: 400 });
  }
  const entry = await prisma.clockEntry.create({
    data: {
      userId,
      clockIn: new Date(clockIn),
      clockOut: clockOut ? new Date(clockOut) : null,
      editedBy: auth.userId,
      editNote: editNote ?? "Created by manager",
    },
  });
  return NextResponse.json({ entry });
}
