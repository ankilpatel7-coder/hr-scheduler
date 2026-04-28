import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerAuth } from "@/lib/auth";
import { getScopedEmployeeIds, isStaff } from "@/lib/guards";
import { durationHours } from "@/lib/utils";
import { format } from "date-fns";

export async function GET(req: Request) {
  const session = await getServerAuth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role as "ADMIN" | "MANAGER" | "LEAD" | "EMPLOYEE";
  const userId = (session.user as any).id as string;

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const employeeId = searchParams.get("employeeId");
  const formatType = searchParams.get("format");
  const locationId = searchParams.get("locationId");

  const where: any = {};
  if (from || to) {
    where.clockIn = {};
    if (from) where.clockIn.gte = new Date(from);
    if (to) where.clockIn.lte = new Date(to);
  }

  if (isStaff(role)) {
    where.userId = userId;
  } else if (role === "MANAGER") {
    const scopedIds = await getScopedEmployeeIds(userId, role);
    where.userId = { in: scopedIds ?? [] };
    if (employeeId) {
      where.userId = scopedIds && scopedIds.includes(employeeId) ? employeeId : "__none__";
    }
  } else if (employeeId) {
    where.userId = employeeId;
  }

  // Optional location filter — restrict to entries by users assigned to that location
  if (locationId && (role === "ADMIN" || role === "MANAGER")) {
    where.user = {
      locations: { some: { locationId } },
    };
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

  // Strip wage for non-admin viewers
  const viewable = entries.map((e) => ({
    ...e,
    user: {
      ...e.user,
      hourlyWage: role === "ADMIN" ? e.user.hourlyWage ?? 0 : 0,
    },
  }));

  if (formatType === "csv") {
    if (role !== "ADMIN" && role !== "MANAGER") {
      return new Response("Forbidden", { status: 403 });
    }
    const includeCost = role === "ADMIN";
    const headers = [
      "Employee",
      "Email",
      "Department",
      "Clock In",
      "Clock Out",
      "Hours",
      ...(includeCost ? ["Wage", "Pay"] : []),
      "Edited",
    ];
    const rows = [headers.join(",")];
    let totalH = 0;
    let totalP = 0;
    const sorted = [...viewable].sort(
      (a, b) => new Date(a.clockIn).getTime() - new Date(b.clockIn).getTime()
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
          format(new Date(e.clockIn), "yyyy-MM-dd HH:mm"),
          e.clockOut ? format(new Date(e.clockOut), "yyyy-MM-dd HH:mm") : "",
          h.toFixed(2),
          ...(includeCost ? [(e.user.hourlyWage ?? 0).toFixed(2), pay.toFixed(2)] : []),
          e.editedBy ? "Y" : "",
        ].join(",")
      );
    }
    rows.push(
      [
        "TOTAL",
        "",
        "",
        "",
        "",
        totalH.toFixed(2),
        ...(includeCost ? ["", totalP.toFixed(2)] : []),
        "",
      ].join(",")
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

  // Trim selfies from list payload
  const trimmed = viewable.map((e: any) => ({
    ...e,
    selfieIn: e.selfieIn ? "present" : null,
    selfieOut: e.selfieOut ? "present" : null,
  }));

  return NextResponse.json({ entries: trimmed, viewerRole: role });
}
