"use client";

/**
 * Shared pagination control.
 *
 * Two modes:
 *   - client pages: pass onPageChange (they already hold the list in state)
 *   - server pages: pass baseHref, e.g. "/acme/timesheets/adjustments?days=30"
 *     and this renders Links with &page=N appended
 *
 * baseHref is a STRING, not a function, on purpose: a Server Component
 * cannot pass a function prop to a Client Component — Next throws at render.
 *
 * Renders nothing when everything fits on one page.
 */

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

export default function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  baseHref,
  label = "records",
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange?: (page: number) => void;
  baseHref?: string;
  label?: string;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;

  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);
  const canPrev = page > 1;
  const canNext = page < totalPages;

  function hrefFor(p: number): string {
    if (!baseHref) return "#";
    const joiner = baseHref.includes("?") ? "&" : "?";
    return `${baseHref}${joiner}page=${p}`;
  }

  const btn =
    "inline-flex items-center justify-center w-7 h-7 rounded-md border border-dust bg-paper text-ink hover:bg-steel transition-colors";
  const btnOff =
    "inline-flex items-center justify-center w-7 h-7 rounded-md border border-dust bg-paper text-smoke/40 cursor-not-allowed";

  return (
    <div className="flex items-center justify-between gap-3 py-2 flex-wrap">
      <div className="text-[11px] text-smoke tabular-nums">
        Showing {first}–{last} of {total} {label}
      </div>
      <div className="flex items-center gap-1.5">
        {canPrev ? (
          baseHref ? (
            <Link href={hrefFor(page - 1)} className={btn} aria-label="Previous page">
              <ChevronLeft size={14} />
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => onPageChange?.(page - 1)}
              className={btn}
              aria-label="Previous page"
            >
              <ChevronLeft size={14} />
            </button>
          )
        ) : (
          <span className={btnOff}>
            <ChevronLeft size={14} />
          </span>
        )}

        <span className="text-[11px] text-smoke tabular-nums px-1">
          {page} / {totalPages}
        </span>

        {canNext ? (
          baseHref ? (
            <Link href={hrefFor(page + 1)} className={btn} aria-label="Next page">
              <ChevronRight size={14} />
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => onPageChange?.(page + 1)}
              className={btn}
              aria-label="Next page"
            >
              <ChevronRight size={14} />
            </button>
          )
        ) : (
          <span className={btnOff}>
            <ChevronRight size={14} />
          </span>
        )}
      </div>
    </div>
  );
}
