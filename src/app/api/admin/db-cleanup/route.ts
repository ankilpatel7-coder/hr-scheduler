import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/guards";

const schema = z.object({
  confirm: z.literal("DELETE"),
  // 'half' targets ~50% of records by deleting oldest;
  // 'olderThan' deletes everything older than the given date (yyyy-mm-dd)
  mode: z.enum(["half", "olderThan"]),
  olderThan: z.string().optional(),
});

export async function POST(req: Request) {
  const auth = await requireRole(["ADMIN"]);
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input. Must POST { confirm: 'DELETE', mode: 'half'|'olderThan', olderThan?: 'yyyy-mm-dd' }" },
      { status: 400 }
    );
  }

  let cutoffDate: Date;

  if (parsed.data.mode === "olderThan") {
    if (!parsed.data.olderThan) {
      return NextResponse.json(
        { error: "olderThan mode requires olderThan date" },
        { status: 400 }
      );
    }
    cutoffDate = new Date(parsed.data.olderThan + "T00:00:00");
    if (isNaN(cutoffDate.getTime())) {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    }
  } else {
    // 'half' — find the median date of clock entries and use that as cutoff
    const totalEntries = await prisma.clockEntry.count();
    if (totalEntries === 0) {
      return NextResponse.json({
        ok: true,
        deleted: { clockEntries: 0, shifts: 0, swaps: 0, timeOffs: 0 },
        message: "Nothing to delete.",
      });
    }
    const halfIndex = Math.floor(totalEntries / 2);
    const median = await prisma.clockEntry.findMany({
      orderBy: { clockIn: "asc" },
      skip: halfIndex,
      take: 1,
      select: { clockIn: true },
    });
    if (!median[0]) {
      return NextResponse.json(
        { error: "Could not determine median date" },
        { status: 500 }
      );
    }
    cutoffDate = median[0].clockIn;
  }

  // Hard safety: never delete records from the last 30 days regardless of mode.
  // KY law requires keeping records for 1 year, so anything more aggressive than
  // 30 days back risks compliance issues — but a 30-day floor lets even
  // an aggressive cleanup avoid blowing away current payroll.
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400_000);
  if (cutoffDate > thirtyDaysAgo) {
    cutoffDate = thirtyDaysAgo;
  }

  // Delete oldest clock entries up to cutoff
  const deletedClockEntries = await prisma.clockEntry.deleteMany({
    where: { clockIn: { lt: cutoffDate } },
  });

  // Delete shifts older than cutoff (those whose endTime is before cutoff)
  const deletedShifts = await prisma.shift.deleteMany({
    where: { endTime: { lt: cutoffDate } },
  });

  // Delete resolved (approved/denied/canceled) swaps older than cutoff
  const deletedSwaps = await prisma.shiftSwap.deleteMany({
    where: {
      decidedAt: { lt: cutoffDate },
      status: { in: ["APPROVED", "DENIED", "CANCELED"] },
    },
  });

  // Delete decided time-off requests older than cutoff
  const deletedTimeOffs = await prisma.timeOffRequest.deleteMany({
    where: {
      decidedAt: { lt: cutoffDate },
      status: { in: ["APPROVED", "DENIED", "CANCELED"] },
    },
  });

  // Delete used password reset tokens that are old, plus any expired tokens
  const deletedTokens = await prisma.passwordReset.deleteMany({
    where: {
      OR: [
        { AND: [{ usedAt: { not: null } }, { createdAt: { lt: cutoffDate } }] },
        { expiresAt: { lt: cutoffDate } },
      ],
    },
  });

  // VACUUM FULL would reclaim disk space immediately, but it locks tables.
  // Skipping for safety. Postgres autovacuum will reclaim over time.

  return NextResponse.json({
    ok: true,
    cutoffDate: cutoffDate.toISOString(),
    deleted: {
      clockEntries: deletedClockEntries.count,
      shifts: deletedShifts.count,
      swaps: deletedSwaps.count,
      timeOffs: deletedTimeOffs.count,
      passwordResetTokens: deletedTokens.count,
    },
    note: "Disk space will reclaim over a few hours via Postgres autovacuum.",
  });
}
