import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/guards";
import { sendEmail, baseEmailTemplate } from "@/lib/email";
import { format } from "date-fns";

const schema = z.object({
  from: z.string(),
  to: z.string(),
  locationId: z.string().optional().nullable(),
});

export async function POST(req: Request) {
  const auth = await requireRole(["ADMIN", "MANAGER"]);
  if ("error" in auth) return auth.error;

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const { from, to, locationId } = parsed.data;

  const where: any = {
    startTime: { gte: new Date(from), lte: new Date(to) },
    published: false,
  };
  if (locationId) where.locationId = locationId;

  const unpublished = await prisma.shift.findMany({
    where,
    include: {
      employee: { select: { id: true, name: true, email: true } },
      location: { select: { name: true } },
    },
  });

  if (unpublished.length === 0) {
    return NextResponse.json({
      published: 0,
      message: "No draft shifts to publish in this range.",
    });
  }

  const now = new Date();
  await prisma.shift.updateMany({
    where: { id: { in: unpublished.map((s) => s.id) } },
    data: { published: true, publishedAt: now },
  });

  // Group by employee for emails
  const byEmployee = new Map<string, typeof unpublished>();
  for (const s of unpublished) {
    const list = byEmployee.get(s.employee.id) ?? [];
    list.push(s);
    byEmployee.set(s.employee.id, list);
  }

  const emailUrl = `${process.env.NEXTAUTH_URL}/my-shifts`;
  let emailsSent = 0;
  for (const [, shifts] of byEmployee) {
    const emp = shifts[0].employee;
    const rows = shifts
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
      .map(
        (s) =>
          `<tr><td style="padding:6px 10px;border-bottom:1px solid #ddd6c7;">${format(
            s.startTime,
            "EEE, MMM d"
          )}</td><td style="padding:6px 10px;border-bottom:1px solid #ddd6c7;">${format(
            s.startTime,
            "h:mma"
          )} – ${format(s.endTime, "h:mma")}</td><td style="padding:6px 10px;border-bottom:1px solid #ddd6c7;">${
            s.location?.name ?? "—"
          }</td></tr>`
      )
      .join("");

    const body = `<p style="margin:0 0 12px;color:#1a1816;">Hi ${emp.name}, your schedule has been published:</p>
<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:14px;margin:12px 0;">
  <thead><tr><th align="left" style="padding:6px 10px;border-bottom:2px solid #1a1816;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;">Date</th><th align="left" style="padding:6px 10px;border-bottom:2px solid #1a1816;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;">Time</th><th align="left" style="padding:6px 10px;border-bottom:2px solid #1a1816;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;">Location</th></tr></thead>
  <tbody>${rows}</tbody>
</table>`;

    await sendEmail({
      to: emp.email,
      subject: `Your schedule for ${format(new Date(from), "MMM d")}`,
      html: baseEmailTemplate("Your schedule is published", body, emailUrl, "View all shifts"),
    });
    emailsSent++;
  }

  return NextResponse.json({
    published: unpublished.length,
    emailsSent,
  });
}
