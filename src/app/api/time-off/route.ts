/**
 * v12.1: TENANT-SCOPED time-off API.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { scopedPrisma } from "@/lib/scoped-prisma";
import { requireAuth, isStaff, getScopedEmployeeIds } from "@/lib/guards";
import { sendEmail, baseEmailTemplate } from "@/lib/email";
import { format } from "date-fns";

// Parse a date-only string ("YYYY-MM-DD") as noon UTC of that calendar day,
// so every viewer sees the same calendar date regardless of timezone.
// If the input is already a full ISO string, falls back to direct parsing.
function parseDateOnly(s: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return new Date(`${s}T12:00:00.000Z`);
  }
  return new Date(s);
}

const createSchema = z.object({
  startDate: z.string(),
  endDate: z.string(),
  reason: z.string().optional(),
  // Admin/manager only: create on behalf of another employee.
  // Ignored for staff.
  userId: z.string().optional(),
});

function ensureTenant(auth: any) {
  if (auth.isSuperAdmin || !auth.tenantId) {
    return NextResponse.json({ error: "No tenant context" }, { status: 400 });
  }
  return null;
}

export async function GET(req: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const t = ensureTenant(auth); if (t) return t;
  const prisma = scopedPrisma(auth.tenantId!);

  const { searchParams } = new URL(req.url);
  const statusFilter = searchParams.get("status");
  const scope = searchParams.get("scope");
  const locationId = searchParams.get("locationId");

  const where: any = {};
  if (statusFilter) where.status = statusFilter;
  if (scope === "mine" || isStaff(auth.role)) {
    where.userId = auth.userId;
  } else if (auth.role === "MANAGER") {
    const scoped = await getScopedEmployeeIds(auth.userId, "MANAGER");
    where.userId = { in: scoped ?? [] };
  }
  if (locationId && (auth.role === "ADMIN" || auth.role === "MANAGER")) {
    where.user = { locations: { some: { locationId } } };
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
  const t = ensureTenant(auth); if (t) return t;
  const prisma = scopedPrisma(auth.tenantId!);

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const field = first.path.length > 0 ? first.path.join(".") : "input";
    return NextResponse.json(
      { error: `Invalid ${field}: ${first.message}`, issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { startDate, endDate, reason, userId: overrideUserId } = parsed.data;
  if (parseDateOnly(endDate) < parseDateOnly(startDate)) {
    return NextResponse.json({ error: "End date must be on or after start" }, { status: 400 });
  }

  // Admin/manager can submit on behalf of another employee, auto-approved.
  const isPrivileged = auth.role === "ADMIN" || auth.role === "MANAGER";
  const targetUserId = (isPrivileged && overrideUserId) ? overrideUserId : auth.userId;

  if (targetUserId !== auth.userId) {
    const target = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { tenantId: true },
    });
    if (!target || target.tenantId !== auth.tenantId) {
      return NextResponse.json(
        { error: "That employee is not in your tenant" },
        { status: 403 },
      );
    }
  }

  const request = await prisma.timeOffRequest.create({
    data: {
      tenantId: auth.tenantId!,
      userId: targetUserId,
      startDate: parseDateOnly(startDate),
      endDate: parseDateOnly(endDate),
      reason,
      ...(isPrivileged && overrideUserId ? {
        status: "APPROVED" as const,
        decidedBy: auth.userId,
        decidedAt: new Date(),
        decisionNote: "Auto-approved (created by admin)",
      } : {}),
    },
    include: { user: true },
  });

  // Notify approvers (only this tenant's admins/managers)
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
        `<p style="margin:0 0 8px;">${request.user.name} requested time off from <strong>${format(request.startDate, "MMM d, yyyy")}</strong> to <strong>${format(request.endDate, "MMM d, yyyy")}</strong>.</p>${reason ? `<p style="margin:0 0 8px;color:#4a4742;"><em>"${reason}"</em></p>` : ""}`,
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
  const t = ensureTenant(auth); if (t) return t;
  const prisma = scopedPrisma(auth.tenantId!);

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const hard = searchParams.get("hard") === "true";
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const existing = await prisma.timeOffRequest.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (hard) {
    if (auth.role === "ADMIN") {
      await prisma.timeOffRequest.delete({ where: { id } });
      return NextResponse.json({ ok: true });
    }
    if (auth.role === "MANAGER") {
      const scoped = await getScopedEmployeeIds(auth.userId, "MANAGER");
      if (!scoped || !scoped.includes(existing.userId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      await prisma.timeOffRequest.delete({ where: { id } });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (existing.userId !== auth.userId && isStaff(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (existing.status !== "PENDING") {
    return NextResponse.json({ error: "Cannot cancel a decided request" }, { status: 400 });
  }
  await prisma.timeOffRequest.update({ where: { id }, data: { status: "CANCELED" } });
  return NextResponse.json({ ok: true });
}

const patchSchema = z.object({
  id: z.string(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  reason: z.string().nullable().optional(),
});

export async function PATCH(req: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const t = ensureTenant(auth); if (t) return t;
  const prisma = scopedPrisma(auth.tenantId!);

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { id, startDate, endDate, reason } = parsed.data;

  const existing = await prisma.timeOffRequest.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (auth.role === "ADMIN") {
    // ok
  } else if (auth.role === "MANAGER") {
    const scoped = await getScopedEmployeeIds(auth.userId, "MANAGER");
    if (!scoped || !scoped.includes(existing.userId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else {
    if (existing.userId !== auth.userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (existing.status !== "PENDING") {
      return NextResponse.json({ error: "Cannot edit a decided request. Cancel and create a new one." }, { status: 400 });
    }
  }

  const data: any = {};
  if (startDate) data.startDate = parseDateOnly(startDate);
  if (endDate) data.endDate = parseDateOnly(endDate);
  if (reason !== undefined) data.reason = reason;

  if (data.startDate && data.endDate && data.endDate < data.startDate) {
    return NextResponse.json({ error: "End date must be on or after start date" }, { status: 400 });
  }

  const updated = await prisma.timeOffRequest.update({ where: { id }, data });
  return NextResponse.json({ request: updated });
}
