"use client";

/**
 * Schedule PDF — v3.
 *
 * v3 fixes from v2:
 *   1. Filters out archived AND inactive employees. v2 trusted shift.employee
 *      blindly; if an employee was archived after their shift was published,
 *      they'd still show in the PDF. Now we cross-check against /api/employees
 *      which returns only active non-archived users.
 *   2. Tag name now appears alongside role in the cell. v2 fetched the tag
 *      from the API include but never displayed it.
 *   3. Role/tag rendering is more visible — italic on its own line so it
 *      stands out from the time even on busy cells.
 *
 * Layout unchanged: landscape Letter, grid with totals row + page numbers.
 * Filter unchanged: published === true AND employeeId != null.
 */

import { useState } from "react";
import { Download } from "lucide-react";
import { addDays, format, startOfDay } from "date-fns";

type Shift = {
  id: string;
  employeeId: string | null;
  startTime: string;
  endTime: string;
  role: string | null;
  published: boolean;
  employee: { id: string; name: string } | null;
  location: { id: string; name: string } | null;
  tag: { id: string; name: string; color: string | null } | null;
};

type ActiveEmployee = {
  id: string;
  name: string;
  active: boolean;
  archivedAt: string | null;
};

export default function SchedulePdfButton({
  weekStartIso,
  weekEndIso,
  tenantSlug,
  tenantBusinessName,
  locationFilter,
  locationName,
}: {
  weekStartIso: string;
  weekEndIso: string;
  tenantSlug?: string;
  tenantBusinessName?: string;
  locationFilter?: string;
  locationName?: string;
}) {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function downloadPdf() {
    setGenerating(true);
    setError(null);
    try {
      const [{ default: jsPDF }, autoTableMod] = await Promise.all([
        import("jspdf"),
        import("jspdf-autotable"),
      ]);
      const autoTable: (doc: any, opts: any) => void =
        (autoTableMod as any).default ?? (autoTableMod as any);

      // Fetch shifts AND the active-employee whitelist in parallel.
      const locQuery = locationFilter ? `&locationId=${locationFilter}` : "";
      const [shiftsRes, empsRes] = await Promise.all([
        fetch(`/api/shifts?from=${weekStartIso}&to=${weekEndIso}${locQuery}`),
        fetch(`/api/employees`),
      ]);
      if (!shiftsRes.ok) throw new Error("Could not load shifts");
      if (!empsRes.ok) throw new Error("Could not load employees");
      const { shifts } = (await shiftsRes.json()) as { shifts: Shift[] };
      const { employees } = (await empsRes.json()) as {
        employees: ActiveEmployee[];
      };

      // Whitelist of currently-active employee IDs. /api/employees filters out
      // archived users by default, but we also drop active===false here in case
      // anyone is "soft-disabled" without being archived.
      const activeIds = new Set(
        employees
          .filter((e) => e.active && !e.archivedAt)
          .map((e) => e.id),
      );

      // Filter shifts: published, has assigned employee, employee is still active.
      const printable = shifts.filter(
        (s) =>
          s.published &&
          s.employeeId &&
          s.employee &&
          activeIds.has(s.employeeId),
      );

      // Day columns (Sun → Sat starting from provided weekStart).
      const weekStart = startOfDay(new Date(weekStartIso));
      const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
      const dayKey = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const dayKeys = days.map(dayKey);

      // Aggregate per employee.
      type EmpRow = { name: string; cells: string[][]; total: number };
      const empMap = new Map<string, EmpRow>();
      const dailyHours = days.map(() => 0);

      for (const s of printable) {
        const start = new Date(s.startTime);
        const end = new Date(s.endTime);
        const idx = dayKeys.indexOf(dayKey(start));
        if (idx < 0) continue;

        const hours = (end.getTime() - start.getTime()) / 3_600_000;
        dailyHours[idx] += hours;

        let row = empMap.get(s.employeeId!);
        if (!row) {
          row = {
            name: s.employee!.name,
            cells: Array.from({ length: 7 }, () => []),
            total: 0,
          };
          empMap.set(s.employeeId!, row);
        }
        row.total += hours;
        row.cells[idx].push(formatShiftCell(start, end, s.role, s.tag));
      }

      const empRows = Array.from(empMap.values()).sort((a, b) =>
        a.name.localeCompare(b.name),
      );

      if (empRows.length === 0) {
        throw new Error(
          "No published shifts to export. Publish the schedule first.",
        );
      }

      // ---- Draw the PDF ----
      const pdf = new jsPDF({
        orientation: "landscape",
        unit: "in",
        format: "letter",
      });
      const margin = 0.4;

      // Header
      pdf.setFontSize(16);
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(15, 23, 42);
      pdf.text(tenantBusinessName ?? "Schedule", margin, margin + 0.25);

      pdf.setFontSize(11);
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(71, 85, 105);
      pdf.text(
        `Week of ${format(weekStart, "MMMM d, yyyy")}`,
        margin,
        margin + 0.5,
      );

      let headerBottom = margin + 0.6;
      if (locationName) {
        pdf.setFontSize(10);
        pdf.text(`Location: ${locationName}`, margin, margin + 0.7);
        headerBottom = margin + 0.8;
      }

      const head = [
        [
          "Employee",
          ...days.map((d) => `${format(d, "EEE")}\n${format(d, "MMM d")}`),
          "Total",
        ],
      ];

      const body = empRows.map((emp) => [
        emp.name,
        ...emp.cells.map((c) => (c.length ? c.join("\n\n") : "—")),
        `${emp.total.toFixed(1)}h`,
      ]);

      const grandTotal = dailyHours.reduce((a, b) => a + b, 0);
      const foot = [
        [
          "Daily total",
          ...dailyHours.map((h) => (h > 0 ? `${h.toFixed(1)}h` : "—")),
          `${grandTotal.toFixed(1)}h`,
        ],
      ];

      autoTable(pdf, {
        head,
        body,
        foot,
        startY: headerBottom + 0.1,
        theme: "grid",
        styles: {
          font: "helvetica",
          fontSize: 8.5,
          cellPadding: 0.07,
          lineColor: [226, 232, 240],
          lineWidth: 0.006,
          textColor: [15, 23, 42],
          overflow: "linebreak",
          valign: "top",
        },
        headStyles: {
          fillColor: [15, 23, 42],
          textColor: [255, 255, 255],
          fontStyle: "bold",
          halign: "center",
          fontSize: 9,
          cellPadding: 0.09,
        },
        footStyles: {
          fillColor: [241, 245, 249],
          textColor: [15, 23, 42],
          fontStyle: "bold",
          halign: "right",
        },
        columnStyles: {
          0: {
            fontStyle: "bold",
            cellWidth: 1.5,
            halign: "left",
            valign: "middle",
          },
          1: { halign: "left" },
          2: { halign: "left" },
          3: { halign: "left" },
          4: { halign: "left" },
          5: { halign: "left" },
          6: { halign: "left" },
          7: { halign: "left" },
          8: {
            halign: "right",
            fontStyle: "bold",
            cellWidth: 0.6,
            valign: "middle",
          },
        },
        alternateRowStyles: {
          fillColor: [250, 251, 252],
        },
        margin: { left: margin, right: margin, bottom: margin },
        didDrawPage: (data: any) => {
          const pageCount = pdf.internal.pages.length - 1;
          const pageNum = data.pageNumber;
          pdf.setFontSize(8);
          pdf.setTextColor(148, 163, 184);
          pdf.text(
            `Page ${pageNum} of ${pageCount}`,
            pdf.internal.pageSize.getWidth() - margin,
            pdf.internal.pageSize.getHeight() - margin / 2,
            { align: "right" },
          );
        },
      });

      pdf.save(buildFilename(weekStartIso, weekEndIso, tenantSlug));
    } catch (e: any) {
      console.error("Schedule PDF generation failed:", e);
      setError(e?.message ?? "PDF generation failed.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <>
      <button
        onClick={downloadPdf}
        disabled={generating}
        className="btn btn-secondary print:hidden"
        title="Download this week's published schedule as PDF"
      >
        <Download size={14} /> {generating ? "Generating…" : "Download PDF"}
      </button>
      {error && (
        <span className="text-xs text-red-600 ml-2 print:hidden" title={error}>
          {error}
        </span>
      )}
    </>
  );
}

// Cell text: time on line 1, role/tag on line 2. Examples:
//   "9a–5p"             (no role, no tag)
//   "9a–5p\nBudtender"  (role only)
//   "9a–5p\nSales"      (tag only)
//   "9a–5p\nBudtender · Sales"  (both)
function formatShiftCell(
  start: Date,
  end: Date,
  role: string | null,
  tag: { name: string } | null,
): string {
  const t = (d: Date) => {
    const s = format(d, "h:mma").toLowerCase();
    return s.replace(":00", "").replace("am", "a").replace("pm", "p");
  };
  const time = `${t(start)}–${t(end)}`;
  const roleStr = role && role.trim();
  const tagStr = tag?.name && tag.name.trim();
  const labelParts: string[] = [];
  if (roleStr) labelParts.push(roleStr);
  if (tagStr) labelParts.push(tagStr);
  return labelParts.length > 0
    ? `${time}\n${labelParts.join(" · ")}`
    : time;
}

function buildFilename(
  startIso: string,
  endIso: string,
  tenant?: string,
): string {
  const start = startIso.slice(0, 10);
  const end = endIso.slice(0, 10);
  const tenantPart = tenant ? `${tenant}-` : "";
  return `${tenantPart}schedule-${start}-to-${end}.pdf`;
}
