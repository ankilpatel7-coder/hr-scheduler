/**
 * Single calendar event API.
 *
 * GET    /api/calendar-events/[id]  — any authenticated tenant user
 * PATCH  /api/calendar-events/[id]  — admin/manager: edit fields, optionally
 *                                     replace or remove the PDF attachment
 * DELETE /api/calendar-events/[id]  — admin/manager only
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { put, del } from "@vercel/blob";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/guards";

const eventTypeEnum = z.enum(["HOLIDAY", "MEETING", "CLOSED", "EVENT", "OTHER"]);

const patchSchema = z.object({
  title: z.string().min(1).max(100).trim(),
  description: z.string().optional().nullable(),
  type: eventTypeEnum,
  startDate: z.string(),
  endDate: z.string(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().nullable(),
});

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const auth = await requireRole(["ADMIN", "MANAGER", "LEAD", "EMPLOYEE"]);
  if ("error" in auth) return auth.error;
  if (auth.isSuperAdmin || !auth.tenantId) {
    return NextResponse.json({ error: "No tenant context" }, { status: 400 });
  }

  const event = await prisma.calendarEvent.findFirst({
    where: { id: params.id, tenantId: auth.tenantId },
    include: { createdBy: { select: { id: true, name: true } } },
  });
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ event });
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  const auth = await requireRole(["ADMIN", "MANAGER"]);
  if ("error" in auth) return auth.error;
  if (auth.isSuperAdmin || !auth.tenantId) {
    return NextResponse.json({ error: "No tenant context" }, { status: 400 });
  }

  const existing = await prisma.calendarEvent.findFirst({
    where: { id: params.id, tenantId: auth.tenantId },
    select: { id: true, attachmentUrl: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const contentType = req.headers.get("content-type") || "";
  let payload: z.infer<typeof patchSchema>;
  let file: File | null = null;
  let removeAttachment = false;

  if (contentType.includes("multipart/form-data")) {
    const fd = await req.formData();
    const parsed = patchSchema.safeParse({
      title: String(fd.get("title") || "").trim(),
      description: fd.get("description") ? String(fd.get("description")) : null,
      type: String(fd.get("type") || "OTHER"),
      startDate: String(fd.get("startDate") || ""),
      endDate: String(fd.get("endDate") || ""),
      color: fd.get("color") ? String(fd.get("color")) : null,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", issues: parsed.error.issues },
        { status: 400 },
      );
    }
    payload = parsed.data;
    removeAttachment = String(fd.get("removeAttachment") || "") === "true";
    const maybeFile = fd.get("file");
    if (maybeFile instanceof File && maybeFile.size > 0) {
      file = maybeFile;
    }
  } else {
    const body = await req.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", issues: parsed.error.issues },
        { status: 400 },
      );
    }
    payload = parsed.data;
    removeAttachment = body?.removeAttachment === true;
  }

  const startDate = new Date(payload.startDate);
  const endDate = new Date(payload.endDate);
  if (endDate < startDate) {
    return NextResponse.json(
      { error: "End date must be on or after start date" },
      { status: 400 },
    );
  }

  const data: any = {
    title: payload.title,
    description: payload.description ?? null,
    type: payload.type,
    startDate,
    endDate,
    color: payload.color ?? null,
  };

  // Attachment handling: a new file replaces the old one; removeAttachment
  // clears it. Otherwise the existing attachment is left alone.
  if (file) {
    if (!file.type.includes("pdf") && !file.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json({ error: "Attachment must be a PDF" }, { status: 400 });
    }
    if (file.size > 15 * 1024 * 1024) {
      return NextResponse.json({ error: "Attachment must be under 15 MB" }, { status: 400 });
    }
    const safeName = file.name.replace(/[^\w.\-]/g, "_");
    const key = `calendar/${auth.tenantId}/${Date.now()}-${safeName}`;
    const blob = await put(key, file, {
      access: "public",
      contentType: file.type || "application/pdf",
    });
    data.attachmentUrl = blob.url;
    data.attachmentName = file.name;
    data.attachmentSize = file.size;
    if (existing.attachmentUrl) {
      try {
        await del(existing.attachmentUrl);
      } catch {
        // Non-fatal — old blob may already be gone
      }
    }
  } else if (removeAttachment) {
    data.attachmentUrl = null;
    data.attachmentName = null;
    data.attachmentSize = null;
    if (existing.attachmentUrl) {
      try {
        await del(existing.attachmentUrl);
      } catch {
        // Non-fatal
      }
    }
  }

  const event = await prisma.calendarEvent.update({
    where: { id: existing.id },
    data,
    include: { createdBy: { select: { id: true, name: true } } },
  });

  return NextResponse.json({ event });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const auth = await requireRole(["ADMIN", "MANAGER"]);
  if ("error" in auth) return auth.error;
  if (auth.isSuperAdmin || !auth.tenantId) {
    return NextResponse.json({ error: "No tenant context" }, { status: 400 });
  }

  const event = await prisma.calendarEvent.findFirst({
    where: { id: params.id, tenantId: auth.tenantId },
    select: { id: true, attachmentUrl: true },
  });
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (event.attachmentUrl) {
    try {
      await del(event.attachmentUrl);
    } catch {
      // Non-fatal — the DB row deletion is the source of truth
    }
  }

  await prisma.calendarEvent.delete({ where: { id: event.id } });
  return NextResponse.json({ ok: true });
}
