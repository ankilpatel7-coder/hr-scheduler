/**
 * Premium top-hours leaderboard — ranked rows with gradient avatar borders,
 * progress bars showing % of 40 hours, position medal for top 3.
 */

import Link from "next/link";
import { prisma } from "@/lib/db";
import { startOfWeek, endOfWeek } from "date-fns";
import { ArrowRight, Crown } from "lucide-react";

const TAKE = 5;
const AVATAR_GRADIENTS = [
  "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
  "linear-gradient(135deg, #06b6d4 0%, #6366f1 100%)",
  "linear-gradient(135deg, #10b981 0%, #06b6d4 100%)",
  "linear-gradient(135deg, #ec4899 0%, #f43f5e 100%)",
  "linear-gradient(135deg, #f59e0b 0%, #ec4899 100%)",
];

function durationHours(a: Date, b: Date) {
  return Math.max(0, (b.getTime() - a.getTime()) / 36e5);
}
function hashIndex(s: string, mod: number) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % mod;
}
function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export default async function TopHoursLeaderboard({
  tenantId,
  tenantSlug,
}: {
  tenantId: string;
  tenantSlug: string;
}) {
  const now = new Date();
  const ws = startOfWeek(now, { weekStartsOn: 1 });
  const we = endOfWeek(now, { weekStartsOn: 1 });

  const entries = await prisma.clockEntry.findMany({
    where: {
      tenantId,
      clockIn: { gte: ws, lte: we },
      user: { active: true, role: { not: "ADMIN" } },
    },
    select: {
      userId: true, clockIn: true, clockOut: true,
      user: { select: { id: true, name: true, email: true } },
    },
  });

  const totals = new Map<string, { name: string; hours: number }>();
  for (const e of entries) {
    if (!e.user) continue;
    const end = e.clockOut ?? now;
    const cur = totals.get(e.userId) ?? { name: e.user.name || e.user.email, hours: 0 };
    cur.hours += durationHours(e.clockIn, end);
    totals.set(e.userId, cur);
  }

  const rows = Array.from(totals.entries())
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.hours - a.hours)
    .slice(0, TAKE);

  return (
    <div className="card p-6">
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <div className="label-eyebrow">This week</div>
          <h3 className="display text-2xl text-ink mt-1">Top hours</h3>
        </div>
        <Link
          href={`/${tenantSlug}/timesheets`}
          className="text-xs text-rust hover:underline inline-flex items-center gap-1 font-medium"
        >
          All <ArrowRight size={11} />
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="py-8 text-center text-smoke italic text-sm">
          No clock-ins yet this week.
        </div>
      ) : (
        <div className="space-y-3.5">
          {rows.map((r, idx) => {
            const grad = AVATAR_GRADIENTS[hashIndex(r.id, AVATAR_GRADIENTS.length)];
            const pct = Math.min(100, (r.hours / 40) * 100);
            const isOver = r.hours >= 40;
            const isAtRisk = r.hours >= 32 && r.hours < 40;
            const tone = isOver ? "#dc2626" : isAtRisk ? "#d97706" : "#10b981";
            const barGrad = isOver
              ? "linear-gradient(90deg, #f59e0b, #dc2626)"
              : isAtRisk
              ? "linear-gradient(90deg, #fbbf24, #f59e0b)"
              : "linear-gradient(90deg, #34d399, #10b981)";

            return (
              <div key={r.id} className="group">
                <div className="flex items-center gap-3">
                  <div className="relative shrink-0">
                    {/* Gradient border via padding trick */}
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-semibold"
                      style={{
                        background: grad,
                        boxShadow:
                          "0 2px 4px rgba(15, 23, 42, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.25)",
                      }}
                    >
                      {initials(r.name)}
                    </div>
                    {idx === 0 && (
                      <span
                        className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center"
                        style={{
                          background: "linear-gradient(135deg, #fbbf24, #f59e0b)",
                          boxShadow: "0 1px 3px rgba(245, 158, 11, 0.4)",
                        }}
                        title="#1 this week"
                      >
                        <Crown size={9} className="text-white" />
                      </span>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-medium text-ink truncate">{r.name}</span>
                      <span className="text-sm font-mono tabular-nums font-semibold" style={{ color: tone }}>
                        {r.hours.toFixed(1)}h
                      </span>
                    </div>
                    {/* Progress bar */}
                    <div
                      className="relative h-1.5 rounded-full mt-1.5 overflow-hidden"
                      style={{ background: "rgba(15, 23, 42, 0.05)" }}
                    >
                      <div
                        className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
                        style={{
                          width: `${pct}%`,
                          background: barGrad,
                          boxShadow: `0 0 8px ${tone}40`,
                        }}
                      />
                      {/* 40h marker */}
                      <div
                        className="absolute inset-y-0 w-px"
                        style={{ left: "100%", background: "rgba(15, 23, 42, 0.3)" }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
