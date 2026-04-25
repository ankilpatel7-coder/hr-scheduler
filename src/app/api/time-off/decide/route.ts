import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/guards";
import { sendEmail, baseEmailTemplate } from "@/lib/email";
import { format } from "date-fns";

const schema = z.object({
  id: z.string(),
  decision: z.enum(["APPROVED", "DENIED"]),
  note: z.string().optional(),
});

export async function POST(req: Request) {
  const auth = await requireRole(["ADMIN", "MANAGER"]);
  if ("error" in auth) return auth.error;

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const { id, decision, note } = parsed.data;

  const existing = await prisma.timeOffRequest.findUnique({
    where: { id },
    include: { user: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.status !== "PENDING") {
    return NextResponse.json({ error: "Already decided" }, { status: 400 });
  }

  const updated = await prisma.timeOffRequest.update({
    where: { id },
    data: {
      status: decision,
      decidedBy: auth.userId,
      decidedAt: new Date(),
      decisionNote: note,
    },
  });

  await sendEmail({
    to: existing.user.email,
    subject: `Your time-off request was ${decision.toLowerCase()}`,
    html: baseEmailTemplate(
      `Request ${decision === "APPROVED" ? "approved" : "denied"}`,
      `<p style="margin:0 0 8px;">Your time-off request for <strong>${format(
        existing.startDate,
        "MMM d"
      )} – ${format(existing.endDate, "MMM d, yyyy")}</strong> has been <strong>${decision.toLowerCase()}</strong>.</p>${
        note ? `<p style="margin:8px 0;color:#4a4742;"><em>Note: ${note}</em></p>` : ""
      }`,
      `${process.env.NEXTAUTH_URL}/time-off`,
      "View your requests"
    ),
  });

  return NextResponse.json({ request: updated });
}
