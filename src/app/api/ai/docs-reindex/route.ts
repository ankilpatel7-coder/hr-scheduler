/**
 * POST /api/ai/docs-reindex?force=true — admin only.
 *
 * Extracts text from every Document.fileUrl in this tenant and stores in
 * Document.extractedText. Uses unpdf (built for serverless). Always returns
 * JSON, even on internal failures.
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

  try {
    const force = new URL(req.url).searchParams.get("force") === "true";

    const docs = await prisma.document.findMany({
      where: {
        tenantId: auth.tenantId,
        active: true,
        ...(force ? {} : { extractedText: null }),
      },
      select: { id: true, title: true, fileUrl: true },
    });

    // Load unpdf — serverless-friendly PDF text extractor.
    let extractFromBuffer: (buf: Buffer) => Promise<string>;
    try {
      const { extractText, getDocumentProxy } = await import("unpdf");
      extractFromBuffer = async (buf: Buffer) => {
        const pdf = await getDocumentProxy(new Uint8Array(buf));
        const result = await extractText(pdf, { mergePages: true });
        const text = (result as any).text;
        return Array.isArray(text) ? text.join("\n") : (text ?? "");
      };
    } catch (e: any) {
      return NextResponse.json(
        { error: `Could not load unpdf library: ${e.message}` },
        { status: 500 },
      );
    }

    let indexed = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const d of docs) {
      try {
        const res = await fetch(d.fileUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        const text = (await extractFromBuffer(buf)).trim();
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
  } catch (e: any) {
    return NextResponse.json(
      { error: `Reindex crashed: ${e.message}` },
      { status: 500 },
    );
  }
}
