import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendEmail, baseEmailTemplate } from "@/lib/email";
import { startOfWeek, endOfWeek, format } from "date-fns";

function hours(a: Date, b: Date | null) {
  if (!b) return 0;
  return (b.getTime() - a.getTime()) / 3_600_000;
}

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });

  // Clocked hours this week per employee
  const entries = await prisma.clockEntry.findMany({
    where: { clockIn: { gte: weekStart, lte: weekEnd } },
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  const byUser = new Map<string, { user: any; hours: number }>();
  for (const e of entries) {
    const h = hours(e.clockIn, e.clockOut);
    const cur = byUser.get(e.user.id) ?? { user: e.user, hours: 0 };
    cur.hours += h;
    byUser.set(e.user.id, cur);
  }

  // Also sum scheduled remaining shifts this week to project total
  const scheduled = await prisma.shift.findMany({
    where: {
      startTime: { gte: now, lte: weekEnd },
      published: true,
    },
    include: { employee: { select: { id: true, name: true, email: true } } },
  });

  for (const s of scheduled) {
    const planned = hours(s.startTime, s.endTime);
    const cur = byUser.get(s.employee.id) ?? { user: s.employee, hours: 0 };
    cur.hours += planned;
    byUser.set(s.employee.id, cur);
  }

  const atRisk = Array.from(byUser.values())
    .filter((v) => v.hours >= 36)
    .sort((a, b) => b.hours - a.hours);

  if (atRisk.length === 0) {
    return NextResponse.json({ sent: 0, atRisk: 0 });
  }

  const managers = await prisma.user.findMany({
    where: { role: { in: ["ADMIN", "MANAGER"] }, active: true },
    select: { email: true },
  });

  if (managers.length === 0) {
    return NextResponse.json({ sent: 0, atRisk: atRisk.length });
  }

  const rows = atRisk
    .map(
      (a) =>
        `<tr><td style="padding:6px 10px;border-bottom:1px solid #ddd6c7;">${
          a.user.name
        }</td><td style="padding:6px 10px;border-bottom:1px solid #ddd6c7;text-align:right;font-family:monospace;">${a.hours.toFixed(
          1
        )}h</td><td style="padding:6px 10px;border-bottom:1px solid #ddd6c7;">${
          a.hours >= 40 ? "<strong style='color:#b4553a;'>OVERTIME</strong>" : "Approaching OT"
        }</td></tr>`
    )
    .join("");

  await sendEmail({
    to: managers.map((m) => m.email),
    subject: `Overtime alert: ${atRisk.length} employee(s) at or near 40 hrs`,
    html: baseEmailTemplate(
      `Overtime watch — week of ${format(weekStart, "MMM d")}`,
      `<p style="margin:0 0 12px;">These employees are at or projected to pass 40 hours this week (actual + scheduled):</p>
<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:14px;margin:12px 0;">
  <thead><tr><th align="left" style="padding:6px 10px;border-bottom:2px solid #1a1816;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;">Employee</th><th align="right" style="padding:6px 10px;border-bottom:2px solid #1a1816;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;">Hours</th><th align="left" style="padding:6px 10px;border-bottom:2px solid #1a1816;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;">Status</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
<p style="margin:12px 0;color:#4a4742;font-size:13px;">Kentucky (FLSA) requires 1.5× pay for hours worked over 40 in a workweek.</p>`,
      `${process.env.NEXTAUTH_URL}/timesheets`,
      "Review timesheets"
    ),
  });

  return NextResponse.json({ sent: managers.length, atRisk: atRisk.length });
}
