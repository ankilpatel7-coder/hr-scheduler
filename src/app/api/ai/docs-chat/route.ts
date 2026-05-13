/**
 * AI Doc Q&A — answer employee questions grounded in their uploaded PDFs.
 *
 * POST /api/ai/docs-chat  { question: string }
 *   - Loads all SIGNED + active documents for this employee (so they can
 *     only ask about things they've signed = effectively read).
 *     Admins/managers can search across all tenant docs.
 *   - Concatenates extracted text (cap ~200KB total) into the prompt.
 *   - Asks Gemini to answer using ONLY the provided context, with citations.
 *   - Returns { answer, sources: [{ documentId, title }] }.
 *
 * Setup note: documents need extractedText. Uploaded docs run extraction
 * automatically (see documents POST patch). Existing pre-AI docs are
 * blanks until re-indexed (see /api/ai/docs-reindex).
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getServerAuth } from "@/lib/auth";
import { generateText, aiAvailable } from "@/lib/ai/gemini";

const bodySchema = z.object({
  question: z.string().min(3).max(500),
});

const MAX_CONTEXT_CHARS = 200_000; // Gemini Flash has 1M token context; this is a safety margin

export async function POST(req: Request) {
  if (!aiAvailable()) {
    return NextResponse.json(
      { error: "AI not configured. Set GEMINI_API_KEY env var." },
      { status: 500 },
    );
  }

  const session = await getServerAuth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id as string;
  const role = (session.user as any).role as string;
  const tenantId = (session.user as any).tenantId as string | null;
  if (!tenantId) return NextResponse.json({ error: "No tenant context" }, { status: 400 });

  const body = await req.json();
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  // Load relevant documents.
  // - Staff: docs they have signed (so it's content they've already seen)
  // - Admin/Manager: all active tenant docs
  const isManager = role === "ADMIN" || role === "MANAGER";
  const docsQuery = isManager
    ? {
        where: { tenantId, active: true, extractedText: { not: null } },
      }
    : {
        where: {
          tenantId,
          active: true,
          extractedText: { not: null },
          signatures: { some: { employeeId: userId, status: "SIGNED" as const } },
        },
      };

  const docs = await prisma.document.findMany({
    ...docsQuery,
    select: { id: true, title: true, extractedText: true },
    orderBy: { createdAt: "desc" },
  });

  if (docs.length === 0) {
    return NextResponse.json({
      answer: isManager
        ? "There aren't any indexed documents yet. Upload PDFs (or re-index existing ones) so I can answer questions from them."
        : "You haven't signed any documents yet, or the documents you signed haven't been indexed. Ask your admin to re-index documents.",
      sources: [],
    });
  }

  // Build context, truncating if total length too big
  let used = 0;
  const sources: { documentId: string; title: string }[] = [];
  const contextBlocks: string[] = [];
  for (const d of docs) {
    if (!d.extractedText) continue;
    const block = `--- DOCUMENT: ${d.title} (id: ${d.id}) ---\n${d.extractedText}\n--- END DOCUMENT ---`;
    if (used + block.length > MAX_CONTEXT_CHARS) break;
    contextBlocks.push(block);
    sources.push({ documentId: d.id, title: d.title });
    used += block.length;
  }

  const prompt = `You are a helpful HR assistant for this company. Answer the employee's question using ONLY the documents provided below. If the answer is not in the documents, say "I couldn't find that in the documents available to you. Try asking your manager."

When you cite information, name the document title in your answer (e.g., "According to the Employee Handbook, ...").

Keep answers short (under 200 words), conversational, and in plain English. Format with bold and bullets if it helps. Don't make up policies.

QUESTION: ${parsed.data.question}

DOCUMENTS:

${contextBlocks.join("\n\n")}`;

  try {
    const answer = await generateText(prompt, { model: "flash" });
    return NextResponse.json({ answer, sources });
  } catch (e: any) {
    return NextResponse.json(
      { error: `AI request failed: ${e.message}` },
      { status: 500 },
    );
  }
}
