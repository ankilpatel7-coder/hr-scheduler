import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/guards";

export async function GET() {
  const auth = await requireRole(["ADMIN"]);
  if ("error" in auth) return auth.error;

  // Get total database size in bytes (Postgres-specific query)
  const sizeRows = (await prisma.$queryRawUnsafe(
    `SELECT pg_database_size(current_database()) AS bytes`
  )) as Array<{ bytes: bigint | number }>;
  const totalBytes = Number(sizeRows[0]?.bytes ?? 0);

  // Per-table sizes for transparency
  const tableRows = (await prisma.$queryRawUnsafe(
    `SELECT
      relname AS table,
      pg_total_relation_size(C.oid) AS bytes
    FROM pg_class C
    LEFT JOIN pg_namespace N ON (N.oid = C.relnamespace)
    WHERE nspname = 'public' AND C.relkind = 'r'
    ORDER BY pg_total_relation_size(C.oid) DESC
    LIMIT 20`
  )) as Array<{ table: string; bytes: bigint | number }>;

  const tables = tableRows.map((t) => ({
    table: t.table,
    bytes: Number(t.bytes),
  }));

  // Record counts for the big tables
  const [shifts, clockEntries, swaps, timeOff, users, locations] =
    await Promise.all([
      prisma.shift.count(),
      prisma.clockEntry.count(),
      prisma.shiftSwap.count(),
      prisma.timeOffRequest.count(),
      prisma.user.count(),
      prisma.location.count(),
    ]);

  // Date of oldest clock entry, for cleanup planning
  const oldest = await prisma.clockEntry.findFirst({
    orderBy: { clockIn: "asc" },
    select: { clockIn: true },
  });

  const limitBytes = 0.5 * 1024 ** 3; // Neon free tier
  const usedPercent = (totalBytes / limitBytes) * 100;

  return NextResponse.json({
    totalBytes,
    totalMB: totalBytes / (1024 ** 2),
    limitBytes,
    limitMB: limitBytes / (1024 ** 2),
    usedPercent,
    tables,
    counts: {
      shifts,
      clockEntries,
      swaps,
      timeOff,
      users,
      locations,
    },
    oldestClockEntry: oldest?.clockIn ?? null,
  });
}
