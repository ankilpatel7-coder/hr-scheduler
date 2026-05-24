"use client";

/**
 * Schedule PDF — v2 (drawn, not screenshotted).
 *
 * Builds a clean tabular PDF with jsPDF + autoTable instead of html2canvas
 * scraping the on-screen UI. Result: vector output, professional layout,
 * proper page breaks, and tight filtering — only PUBLISHED shifts that have
 * an assigned employee land on the PDF (no drafts, no house shifts).
 *
 * Layout: landscape Letter
 *   - Header: tenant business name, "Week of <Mon>", optional location
 *   - Grid: Employee | Sun..Sat | Weekly total
 *     Each day cell: stacked shifts, e.g. "9:00a–5:00p" + role on second line
 *   - Footer row: daily totals + grand total
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

      // Fetch shifts for the week, scoped to the current location filter.
      const locQuery = locationFilter ? `&locationId=${locationFilter}` : "";
      const shiftsRes = await fetch(
        `/api/shifts?from=${weekStartIso}&to=${weekEndIso}${locQuery}`,
      );
      if (!shiftsRes.ok) throw new Error("Could not load shifts");
      const { shifts } = (await shiftsRes.json()) as { shifts: Shift[] };

      // Filter: only published shifts with an assigned employee.
      // Drops drafts AND house shifts (employeeId null).
      const printable = shifts.filter(
        (s) => s.published && s.employeeId && s.employee,
      );

      // Build day columns (Sun → Sat starting from the provided weekStart).
      const weekStart = startOfDay(new Date(weekStartIso));
      const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
      const dayKey = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const dayKeys = days.map(dayKey);

      // Aggregate per employee: array-of-strings per day cell + weekly total.
      type EmpRow = {
        name: string;
        cells: string[][];
        total: number;
      };
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
        row.cells[idx].push(formatShiftCell(start, end, s.role));
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

      // Header block
      pdf.setFontSize(16);
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(15, 23, 42); // slate-900
      pdf.text(tenantBusinessName ?? "Schedule", margin, margin + 0.25);

      pdf.setFontSize(11);
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(71, 85, 105); // slate-600
      const weekLabel = `Week of ${format(weekStart, "MMMM d, yyyy")}`;
      pdf.text(weekLabel, margin, margin + 0.5);

      let headerBottom = margin + 0.6;
      if (locationName) {
        pdf.setFontSize(10);
        pdf.text(`Location: ${locationName}`, margin, margin + 0.7);
        headerBottom = margin + 0.8;
      }

      // Header row: Employee | Sun MMM d | Mon MMM d | ... | Total
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
          lineColor: [226, 232, 240], // slate-200
          lineWidth: 0.006,
          textColor: [15, 23, 42],
          overflow: "linebreak",
          valign: "top",
        },
        headStyles: {
          fillColor: [15, 23, 42], // slate-900
          textColor: [255, 255, 255],
          fontStyle: "bold",
          halign: "center",
          fontSize: 9,
          cellPadding: 0.09,
        },
        footStyles: {
          fillColor: [241, 245, 249], // slate-100
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
          // Page number in the bottom-right.
          const pageCount = pdf.internal.pages.length - 1;
          const pageNum = data.pageNumber;
          pdf.setFontSize(8);
          pdf.setTextColor(148, 163, 184); // slate-400
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

// "9:00a–5:00p" plus role on second line if present.
function formatShiftCell(start: Date, end: Date, role: string | null): string {
  const t = (d: Date) => {
    const s = format(d, "h:mma").toLowerCase();
    // Compact AM/PM marker: "9:00am" → "9a", "12:30pm" → "12:30p"
    return s.replace(":00", "").replace("am", "a").replace("pm", "p");
  };
  const time = `${t(start)}–${t(end)}`;
  return role && role.trim() ? `${time}\n${role.trim()}` : time;
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
