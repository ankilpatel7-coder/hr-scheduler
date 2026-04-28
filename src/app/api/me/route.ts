import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/guards";

export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const me = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      photoUrl: true,
    },
  });
  if (!me) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ user: me });
}
