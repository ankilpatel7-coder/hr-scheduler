/**
 * Calendar events API — GET (list) + POST (create with optional PDF).
 *
 * POST accepts either JSON or multipart/form-data. When multipart, a "file"
 * field can carry a PDF that gets uploaded to Vercel Blob.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/guards";

const eventTypeEnum = z.enum(["HOLIDAY", "MEETING", "CLOSED", "EVENT", "OTHER"]);

const postSchema = z.object({
  title: z.string().min(1).max(100).trim(),
  description: z.string().optional().nullable(),
  type: eventTypeEnum,
  startDate: z.string(),
  endDate: z.string(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().nullable(),
});

export async function GET(req: Request) {
  const auth = await requireRole(["ADMIN", "MANAGER", "LEAD", "EMPLOYEE"]);
  if ("error" in auth) return auth.error;
  if (auth.isSuperAdmin || !auth.tenantId) {
    return NextResponse.json({ error: "No tenant context" }, { status: 400 });
  }

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const where: any = { tenantId: auth.tenantId };
  if (from || to) {
    if (to) where.startDate = { lte: new Date(to) };
    if (from) where.endDate = { gte: new Date(from) };
  }

  const events = await prisma.calendarEvent.findMany({
    where,
    orderBy: { startDate: "asc" },
    include: { createdBy: { select: { id: true, name: true } } },
  });

  return NextResponse.json({ events });
}

export async function POST(req: Request) {
  const auth = await requireRole(["ADMIN", "MANAGER"]);
  if ("error" in auth) return auth.error;
  if (auth.isSuperAdmin || !auth.tenantId) {
    return NextResponse.json({ error: "No tenant context" }, { status: 400 });
  }

  const contentType = req.headers.get("content-type") || "";
  let payload: {
    title: string;
    description: string | null;
    type: "HOLIDAY" | "MEETING" | "CLOSED" | "EVENT" | "OTHER";
    startDate: string;
    endDate: string;
    color: string | null;
  };
  let file: File | null = null;

  if (contentType.includes("multipart/form-data")) {
    const fd = await req.formData();
    const parsed = postSchema.safeParse({
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
    payload = parsed.data as any;
    const maybeFile = fd.get("file");
    if (maybeFile instanceof File && maybeFile.size > 0) {
      file = maybeFile;
    }
  } else {
    const body = await req.json();
    const parsed = postSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", issues: parsed.error.issues },
        { status: 400 },
      );
    }
    payload = parsed.data as any;
  }

  const startDate = new Date(payload.startDate);
  const endDate = new Date(payload.endDate);
  if (endDate < startDate) {
    return NextResponse.json(
      { error: "End date must be on or after start date" },
      { status: 400 },
    );
  }

  // Upload PDF to Blob if provided
  let attachmentUrl: string | null = null;
  let attachmentName: string | null = null;
  let attachmentSize: number | null = null;
  if (file) {
    if (!file.type.includes("pdf") && !file.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json(
        { error: "Attachment must be a PDF" },
        { status: 400 },
      );
    }
    if (file.size > 15 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Attachment must be under 15 MB" },
        { status: 400 },
      );
    }
    const safeName = file.name.replace(/[^\w.\-]/g, "_");
    const key = `calendar/${auth.tenantId}/${Date.now()}-${safeName}`;
    const blob = await put(key, file, {
      access: "public",
      contentType: file.type || "application/pdf",
    });
    attachmentUrl = blob.url;
    attachmentName = file.name;
    attachmentSize = file.size;
  }

  const event = await prisma.calendarEvent.create({
    data: {
      tenantId: auth.tenantId,
      title: payload.title,
      description: payload.description ?? null,
      type: payload.type,
      startDate,
      endDate,
      color: payload.color ?? null,
      attachmentUrl,
      attachmentName,
      attachmentSize,
      createdById: auth.userId,
    },
    include: { createdBy: { select: { id: true, name: true } } },
  });

  return NextResponse.json({ event });
}
