"use client";

/**
 * Download Form 941 as PDF — same jsPDF + html2canvas pattern.
 * Captures element with id="form941-printable" and renders to portrait Letter.
 */

import { useState } from "react";
import { Download } from "lucide-react";

export default function Form941PdfButton({ filename }: { filename: string }) {
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

      const target = document.getElementById("form941-printable");
      if (!target) {
        throw new Error("Form 941 element not found.");
      }

      const canvas = await html2canvas(target, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
        logging: false,
      });

      const pdf = new jsPDF({ orientation: "portrait", unit: "in", format: "letter" });
      const pageWidth = 8.5;
      const pageHeight = 11;
      const margin = 0.4;
      const usableWidth = pageWidth - 2 * margin;
      const usableHeight = pageHeight - 2 * margin;

      const imgWidth = usableWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      const imgData = canvas.toDataURL("image/png");

      if (imgHeight <= usableHeight) {
        pdf.addImage(imgData, "PNG", margin, margin, imgWidth, imgHeight);
      } else {
        // Multi-page: shift image up by usableHeight per page
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
      console.error("Form 941 PDF generation failed:", e);
      setError(e?.message ?? "PDF generation failed.");
      setGenerating(false);
    }
  }

  return (
    <>
      <button
        onClick={downloadPdf}
        disabled={generating}
        className="btn btn-rust inline-flex items-center gap-1.5"
      >
        <Download size={14} /> {generating ? "Generating PDF…" : "Download 941 PDF"}
      </button>
      {error && <span className="text-xs text-red-600 ml-2">{error}</span>}
    </>
  );
}
