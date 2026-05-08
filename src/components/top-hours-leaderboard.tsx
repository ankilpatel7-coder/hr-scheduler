/**
 * Top employees by hours this week. Server component.
 *
 *   <TopHoursLeaderboard tenantId={tenantId} tenantSlug={slug} />
 */

import Link from "next/link";
import { prisma } from "@/lib/db";
import { startOfWeek, endOfWeek } from "date-fns";
import { ArrowRight } from "lucide-react";

const TAKE = 5;
const AVATAR_BG = ["#fce7e1", "#e1f5ee", "#eeedfe", "#fbeaf0", "#FAEEDA"];
const AVATAR_FG = ["#b8551c", "#0f6e56", "#3c3489", "#993556", "#854F0B"];

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
      userId: true,
      clockIn: true,
      clockOut: true,
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
    <div className="card p-5">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="display text-lg text-ink">Top hours · this week</h3>
        <Link
          href={`/${tenantSlug}/timesheets`}
          className="text-xs text-rust hover:underline inline-flex items-center gap-1"
        >
          All <ArrowRight size={11} />
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="py-6 text-center text-smoke italic text-sm">
          No clock-ins yet this week.
        </div>
      ) : (
        <div className="space-y-2.5">
          {rows.map((r) => {
            const i = hashIndex(r.id, AVATAR_BG.length);
            const tone = r.hours >= 40 ? "#dc2626" : r.hours >= 32 ? "#d97706" : "#059669";
            return (
              <div key={r.id} className="flex items-center gap-3">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center display text-xs shrink-0"
                  style={{ background: AVATAR_BG[i], color: AVATAR_FG[i] }}
                >
                  {initials(r.name)}
                </div>
                <span className="text-sm text-ink flex-1 truncate">{r.name}</span>
                <span className="text-xs font-mono tabular-nums" style={{ color: tone }}>
                  {r.hours.toFixed(1)}h
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
