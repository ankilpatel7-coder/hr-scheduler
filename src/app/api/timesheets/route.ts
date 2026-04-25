import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerAuth } from "@/lib/auth";
import { durationHours } from "@/lib/utils";
import { format } from "date-fns";

export async function GET(req: Request) {
  const session = await getServerAuth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  const userId = (session.user as any).id;

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const employeeId = searchParams.get("employeeId");
  const formatType = searchParams.get("format");

  const where: any = {};
  if (from || to) {
    where.clockIn = {};
    if (from) where.clockIn.gte = new Date(from);
    if (to) where.clockIn.lte = new Date(to);
  }
  if (role === "EMPLOYEE") {
    where.userId = userId;
  } else if (employeeId) {
    where.userId = employeeId;
  }

  const entries = await prisma.clockEntry.findMany({
    where,
    orderBy: { clockIn: "desc" },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          department: true,
          hourlyWage: true,
        },
      },
    },
  });

  if (formatType === "csv") {
    if (role !== "ADMIN" && role !== "MANAGER") {
      return new Response("Forbidden", { status: 403 });
    }
    const rows = [
      [
        "Employee",
        "Email",
        "Department",
        "Clock In",
        "Clock Out",
        "Hours",
        "Wage",
        "Pay",
        "Edited",
      ].join(","),
    ];
    let totalH = 0;
    let totalP = 0;
    const sorted = [...entries].sort(
      (a, b) => a.clockIn.getTime() - b.clockIn.getTime()
    );
    for (const e of sorted) {
      const h = e.clockOut ? durationHours(e.clockIn, e.clockOut) : 0;
      const pay = h * (e.user.hourlyWage ?? 0);
      totalH += h;
      totalP += pay;
      rows.push(
        [
          JSON.stringify(e.user.name),
          JSON.stringify(e.user.email),
          JSON.stringify(e.user.department ?? ""),
          format(e.clockIn, "yyyy-MM-dd HH:mm"),
          e.clockOut ? format(e.clockOut, "yyyy-MM-dd HH:mm") : "",
          h.toFixed(2),
          (e.user.hourlyWage ?? 0).toFixed(2),
          pay.toFixed(2),
          e.editedBy ? "Y" : "",
        ].join(",")
      );
    }
    rows.push(
      ["TOTAL", "", "", "", "", totalH.toFixed(2), "", totalP.toFixed(2), ""].join(",")
    );
    return new Response(rows.join("\n"), {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="timesheets-${format(
          new Date(),
          "yyyy-MM-dd"
        )}.csv"`,
      },
    });
  }

  // JSON: trim selfies from list payload to keep it small
  const trimmed = entries.map((e) => ({
    ...e,
    selfieIn: e.selfieIn ? "present" : null,
    selfieOut: e.selfieOut ? "present" : null,
  }));

  return NextResponse.json({ entries: trimmed });
}
