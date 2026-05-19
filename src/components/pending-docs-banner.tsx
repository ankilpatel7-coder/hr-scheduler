"use client";

/**
 * PendingDocsBanner — calls /api/clock/precheck on mount and shows a banner
 * if the user has REQUIRED documents that block clock-in. Hidden when there
 * are no blockers, so safe to drop into the dashboard / clock / mobile pages
 * without conditional logic.
 *
 * Use:
 *   <PendingDocsBanner tenantSlug={tenant} />
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertCircle, FileText } from "lucide-react";

type Blocker = { documentId: string; title: string };

export default function PendingDocsBanner() {
  const pathname = usePathname();
  // /[tenant]/something → tenant is the first non-empty segment
  const tenantSlug = (pathname ?? "").split("/").filter(Boolean)[0] ?? "";
  const [blockers, setBlockers] = useState<Blocker[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/clock/precheck")
      .then((r) => (r.ok ? r.json() : { blockedBy: [] }))
      .then((j) => {
        if (!cancelled) setBlockers(j.blockedBy ?? []);
      })
      .catch(() => {
        if (!cancelled) setBlockers([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!blockers || blockers.length === 0) return null;

  return (
    <div className="mb-6 rounded-2xl bg-amber-50 ring-1 ring-amber-200 px-4 py-3 flex items-start gap-3">
      <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-amber-900">
          {blockers.length} document{blockers.length === 1 ? "" : "s"} need your
          signature before you can clock in.
        </p>
        <ul className="mt-1 text-xs text-amber-800 list-disc list-inside space-y-0.5">
          {blockers.slice(0, 3).map((b) => (
            <li key={b.documentId} className="truncate">
              {b.title}
            </li>
          ))}
          {blockers.length > 3 && (
            <li className="italic text-amber-700">
              +{blockers.length - 3} more
            </li>
          )}
        </ul>
      </div>
      <Link
        href={`/${tenantSlug}/my-documents`}
        className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-medium hover:bg-amber-700"
      >
        <FileText className="w-3.5 h-3.5" /> Sign now
      </Link>
    </div>
  );
}
