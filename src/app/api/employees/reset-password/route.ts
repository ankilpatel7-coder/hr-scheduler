import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole, getScopedEmployeeIds } from "@/lib/guards";

const schema = z.object({
  userId: z.string(),
  newPassword: z.string().min(6).max(128),
});

export async function POST(req: Request) {
  const auth = await requireRole(["ADMIN", "MANAGER"]);
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const { userId, newPassword } = parsed.data;

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Manager guardrails: can only reset for EMPLOYEE/LEAD at their location
  if (auth.role === "MANAGER") {
    if (target.role !== "EMPLOYEE" && target.role !== "LEAD") {
      return NextResponse.json(
        { error: "Managers can only reset passwords for Employees and Leads." },
        { status: 403 }
      );
    }
    const scoped = await getScopedEmployeeIds(auth.userId, "MANAGER");
    if (!scoped || !scoped.includes(userId)) {
      return NextResponse.json(
        { error: "You can only reset passwords for staff at your location(s)." },
        { status: 403 }
      );
    }
  }

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await bcrypt.hash(newPassword, 10) },
  });

  // Invalidate any pending password-reset tokens
  await prisma.passwordReset.updateMany({
    where: { userId, usedAt: null },
    data: { usedAt: new Date() },
  });

  return NextResponse.json({
    ok: true,
    message: `Password for ${target.name} has been reset. Share the new password with them securely.`,
  });
}
