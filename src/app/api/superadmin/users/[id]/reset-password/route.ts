/**
 * POST /api/superadmin/users/[id]/reset-password
 *
 * Super-admin generates a new temporary password for any user. Useful when an
 * admin forgets their password (no email is set up so self-serve reset is unavailable).
 *
 * Returns the temp password ONCE — caller (super-admin UI) must save & deliver
 * to the user out-of-band.
 */

import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/tenant";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireSuperAdmin();
  if ("error" in auth) return auth.error;

  const target = await prisma.user.findUnique({
    where: { id: params.id },
    select: { id: true, email: true, name: true, superAdmin: true },
  });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // Prevent super-admins from resetting their own password this way (they should
  // use /change-password which requires the current password).
  if (target.id === auth.userId) {
    return NextResponse.json({
      error: "Use /change-password to change your own password.",
    }, { status: 400 });
  }

  const tempPassword = randomBytes(12).toString("base64").replace(/[+/=]/g, "").slice(0, 16);
  const passwordHash = await bcrypt.hash(tempPassword, 10);

  await prisma.user.update({
    where: { id: params.id },
    data: { passwordHash },
  });

  return NextResponse.json({
    user: { id: target.id, email: target.email, name: target.name },
    tempPassword,
  });
}
