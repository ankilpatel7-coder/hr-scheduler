/**
 * POST /api/ai/docs-reindex  — admin only
 *
 * Extracts text from every Document.fileUrl in this tenant and stores it
 * in Document.extractedText. Skips docs already indexed unless ?force=true.
 *
 * Used to backfill existing docs uploaded before extraction was wired into
 * the upload route.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/guards";

export async function POST(req: Request) {
  const auth = await requireRole(["ADMIN"]);
  if ("error" in auth) return auth.error;
  if (auth.isSuperAdmin || !auth.tenantId) {
    return NextResponse.json({ error: "No tenant context" }, { status: 400 });
  }

  const force = new URL(req.url).searchParams.get("force") === "true";

  const docs = await prisma.document.findMany({
    where: {
      tenantId: auth.tenantId,
      active: true,
      ...(force ? {} : { extractedText: null }),
    },
    select: { id: true, title: true, fileUrl: true },
  });

  // Lazy-load pdf-parse so it doesn't slow cold starts on routes that don't use it
  const pdfParse = (await import("pdf-parse")).default;

  let indexed = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const d of docs) {
    try {
      const res = await fetch(d.fileUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      const parsed = await pdfParse(buf);
      const text = (parsed.text || "").trim();
      await prisma.document.update({
        where: { id: d.id },
        data: { extractedText: text || null },
      });
      indexed++;
    } catch (e: any) {
      failed++;
      errors.push(`${d.title}: ${e.message}`);
    }
  }

  return NextResponse.json({
    indexed,
    failed,
    total: docs.length,
    errors: errors.slice(0, 10),
  });
}
