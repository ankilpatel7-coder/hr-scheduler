import ExcelJS from "exceljs";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/guards";
import { format } from "date-fns";

function hours(a: Date, b: Date | null) {
  if (!b) return 0;
  return (b.getTime() - a.getTime()) / 3_600_000;
}

export async function GET(req: Request) {
  const auth = await requireRole(["ADMIN", "MANAGER"]);
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const where: any = {};
  if (from || to) {
    where.clockIn = {};
    if (from) where.clockIn.gte = new Date(from);
    if (to) where.clockIn.lte = new Date(to);
  }

  const entries = await prisma.clockEntry.findMany({
    where,
    orderBy: { clockIn: "asc" },
    include: {
      user: { select: { name: true, email: true, department: true, hourlyWage: true } },
    },
  });

  const wb = new ExcelJS.Workbook();
  wb.creator = "Shiftwork";
  wb.created = new Date();

  const ws = wb.addWorksheet("Timesheets");
  ws.columns = [
    { header: "Employee", key: "name", width: 24 },
    { header: "Email", key: "email", width: 28 },
    { header: "Department", key: "dept", width: 18 },
    { header: "Clock In", key: "in", width: 20 },
    { header: "Clock Out", key: "out", width: 20 },
    { header: "Hours", key: "hours", width: 10 },
    { header: "Wage/hr", key: "wage", width: 10 },
    { header: "Pay", key: "pay", width: 12 },
    { header: "Edited?", key: "edited", width: 10 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).alignment = { vertical: "middle" };

  let totalHours = 0;
  let totalPay = 0;
  for (const e of entries) {
    const h = hours(e.clockIn, e.clockOut);
    const pay = h * (e.user.hourlyWage ?? 0);
    totalHours += h;
    totalPay += pay;
    ws.addRow({
      name: e.user.name,
      email: e.user.email,
      dept: e.user.department ?? "",
      in: format(e.clockIn, "yyyy-MM-dd HH:mm"),
      out: e.clockOut ? format(e.clockOut, "yyyy-MM-dd HH:mm") : "",
      hours: Number(h.toFixed(2)),
      wage: e.user.hourlyWage ?? 0,
      pay: Number(pay.toFixed(2)),
      edited: e.editedBy ? "Yes" : "",
    });
  }

  // Totals row
  const totalRow = ws.addRow({
    name: "TOTAL",
    hours: Number(totalHours.toFixed(2)),
    pay: Number(totalPay.toFixed(2)),
  });
  totalRow.font = { bold: true };
  totalRow.getCell("hours").numFmt = "0.00";
  totalRow.getCell("pay").numFmt = "$#,##0.00";

  // Format numbers
  ws.getColumn("hours").numFmt = "0.00";
  ws.getColumn("wage").numFmt = "$0.00";
  ws.getColumn("pay").numFmt = "$#,##0.00";

  const buffer = await wb.xlsx.writeBuffer();
  return new Response(buffer as any, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="timesheets-${format(
        new Date(),
        "yyyy-MM-dd"
      )}.xlsx"`,
    },
  });
}
