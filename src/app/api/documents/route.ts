/**
 * Documents list — v2 with folder + search filters.
 *
 * GET /api/documents?folderId=<id|"null">&search=<text>&includeArchived=true
 *
 *   - folderId: filter by folder. "null" or omit = unfiled. "all" = no filter.
 *   - search: case-insensitive substring match on title.
 *   - includeArchived: include active=false docs (default false).
 *
 * Returns same shape as before + folderName for display.
 */

import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/guards";

export async function GET(req: Request) {
  const auth = await requireRole(["ADMIN", "MANAGER"]);
  if ("error" in auth) return auth.error;
  if (auth.isSuperAdmin || !auth.tenantId) {
    return NextResponse.json({ error: "No tenant context" }, { status: 400 });
  }

  const { searchParams } = new URL(req.url);
  const folderId = searchParams.get("folderId");
  const search = searchParams.get("search")?.trim();
  const includeArchived = searchParams.get("includeArchived") === "true";

  const where: any = { tenantId: auth.tenantId };
  if (!includeArchived) where.active = true;
  if (folderId === "null") where.folderId = null;
  else if (folderId && folderId !== "all") where.folderId = folderId;
  if (search) where.title = { contains: search, mode: "insensitive" };

  const docs = await prisma.document.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      uploadedBy: { select: { id: true, name: true } },
      folder: { select: { id: true, name: true, color: true } },
      signatures: { select: { status: true } },
      _count: { select: { signatures: true } },
    },
  });

  const annotated = docs.map((d) => {
    const total = d.signatures.length;
    const signed = d.signatures.filter((s) => s.status === "SIGNED").length;
    const waived = d.signatures.filter((s) => s.status === "WAIVED").length;
    const pending = total - signed - waived;
    const { signatures: _omit, ...rest } = d;
    return { ...rest, total, signed, waived, pending };
  });

  return NextResponse.json({ documents: annotated });
}

// POST handler unchanged — keeping the existing upload logic. The folderId
// is now optional in the upload form; we add it here.

export async function POST(req: Request) {
  const auth = await requireRole(["ADMIN", "MANAGER"]);
  if ("error" in auth) return auth.error;
  if (auth.isSuperAdmin || !auth.tenantId) {
    return NextResponse.json({ error: "No tenant context" }, { status: 400 });
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: "Vercel Blob not configured. Set BLOB_READ_WRITE_TOKEN env var." },
      { status: 500 },
    );
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const required = String(formData.get("required") ?? "true") === "true";
  // requireSignature defaults to true. When false, the doc is view-only:
  // no signature workflow, never blocks clock-in. Used for paystubs etc.
  const requireSignature = String(formData.get("requireSignature") ?? "true") === "true";
  const folderIdRaw = String(formData.get("folderId") ?? "").trim();
  const folderId = folderIdRaw && folderIdRaw !== "null" ? folderIdRaw : null;

  if (!file) return NextResponse.json({ error: "Missing file" }, { status: 400 });
  if (!title) return NextResponse.json({ error: "Missing title" }, { status: 400 });
  if (file.type !== "application/pdf") {
    return NextResponse.json({ error: "Only PDF files supported" }, { status: 400 });
  }
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "File too large (max 10MB)" }, { status: 413 });
  }

  // Validate folder belongs to tenant
  if (folderId) {
    const folder = await prisma.documentFolder.findFirst({
      where: { id: folderId, tenantId: auth.tenantId },
      select: { id: true },
    });
    if (!folder) return NextResponse.json({ error: "Folder not in your tenant" }, { status: 400 });
  }

  // Extract text for AI Q&A using unpdf (serverless-friendly).
  let extractedText: string | null = null;
  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const fileBuf = Buffer.from(await file.arrayBuffer());
    const pdf = await getDocumentProxy(new Uint8Array(fileBuf));
    const result = await extractText(pdf, { mergePages: true });
    const text = (result as any).text;
    const joined = (Array.isArray(text) ? text.join("\n") : (text ?? "")).trim();
    if (joined.length > 0) extractedText = joined;
  } catch (e: any) {
    console.warn("PDF text extraction failed:", e?.message ?? e);
  }

  const safeName = file.name.replace(/[^\w.-]/g, "_");
  const blobPath = `tenants/${auth.tenantId}/documents/${Date.now()}-${safeName}`;
  const blob = await put(blobPath, file, { access: "public", contentType: "application/pdf" });

  const doc = await prisma.document.create({
    data: {
      tenantId: auth.tenantId,
      title,
      description,
      fileUrl: blob.url,
      fileName: file.name,
      fileSize: file.size,
      extractedText,
      required,
      requireSignature,
      folderId,
      uploadedById: auth.userId,
    },
  });

  // Resolve recipients (same logic as before)
  const assignMode = String(formData.get("assignMode") ?? "all");
  const employeeIdsParam = String(formData.get("employeeIds") ?? "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  const locationIdsParam = String(formData.get("locationIds") ?? "")
    .split(",").map((s) => s.trim()).filter(Boolean);

  let recipientIds: string[] = [];
  if (assignMode === "custom") {
    const explicit = employeeIdsParam;
    let viaLocs: string[] = [];
    if (locationIdsParam.length > 0) {
      const rows = await prisma.employeeLocation.findMany({
        where: {
          locationId: { in: locationIdsParam },
          user: { tenantId: auth.tenantId, active: true, role: { not: "ADMIN" } },
        },
        select: { userId: true },
      });
      viaLocs = rows.map((r) => r.userId);
    }
    recipientIds = Array.from(new Set([...explicit, ...viaLocs]));
    if (recipientIds.length > 0) {
      const allowed = await prisma.user.findMany({
        where: {
          id: { in: recipientIds },
          tenantId: auth.tenantId,
          active: true,
          role: { not: "ADMIN" },
        },
        select: { id: true },
      });
      recipientIds = allowed.map((u) => u.id);
    }
  } else {
    const emps = await prisma.user.findMany({
      where: { tenantId: auth.tenantId, active: true, role: { not: "ADMIN" } },
      select: { id: true },
    });
    recipientIds = emps.map((e) => e.id);
  }

  if (recipientIds.length > 0) {
    await prisma.documentSignature.createMany({
      data: recipientIds.map((id) => ({
        documentId: doc.id,
        employeeId: id,
        status: "PENDING" as const,
      })),
      skipDuplicates: true,
    });
  }

  return NextResponse.json({ document: doc, employeesAssigned: recipientIds.length, assignMode });
}
