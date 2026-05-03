"use client";

import { useState } from "react";
import { Download } from "lucide-react";

export default function PdfButton({ filename }: { filename: string }) {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function downloadPdf() {
    setGenerating(true);
    setError(null);
    try {
      // Dynamic import to keep these libs out of the initial bundle
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
        import("jspdf"),
        import("html2canvas"),
      ]);

      const stub = document.getElementById("paystub-printable");
      if (!stub) {
        setError("Paystub element not found.");
        setGenerating(false);
        return;
      }

      const canvas = await html2canvas(stub, {
        scale: 2, // higher resolution
        backgroundColor: "#ffffff",
        useCORS: true,
        logging: false,
      });

      const imgData = canvas.toDataURL("image/png");

      // US Letter portrait, 8.5" x 11"
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "in",
        format: "letter",
      });

      const pdfWidth = 8.5;
      const pdfHeight = 11;
      const margin = 0.5;
      const usableWidth = pdfWidth - 2 * margin;

      const imgAspect = canvas.height / canvas.width;
      const imgWidth = usableWidth;
      const imgHeight = imgWidth * imgAspect;

      // If too tall, scale down to fit
      const finalHeight = Math.min(imgHeight, pdfHeight - 2 * margin);
      const finalWidth = finalHeight === imgHeight ? imgWidth : finalHeight / imgAspect;

      pdf.addImage(imgData, "PNG", margin, margin, finalWidth, finalHeight);
      pdf.save(filename);

      setGenerating(false);
    } catch (e: any) {
      console.error("PDF generation failed:", e);
      setError(e?.message ?? "PDF generation failed.");
      setGenerating(false);
    }
  }

  return (
    <>
      <button onClick={downloadPdf} disabled={generating} className="btn btn-primary">
        <Download size={14} /> {generating ? "Generating PDF…" : "Download PDF"}
      </button>
      {error && <span className="text-xs text-rose ml-2">{error}</span>}
    </>
  );
}
