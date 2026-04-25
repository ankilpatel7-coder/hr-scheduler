import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/guards";
import { sendEmail, baseEmailTemplate } from "@/lib/email";
import { format } from "date-fns";

const schema = z.object({
  id: z.string(),
  decision: z.enum(["APPROVED", "DENIED"]),
});

export async function POST(req: Request) {
  const auth = await requireRole(["ADMIN", "MANAGER"]);
  if ("error" in auth) return auth.error;

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const { id, decision } = parsed.data;

  const swap = await prisma.shiftSwap.findUnique({
    where: { id },
    include: {
      shift: { include: { location: true } },
      offeredBy: true,
      claimedBy: true,
    },
  });
  if (!swap) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (swap.status !== "CLAIMED") {
    return NextResponse.json({ error: "Not in claimed state" }, { status: 400 });
  }
  if (!swap.claimedById || !swap.claimedBy) {
    return NextResponse.json({ error: "No claimant" }, { status: 400 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.shiftSwap.update({
      where: { id },
      data: {
        status: decision,
        decidedById: auth.userId,
        decidedAt: new Date(),
      },
    });
    if (decision === "APPROVED") {
      await tx.shift.update({
        where: { id: swap.shiftId },
        data: { employeeId: swap.claimedById! },
      });
    }
  });

  // Notify both parties
  const recipients = [swap.offeredBy.email, swap.claimedBy.email];
  await sendEmail({
    to: recipients,
    subject: `Shift swap ${decision.toLowerCase()}`,
    html: baseEmailTemplate(
      decision === "APPROVED" ? "Swap approved" : "Swap denied",
      `<p style="margin:0 0 8px;">The shift on ${format(
        swap.shift.startTime,
        "EEE, MMM d"
      )} (${format(swap.shift.startTime, "h:mma")} – ${format(
        swap.shift.endTime,
        "h:mma"
      )}) was <strong>${decision.toLowerCase()}</strong>.</p>${
        decision === "APPROVED"
          ? `<p style="margin:0 0 8px;"><strong>${swap.claimedBy.name}</strong> is now covering this shift.</p>`
          : ""
      }`,
      `${process.env.NEXTAUTH_URL}/swaps`,
      "View swaps"
    ),
  });

  return NextResponse.json({ ok: true });
}
