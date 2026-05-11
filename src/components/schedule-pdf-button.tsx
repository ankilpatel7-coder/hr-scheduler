"use client";

/**
 * Download-as-PDF button for the weekly schedule. Mirrors the paystub
 * pdf-button.tsx pattern: dynamic-import jsPDF + html2canvas, capture the
 * schedule element, embed as PNG into a landscape Letter PDF, split across
 * multiple pages if needed.
 *
 * Capture target: any element with id="schedule-printable" — caller is
 * responsible for wrapping the schedule grid with that id (or a sensible
 * fallback like <main>).
 *
 * Skips elements with the `print:hidden` Tailwind class (toolbar, buttons,
 * dropdowns, modals) so the PDF only contains the schedule itself.
 */

import { useState } from "react";
import { Download } from "lucide-react";

export default function SchedulePdfButton({
  weekStartIso,
  weekEndIso,
  tenantSlug,
}: {
  weekStartIso: string;
  weekEndIso: string;
  tenantSlug?: string;
}) {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function downloadPdf() {
    setGenerating(true);
    setError(null);
    try {
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
        import("jspdf"),
        import("html2canvas"),
      ]);

      // Prefer the explicit id; fall back to <main> so this works even if
      // the schedule page hasn't added the wrapper yet.
      const target =
        document.getElementById("schedule-printable") ??
        document.querySelector("main");
      if (!target) {
        throw new Error("Schedule element not found.");
      }

      const canvas = await html2canvas(target as HTMLElement, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
        logging: false,
        // Skip anything tagged print:hidden (toolbar, action buttons, modals).
        ignoreElements: (el) => {
          const cls = (el as HTMLElement).className;
          if (typeof cls !== "string") return false;
          // Hide screen-only chrome
          if (cls.includes("print:hidden")) return true;
          // Skip fixed-position overlays (modals/portals) that aren't part
          // of the schedule itself.
          const style = window.getComputedStyle(el as HTMLElement);
          if (style.position === "fixed") return true;
          return false;
        },
      });

      // Landscape Letter (11 x 8.5 in)
      const pdf = new jsPDF({
        orientation: "landscape",
        unit: "in",
        format: "letter",
      });

      const pageWidth = 11;
      const pageHeight = 8.5;
      const margin = 0.4;
      const usableWidth = pageWidth - 2 * margin;
      const usableHeight = pageHeight - 2 * margin;

      // Image dims at PDF scale
      const imgWidth = usableWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      const imgData = canvas.toDataURL("image/png");

      if (imgHeight <= usableHeight) {
        // Single-page case
        pdf.addImage(imgData, "PNG", margin, margin, imgWidth, imgHeight);
      } else {
        // Multi-page: shift the image up by usableHeight per page so each
        // page shows the next slice. PDF's addImage clips at the page edges.
        let heightRemaining = imgHeight;
        let pageOffset = 0;
        while (heightRemaining > 0) {
          const yPos = margin - pageOffset; // negative as we paginate
          pdf.addImage(imgData, "PNG", margin, yPos, imgWidth, imgHeight);
          heightRemaining -= usableHeight;
          pageOffset += usableHeight;
          if (heightRemaining > 0) pdf.addPage();
        }
      }

      const filename = buildFilename(weekStartIso, weekEndIso, tenantSlug);
      pdf.save(filename);

      setGenerating(false);
    } catch (e: any) {
      console.error("Schedule PDF generation failed:", e);
      setError(e?.message ?? "PDF generation failed.");
      setGenerating(false);
    }
  }

  return (
    <>
      <button
        onClick={downloadPdf}
        disabled={generating}
        className="btn btn-secondary print:hidden"
        title="Download this week's schedule as PDF"
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

function buildFilename(startIso: string, endIso: string, tenant?: string): string {
  const start = startIso.slice(0, 10);
  const end = endIso.slice(0, 10);
  const tenantPart = tenant ? `${tenant}-` : "";
  return `${tenantPart}schedule-${start}-to-${end}.pdf`;
}
