/**
 * POST /api/_admin/tenants/[id]/admins
 *
 * Creates a new ADMIN user for a tenant. Generates a temporary password.
 */

import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/tenant";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireSuperAdmin();
  if ("error" in auth) return auth.error;

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const tenant = await prisma.tenant.findUnique({ where: { id: params.id } });
  if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

  const email = String(body.email ?? "").toLowerCase().trim();
  const name = String(body.name ?? "").trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }
  if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return NextResponse.json({ error: `User with email '${email}' already exists` }, { status: 409 });

  const tempPassword = randomBytes(12).toString("base64").replace(/[+/=]/g, "").slice(0, 16);
  const passwordHash = await bcrypt.hash(tempPassword, 10);

  const user = await prisma.user.create({
    data: {
      email,
      name,
      passwordHash,
      role: "ADMIN",
      tenantId: tenant.id,
      superAdmin: false,
      active: true,
    },
  });

  return NextResponse.json({
    user: { id: user.id, email: user.email, name: user.name },
    tempPassword,
  });
}
