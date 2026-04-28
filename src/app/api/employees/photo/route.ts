import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/guards";

const schema = z.object({
  userId: z.string(),
  // base64 data URL, e.g. "data:image/jpeg;base64,..."
  photoUrl: z.string().nullable(),
});

const MAX_BYTES = 600_000; // ~440KB after base64 overhead

export async function POST(req: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const { userId, photoUrl } = parsed.data;
  const isSelf = userId === auth.userId;
  const isAdmin = auth.role === "ADMIN";

  if (!isSelf && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (photoUrl) {
    if (!photoUrl.startsWith("data:image/")) {
      return NextResponse.json(
        { error: "Photo must be a data URL (base64-encoded image)" },
        { status: 400 }
      );
    }
    if (photoUrl.length > MAX_BYTES) {
      return NextResponse.json(
        {
          error:
            "Photo is too large. Please choose a smaller image (under ~400KB), or the upload form will resize it.",
        },
        { status: 413 }
      );
    }
  }

  await prisma.user.update({
    where: { id: userId },
    data: { photoUrl },
  });

  return NextResponse.json({ ok: true });
}
