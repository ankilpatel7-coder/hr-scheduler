"use client";

/**
 * Download timesheet (pivot or list) as PDF.
 * Same jsPDF + html2canvas pattern as the other PDF buttons.
 * Captures element with id="timesheet-printable", landscape Letter, multi-page.
 */

import { useState } from "react";
import { Download } from "lucide-react";

export default function TimesheetPdfButton({
  filename,
}: {
  filename: string;
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

      const target = document.getElementById("timesheet-printable");
      if (!target) throw new Error("Timesheet element not found");

      const canvas = await html2canvas(target, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
        logging: false,
        ignoreElements: (el) => {
          const cls = (el as HTMLElement).className;
          if (typeof cls === "string" && cls.includes("print:hidden")) return true;
          return false;
        },
      });

      const pdf = new jsPDF({ orientation: "landscape", unit: "in", format: "letter" });
      const pageWidth = 11;
      const pageHeight = 8.5;
      const margin = 0.4;
      const usableWidth = pageWidth - 2 * margin;
      const usableHeight = pageHeight - 2 * margin;

      const imgWidth = usableWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      const imgData = canvas.toDataURL("image/png");

      if (imgHeight <= usableHeight) {
        pdf.addImage(imgData, "PNG", margin, margin, imgWidth, imgHeight);
      } else {
        let heightRemaining = imgHeight;
        let pageOffset = 0;
        while (heightRemaining > 0) {
          const yPos = margin - pageOffset;
          pdf.addImage(imgData, "PNG", margin, yPos, imgWidth, imgHeight);
          heightRemaining -= usableHeight;
          pageOffset += usableHeight;
          if (heightRemaining > 0) pdf.addPage();
        }
      }

      pdf.save(filename);
      setGenerating(false);
    } catch (e: any) {
      console.error("Timesheet PDF generation failed:", e);
      setError(e?.message ?? "PDF generation failed.");
      setGenerating(false);
    }
  }

  return (
    <>
      <button
        onClick={downloadPdf}
        disabled={generating}
        className="btn btn-rust inline-flex items-center gap-1.5 print:hidden"
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
