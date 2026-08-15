"use client";

/**
 * Shared pagination control.
 *
 * Two modes:
 *   - client: pass onPageChange, used by pages that already hold the full
 *     list in state (time off, swaps)
 *   - server: pass hrefFor, renders Links so the page survives refresh and
 *     can be shared (activity log)
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
  hrefFor,
  label = "records",
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange?: (page: number) => void;
  hrefFor?: (page: number) => string;
  label?: string;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;

  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);
  const canPrev = page > 1;
  const canNext = page < totalPages;

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
          hrefFor ? (
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
          hrefFor ? (
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
