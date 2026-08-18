/**
 * AI Doc Q&A — answer employee questions grounded in their uploaded PDFs.
 *
 * POST /api/ai/docs-chat  { question: string }
 *
 * Retrieval: documents are chunked at ~800 chars (with overlap) and scored
 * by keyword overlap with the question. Only the top-scoring chunks (capped
 * at ~30K chars total) are sent to the model. This keeps each request well
 * under Groq's free-tier 12K tokens/min limit and dramatically improves
 * answer quality vs. dumping every doc in one prompt.
 *
 * Auth model:
 *   - Staff: docs they have SIGNED (read-effectively)
 *   - Admin/Manager: all active tenant docs
 *
 * Note: documents need extractedText. Uploaded docs run extraction on
 * upload; pre-AI docs need /api/ai/docs-reindex.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getServerAuth } from "@/lib/auth";
import { generateText, aiAvailable } from "@/lib/ai/gemini";

const bodySchema = z.object({
  question: z.string().min(3).max(500),
});

// Groq openai/gpt-oss-120b free tier: 12K tokens/min.
// We budget ~10K input tokens => ~40K chars; reserve room for system
// prompt, question, and response, so cap retrieved context at 30K chars.
const MAX_CONTEXT_CHARS = 30_000;
const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 120;
const MIN_CHUNKS = 3; // always include some context, even if no keyword overlap

// Very common English words we don't want to score on.
const STOPWORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "should",
  "could", "may", "might", "must", "can", "of", "in", "to", "for", "with",
  "on", "at", "by", "from", "up", "about", "into", "through", "during",
  "before", "after", "above", "below", "under", "over", "and", "or", "but",
  "if", "then", "else", "when", "where", "why", "how", "what", "which",
  "who", "whom", "this", "that", "these", "those", "i", "you", "he", "she",
  "it", "we", "they", "them", "my", "your", "our", "their", "its", "his",
  "her", "not", "no", "so", "than", "too", "very", "just", "any", "some",
  "all", "each", "every", "as", "also", "such", "there", "here", "out",
  "off", "down",
]);

function keywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
}

function chunkText(text: string): string[] {
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    chunks.push(text.slice(i, i + CHUNK_SIZE));
    i += CHUNK_SIZE - CHUNK_OVERLAP;
  }
  return chunks;
}

export async function POST(req: Request) {
  if (!aiAvailable()) {
    return NextResponse.json(
      {
        error:
          "AI not configured. Set GROQ_API_KEY env var (https://console.groq.com/keys).",
      },
      { status: 500 },
    );
  }

  const session = await getServerAuth();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id as string;
  const role = (session.user as any).role as string;
  const tenantId = (session.user as any).tenantId as string | null;
  if (!tenantId)
    return NextResponse.json({ error: "No tenant context" }, { status: 400 });

  const body = await req.json();
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  // Load relevant documents.
  const isManager = role === "ADMIN" || role === "MANAGER";
  const where: any = {
    tenantId,
    active: true,
    extractedText: { not: null },
  };
  if (!isManager) {
    where.signatures = { some: { employeeId: userId, status: "SIGNED" } };
  }

  const docs = await prisma.document.findMany({
    where,
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

  // Chunk + score every chunk by keyword overlap with the question.
  const qKeys = new Set(keywords(parsed.data.question));
  type ScoredChunk = {
    docId: string;
    title: string;
    text: string;
    score: number;
    chunkIndex: number;
  };
  const allChunks: ScoredChunk[] = [];
  for (const d of docs) {
    if (!d.extractedText) continue;
    const chunks = chunkText(d.extractedText);
    chunks.forEach((c, idx) => {
      const cKeys = keywords(c);
      let score = 0;
      for (const k of cKeys) if (qKeys.has(k)) score++;
      allChunks.push({
        docId: d.id,
        title: d.title,
        text: c,
        score,
        chunkIndex: idx,
      });
    });
  }

  // Sort by score desc; tie-break by earlier chunk (often more important).
  allChunks.sort((a, b) =>
    b.score !== a.score ? b.score - a.score : a.chunkIndex - b.chunkIndex,
  );

  // Pick top chunks under the char budget. Always include MIN_CHUNKS even
  // when there's no keyword overlap (fallback so the model sees something).
  let used = 0;
  const selected: ScoredChunk[] = [];
  const sourceMap = new Map<string, string>(); // docId -> title
  for (const c of allChunks) {
    if (used + c.text.length > MAX_CONTEXT_CHARS) break;
    if (c.score === 0 && selected.length >= MIN_CHUNKS) break;
    selected.push(c);
    sourceMap.set(c.docId, c.title);
    used += c.text.length;
  }

  // Group selected chunks by doc title for cleaner prompt formatting.
  const byDoc = new Map<string, string[]>();
  for (const c of selected) {
    if (!byDoc.has(c.title)) byDoc.set(c.title, []);
    byDoc.get(c.title)!.push(c.text);
  }
  const contextBlocks: string[] = [];
  for (const [title, texts] of byDoc.entries()) {
    contextBlocks.push(
      `--- DOCUMENT: ${title} ---\n${texts.join("\n\n[...]\n\n")}\n--- END DOCUMENT ---`,
    );
  }

  const sources = Array.from(sourceMap.entries()).map(([documentId, title]) => ({
    documentId,
    title,
  }));

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
