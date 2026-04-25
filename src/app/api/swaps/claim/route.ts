import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/guards";
import { sendEmail, baseEmailTemplate } from "@/lib/email";
import { format } from "date-fns";

const schema = z.object({ id: z.string() });

export async function POST(req: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const { id } = parsed.data;

  const swap = await prisma.shiftSwap.findUnique({
    where: { id },
    include: {
      shift: { include: { employee: true, location: true } },
      offeredBy: true,
    },
  });
  if (!swap) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (swap.status !== "OFFERED") {
    return NextResponse.json({ error: "No longer available" }, { status: 400 });
  }
  if (swap.offeredById === auth.userId) {
    return NextResponse.json({ error: "Can't claim your own offer" }, { status: 400 });
  }

  const updated = await prisma.shiftSwap.update({
    where: { id },
    data: { status: "CLAIMED", claimedById: auth.userId },
  });

  // Notify managers
  const managers = await prisma.user.findMany({
    where: { role: { in: ["ADMIN", "MANAGER"] }, active: true },
    select: { email: true },
  });
  const claimant = await prisma.user.findUnique({ where: { id: auth.userId } });
  if (managers.length > 0 && claimant) {
    await sendEmail({
      to: managers.map((m) => m.email),
      subject: `Shift swap needs approval`,
      html: baseEmailTemplate(
        "Shift swap pending approval",
        `<p style="margin:0 0 8px;"><strong>${claimant.name}</strong> wants to pick up <strong>${swap.offeredBy.name}</strong>'s shift on ${format(
          swap.shift.startTime,
          "EEE, MMM d"
        )} (${format(swap.shift.startTime, "h:mma")} – ${format(
          swap.shift.endTime,
          "h:mma"
        )})${swap.shift.location ? ` at ${swap.shift.location.name}` : ""}.</p>`,
        `${process.env.NEXTAUTH_URL}/swaps`,
        "Review swap"
      ),
    });
  }

  return NextResponse.json({ swap: updated });
}
