import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
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
    orderBy: [{ user: { name: "asc" } }, { clockIn: "asc" }],
    include: {
      user: { select: { name: true, department: true, hourlyWage: true } },
    },
  });

  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });
  doc.setFontSize(16);
  doc.text("Shiftwork — Timesheets", 40, 40);
  doc.setFontSize(10);
  doc.setTextColor(90);
  const range =
    from && to
      ? `${format(new Date(from), "MMM d, yyyy")} – ${format(new Date(to), "MMM d, yyyy")}`
      : "All time";
  doc.text(range, 40, 58);
  doc.text(`Generated ${format(new Date(), "PPP p")}`, 40, 72);

  let totalHours = 0;
  let totalPay = 0;

  const rows = entries.map((e) => {
    const h = hours(e.clockIn, e.clockOut);
    const pay = h * (e.user.hourlyWage ?? 0);
    totalHours += h;
    totalPay += pay;
    return [
      e.user.name,
      e.user.department ?? "",
      format(e.clockIn, "MMM d, h:mma"),
      e.clockOut ? format(e.clockOut, "MMM d, h:mma") : "—",
      h.toFixed(2),
      `$${(e.user.hourlyWage ?? 0).toFixed(2)}`,
      `$${pay.toFixed(2)}`,
      e.editedBy ? "✓" : "",
    ];
  });

  autoTable(doc, {
    startY: 88,
    head: [["Employee", "Dept", "Clock In", "Clock Out", "Hours", "Wage", "Pay", "Edit"]],
    body: rows,
    foot: [
      [
        "TOTAL",
        "",
        "",
        "",
        totalHours.toFixed(2),
        "",
        `$${totalPay.toFixed(2)}`,
        "",
      ],
    ],
    styles: { fontSize: 9, cellPadding: 5 },
    headStyles: { fillColor: [26, 24, 22], textColor: [251, 249, 244] },
    footStyles: { fillColor: [221, 214, 199], textColor: [26, 24, 22], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [251, 249, 244] },
  });

  const pdf = doc.output("arraybuffer");
  return new Response(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="timesheets-${format(
        new Date(),
        "yyyy-MM-dd"
      )}.pdf"`,
    },
  });
}
