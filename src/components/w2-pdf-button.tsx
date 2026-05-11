"use client";

/**
 * Download W-2 as PDF — same jsPDF + html2canvas pattern as paystub PDF.
 * Captures element with id="w2-printable" and renders to portrait Letter.
 */

import { useState } from "react";
import { Download } from "lucide-react";

export default function W2PdfButton({ filename }: { filename: string }) {
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

      const target = document.getElementById("w2-printable");
      if (!target) {
        throw new Error("W-2 element not found.");
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

      const imgWidth = usableWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      const finalHeight = Math.min(imgHeight, pageHeight - 2 * margin);
      const finalWidth = finalHeight === imgHeight ? imgWidth : finalHeight / (canvas.height / canvas.width);

      pdf.addImage(canvas.toDataURL("image/png"), "PNG", margin, margin, finalWidth, finalHeight);
      pdf.save(filename);

      setGenerating(false);
    } catch (e: any) {
      console.error("W-2 PDF generation failed:", e);
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
        <Download size={14} /> {generating ? "Generating PDF…" : "Download PDF"}
      </button>
      {error && <span className="text-xs text-red-600 ml-2">{error}</span>}
    </>
  );
}
