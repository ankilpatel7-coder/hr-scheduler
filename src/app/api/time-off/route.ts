import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/guards";
import { sendEmail, baseEmailTemplate } from "@/lib/email";
import { format } from "date-fns";

const createSchema = z.object({
  startDate: z.string(),
  endDate: z.string(),
  reason: z.string().optional(),
});

export async function GET(req: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { searchParams } = new URL(req.url);
  const statusFilter = searchParams.get("status");
  const scope = searchParams.get("scope"); // "mine" | "all"

  const where: any = {};
  if (statusFilter) where.status = statusFilter;
  if (scope === "mine" || auth.role === "EMPLOYEE") {
    where.userId = auth.userId;
  }

  const requests = await prisma.timeOffRequest.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { id: true, name: true, email: true, department: true } },
      decider: { select: { id: true, name: true } },
    },
  });
  return NextResponse.json({ requests });
}

export async function POST(req: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const { startDate, endDate, reason } = parsed.data;
  if (new Date(endDate) < new Date(startDate)) {
    return NextResponse.json({ error: "End date must be on or after start" }, { status: 400 });
  }

  const request = await prisma.timeOffRequest.create({
    data: {
      userId: auth.userId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      reason,
    },
    include: { user: true },
  });

  // Notify admins/managers
  const approvers = await prisma.user.findMany({
    where: { role: { in: ["ADMIN", "MANAGER"] }, active: true },
    select: { email: true },
  });
  if (approvers.length > 0) {
    await sendEmail({
      to: approvers.map((a) => a.email),
      subject: `Time-off request from ${request.user.name}`,
      html: baseEmailTemplate(
        "New time-off request",
        `<p style="margin:0 0 8px;">${request.user.name} requested time off from <strong>${format(
          request.startDate,
          "MMM d, yyyy"
        )}</strong> to <strong>${format(request.endDate, "MMM d, yyyy")}</strong>.</p>${
          reason ? `<p style="margin:0 0 8px;color:#4a4742;"><em>"${reason}"</em></p>` : ""
        }`,
        `${process.env.NEXTAUTH_URL}/time-off`,
        "Review request"
      ),
    });
  }

  return NextResponse.json({ request });
}

export async function DELETE(req: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const existing = await prisma.timeOffRequest.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.userId !== auth.userId && auth.role === "EMPLOYEE") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (existing.status !== "PENDING") {
    return NextResponse.json({ error: "Cannot cancel a decided request" }, { status: 400 });
  }
  await prisma.timeOffRequest.update({
    where: { id },
    data: { status: "CANCELED" },
  });
  return NextResponse.json({ ok: true });
}
