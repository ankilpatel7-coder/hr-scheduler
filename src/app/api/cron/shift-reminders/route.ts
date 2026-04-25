import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendEmail, baseEmailTemplate } from "@/lib/email";
import { format } from "date-fns";

export async function GET(req: Request) {
  // Protect the endpoint - Vercel Cron sends a header with CRON_SECRET
  const authHeader = req.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const windowStart = new Date(now.getTime() + 55 * 60 * 1000); // 55 min out
  const windowEnd = new Date(now.getTime() + 65 * 60 * 1000); // 65 min out

  const shifts = await prisma.shift.findMany({
    where: {
      startTime: { gte: windowStart, lte: windowEnd },
      published: true,
      reminderSent: false,
    },
    include: {
      employee: { select: { id: true, email: true, name: true } },
      location: { select: { name: true } },
    },
  });

  let sent = 0;
  for (const s of shifts) {
    await sendEmail({
      to: s.employee.email,
      subject: `Shift reminder: ${format(s.startTime, "h:mma")} at ${s.location?.name ?? "work"}`,
      html: baseEmailTemplate(
        "Your shift starts in 1 hour",
        `<p style="margin:0 0 8px;">Hi ${s.employee.name}, a friendly reminder:</p>
<p style="margin:8px 0;"><strong>${format(s.startTime, "h:mm a")} – ${format(
          s.endTime,
          "h:mm a"
        )}</strong><br>${s.location?.name ?? ""}${s.role ? ` · ${s.role}` : ""}</p>`,
        `${process.env.NEXTAUTH_URL}/clock`,
        "Open Shiftwork"
      ),
    });
    await prisma.shift.update({
      where: { id: s.id },
      data: { reminderSent: true },
    });
    sent++;
  }

  return NextResponse.json({ sent, total: shifts.length });
}
