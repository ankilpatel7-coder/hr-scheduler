/**
 * Replace a document with a new version.
 *
 * POST /api/documents/[id]/replace  (multipart: file)
 *   Uploads a new PDF, creates a new Document row with version=oldVersion+1,
 *   inherits folder/title/required, copies pending signatures forward.
 *   Marks the old document as replaced (active=false, replacedById=newId).
 *
 *   Signed signatures on the old version stay tied to that old version
 *   (audit trail). Pending signatures migrate to the new version.
 */

import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/guards";

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const auth = await requireRole(["ADMIN"]);
  if ("error" in auth) return auth.error;
  if (auth.isSuperAdmin || !auth.tenantId) {
    return NextResponse.json({ error: "No tenant context" }, { status: 400 });
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: "Blob storage not configured" },
      { status: 500 },
    );
  }

  const old = await prisma.document.findFirst({
    where: { id: params.id, tenantId: auth.tenantId, active: true },
    include: {
      signatures: { where: { status: "PENDING" }, select: { employeeId: true } },
    },
  });
  if (!old) {
    return NextResponse.json(
      { error: "Not found or already replaced" },
      { status: 404 },
    );
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "Missing file" }, { status: 400 });
  if (file.type !== "application/pdf") {
    return NextResponse.json({ error: "Only PDF supported" }, { status: 400 });
  }
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json(
      { error: "File too large (10MB max)" },
      { status: 413 },
    );
  }

  // Extract text for AI Q&A using unpdf (serverless-friendly).
  let extractedText: string | null = null;
  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const buf = Buffer.from(await file.arrayBuffer());
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const result = await extractText(pdf, { mergePages: true });
    const text = (result as any).text;
    const joined = (Array.isArray(text) ? text.join("\n") : (text ?? "")).trim();
    if (joined.length > 0) extractedText = joined;
  } catch (e: any) {
    console.warn("PDF text extraction failed on replace:", e?.message ?? e);
  }

  // Upload new file to Vercel Blob.
  const safeName = file.name.replace(/[^\w.-]/g, "_");
  const blobPath = `tenants/${auth.tenantId}/documents/${Date.now()}-v${old.version + 1}-${safeName}`;
  const blob = await put(blobPath, file, {
    access: "public",
    contentType: "application/pdf",
  });

  // Atomic: create new doc, point old at it, migrate pending signatures.
  const newDoc = await prisma.$transaction(async (tx) => {
    const created = await tx.document.create({
      data: {
        tenantId: old.tenantId,
        title: old.title,
        description: old.description,
        fileUrl: blob.url,
        fileName: file.name,
        fileSize: file.size,
        extractedText,
        required: old.required,
        active: true,
        folderId: old.folderId,
        version: old.version + 1,
        uploadedById: auth.userId,
      },
    });

    if (old.signatures.length > 0) {
      await tx.documentSignature.createMany({
        data: old.signatures.map((s) => ({
          documentId: created.id,
          employeeId: s.employeeId,
          status: "PENDING" as const,
        })),
        skipDuplicates: true,
      });
      await tx.documentSignature.deleteMany({
        where: { documentId: old.id, status: "PENDING" },
      });
    }

    await tx.document.update({
      where: { id: old.id },
      data: { active: false, replacedById: created.id },
    });

    return created;
  });

  return NextResponse.json({
    document: newDoc,
    pendingMigrated: old.signatures.length,
  });
}
