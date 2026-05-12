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
  const doc = await prisma.document.create({
    data: {
      tenantId: auth.tenantId,
      title,
      description,
      fileUrl: blob.url,
      fileName: file.name,
      fileSize: file.size,
      required,
      uploadedById: auth.userId,
    },
  });

  // Create PENDING signatures for every active employee
  const activeEmps = await prisma.user.findMany({
    where: {
      tenantId: auth.tenantId,
      active: true,
      role: { not: "ADMIN" },
    },
    select: { id: true },
  });
  if (activeEmps.length > 0) {
    await prisma.documentSignature.createMany({
      data: activeEmps.map((e) => ({
        documentId: doc.id,
        employeeId: e.id,
        status: "PENDING" as const,
      })),
      skipDuplicates: true,
    });
  }

  return NextResponse.json({
    document: doc,
    employeesAssigned: activeEmps.length,
  });
}
