/**
 * Documents API — admin upload + list.
 *
 * GET  /api/documents                 List all documents in this tenant
 * POST /api/documents                 Upload a new PDF (admin only).
 *                                     multipart/form-data: file, title, description?, required?
 *                                     Creates DocumentSignature(PENDING) for every active employee.
 */

import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/guards";

export async function GET() {
  const auth = await requireRole(["ADMIN", "MANAGER"]);
  if ("error" in auth) return auth.error;
  if (auth.isSuperAdmin || !auth.tenantId) {
    return NextResponse.json({ error: "No tenant context" }, { status: 400 });
  }

  const docs = await prisma.document.findMany({
    where: { tenantId: auth.tenantId, active: true },
    orderBy: { createdAt: "desc" },
    include: {
      uploadedBy: { select: { id: true, name: true } },
      _count: { select: { signatures: true } },
      signatures: {
        select: { status: true },
      },
    },
  });

  // Annotate with sign progress (signed / waived / total)
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

export async function POST(req: Request) {
  const auth = await requireRole(["ADMIN"]);
  if ("error" in auth) return auth.error;
  if (auth.isSuperAdmin || !auth.tenantId) {
    return NextResponse.json({ error: "No tenant context" }, { status: 400 });
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      {
        error:
          "Vercel Blob not configured. Set BLOB_READ_WRITE_TOKEN env var.",
      },
      { status: 500 },
    );
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const required = String(formData.get("required") ?? "true") === "true";

  if (!file) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }
  if (!title) {
    return NextResponse.json({ error: "Missing title" }, { status: 400 });
  }
  if (file.type !== "application/pdf") {
    return NextResponse.json({ error: "Only PDF files supported" }, { status: 400 });
  }
  // Cap upload size at 10MB for now
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "File too large (max 10MB)" }, { status: 413 });
  }

  // Upload to Vercel Blob with a tenant-scoped path
  const safeName = file.name.replace(/[^\w.-]/g, "_");
  const blobPath = `tenants/${auth.tenantId}/documents/${Date.now()}-${safeName}`;
  const blob = await put(blobPath, file, {
    access: "public",
    contentType: "application/pdf",
  });

  // Create the document record
  // Extract searchable text from the PDF for AI Q&A. Failures are non-fatal —
  // the doc still gets created, just without the searchable text. Admin can
  // re-index later via /api/ai/docs-reindex.
  let extractedText: string | null = null;
  try {
    const _pdfMod = (await import("pdf-parse/lib/pdf-parse.js")) as any;
  const pdfParse: (buf: Buffer) => Promise<{ text: string }> = _pdfMod.default ?? _pdfMod;
    const fileBuf = Buffer.from(await file.arrayBuffer());
    const parsed = await pdfParse(fileBuf);
    const text = (parsed.text || "").trim();
    if (text.length > 0) extractedText = text;
  } catch (e: any) {
    console.warn("PDF text extraction failed:", e?.message ?? e);
  }

  const doc = await prisma.document.create({
    data: {
      tenantId: auth.tenantId,
      extractedText,
      title,
      description,
      fileUrl: blob.url,
      fileName: file.name,
      fileSize: file.size,
      required,
      uploadedById: auth.userId,
    },
  });

  // Resolve recipient set based on assignMode.
  //   "all"     → every active non-admin employee in the tenant
  //   "custom"  → union of:
  //       - employeeIds (explicit)
  //       - employees assigned to any of locationIds (via EmployeeLocation)
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
          user: {
            tenantId: auth.tenantId,
            active: true,
            role: { not: "ADMIN" },
          },
        },
        select: { userId: true },
      });
      viaLocs = rows.map((r) => r.userId);
    }
    recipientIds = Array.from(new Set([...explicit, ...viaLocs]));
    // Verify all belong to this tenant + are non-admin + active
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
      where: {
        tenantId: auth.tenantId,
        active: true,
        role: { not: "ADMIN" },
      },
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

  return NextResponse.json({
    document: doc,
    employeesAssigned: recipientIds.length,
    assignMode,
  });
}
