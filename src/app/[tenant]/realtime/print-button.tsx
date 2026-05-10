"use client";

import { Printer } from "lucide-react";

export default function PrintButtonClient() {
  return (
    <span
      onClick={() => window.print()}
      className="inline-flex items-center gap-1.5 cursor-pointer"
    >
      <Printer size={13} /> Print
    </span>
  );
}
