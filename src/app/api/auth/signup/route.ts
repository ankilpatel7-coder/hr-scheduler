import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getServerAuth } from "@/lib/auth";

const schema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(6),
  role: z.enum(["ADMIN", "MANAGER", "EMPLOYEE"]).optional(),
  department: z.string().optional(),
  hourlyWage: z.number().nonnegative().optional(),
  isTipped: z.boolean().optional(),
  locationIds: z.array(z.string()).optional(),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const userCount = await prisma.user.count();
  const session = await getServerAuth();

  if (userCount > 0 && (session?.user as any)?.role !== "ADMIN") {
    return NextResponse.json(
      { error: "Only admins can create new accounts" },
      { status: 403 }
    );
  }

  const {
    email,
    name,
    password,
    role,
    department,
    hourlyWage,
    isTipped,
    locationIds,
  } = parsed.data;

  const existing = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });
  if (existing) {
    return NextResponse.json({ error: "Email already in use" }, { status: 409 });
  }

  const user = await prisma.user.create({
    data: {
      email: email.toLowerCase(),
      name,
      passwordHash: await bcrypt.hash(password, 10),
      role: userCount === 0 ? "ADMIN" : role ?? "EMPLOYEE",
      department,
      hourlyWage: hourlyWage ?? 0,
      isTipped: isTipped ?? false,
    },
    select: { id: true, email: true, name: true, role: true },
  });

  if (locationIds && locationIds.length > 0) {
    await prisma.employeeLocation.createMany({
      data: locationIds.map((locationId) => ({ userId: user.id, locationId })),
      skipDuplicates: true,
    });
  }

  return NextResponse.json({ user });
}
