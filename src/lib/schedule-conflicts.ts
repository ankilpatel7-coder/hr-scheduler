/**
 * Schedule conflict detection.
 *
 * Severity tiers:
 *   - block: hard conflict; cannot be overridden. Same employee scheduled
 *            in overlapping shifts is the only "block" — it's a physical
 *            impossibility, not a policy decision.
 *   - warn:  policy violation, but admin/manager may have a good reason.
 *            Returned in success responses so UI can flag, but doesn't
 *            stop the mutation.
 *
 * House shifts (employeeId === null) bypass employee-specific checks
 * (nothing to overlap with).
 */

import { prisma } from "@/lib/db";
import { startOfWeek, endOfWeek, format } from "date-fns";

export type ConflictType = "overlap" | "unavailable" | "time_off" | "overtime";
export type ConflictSeverity = "block" | "warn";

export type ShiftConflict = {
  type: ConflictType;
  severity: ConflictSeverity;
  message: string;
  meta?: Record<string, unknown>;
};

export type ConflictDetectionInput = {
  tenantId: string;
  employeeId: string | null;
  startTime: Date;
  endTime: Date;
  /** When editing, exclude the shift being edited from overlap checks. */
  excludeShiftId?: string;
};

function fmtMinsOfDay(mins: number): string {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  const ampm = h < 12 ? "am" : "pm";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")}${ampm}`;
}

export async function detectShiftConflicts(
  input: ConflictDetectionInput,
): Promise<ShiftConflict[]> {
  const conflicts: ShiftConflict[] = [];

  // House shifts have no employee — nothing to check.
  if (!input.employeeId) return conflicts;

  // ─── 1. Direct shift overlap (HARD BLOCK) ───────────────────────────────
  const overlap = await prisma.shift.findFirst({
    where: {
      tenantId: input.tenantId,
      employeeId: input.employeeId,
      // Overlap formula: existing.start < new.end AND existing.end > new.start
      startTime: { lt: input.endTime },
      endTime: { gt: input.startTime },
      ...(input.excludeShiftId ? { id: { not: input.excludeShiftId } } : {}),
    },
    select: { id: true, startTime: true, endTime: true },
  });
  if (overlap) {
    conflicts.push({
      type: "overlap",
      severity: "block",
      message: `Overlaps existing shift ${format(overlap.startTime, "EEE h:mma")} – ${format(overlap.endTime, "h:mma")}`,
      meta: { shiftId: overlap.id },
    });
  }

  // ─── 2. Employee marked unavailable (WARN) ──────────────────────────────
  // Availability uses 0=Sun ... 6=Sat (JS Date.getDay()).
  const dayOfWeek = input.startTime.getDay();
  const startMin = input.startTime.getHours() * 60 + input.startTime.getMinutes();
  const endMin = input.endTime.getHours() * 60 + input.endTime.getMinutes();

  // If shift crosses midnight, splitting is needed. v1: check the day the
  // shift starts; overnight shifts get partial coverage.
  const unav = await prisma.availability.findFirst({
    where: {
      userId: input.employeeId,
      dayOfWeek,
      available: false,
      startMinute: { lt: endMin },
      endMinute: { gt: startMin },
    },
  });
  if (unav) {
    conflicts.push({
      type: "unavailable",
      severity: "warn",
      message: `Marked unavailable ${fmtMinsOfDay(unav.startMinute)}–${fmtMinsOfDay(unav.endMinute)} on this day`,
    });
  }

  // ─── 3. Approved time-off (WARN) ────────────────────────────────────────
  const tof = await prisma.timeOffRequest.findFirst({
    where: {
      tenantId: input.tenantId,
      userId: input.employeeId,
      status: "APPROVED",
      startDate: { lte: input.endTime },
      endDate: { gte: input.startTime },
    },
    select: { id: true, startDate: true, endDate: true, reason: true },
  });
  if (tof) {
    const reasonSuffix = tof.reason ? `: ${tof.reason}` : "";
    conflicts.push({
      type: "time_off",
      severity: "warn",
      message: `On approved time-off ${format(tof.startDate, "MMM d")}–${format(tof.endDate, "MMM d")}${reasonSuffix}`,
      meta: { timeOffId: tof.id },
    });
  }

  // ─── 4. Over 40 hours this workweek (WARN) ──────────────────────────────
  // FLSA defines workweek as Sun 00:00 → Sat 23:59. Sum existing shifts in
  // the same week (excluding the one being edited if any) and check whether
  // this shift would push the total to/over 40.
  const weekStart = startOfWeek(input.startTime, { weekStartsOn: 0 });
  const weekEnd = endOfWeek(input.startTime, { weekStartsOn: 0 });
  const sameWeek = await prisma.shift.findMany({
    where: {
      tenantId: input.tenantId,
      employeeId: input.employeeId,
      startTime: { gte: weekStart, lte: weekEnd },
      ...(input.excludeShiftId ? { id: { not: input.excludeShiftId } } : {}),
    },
    select: { startTime: true, endTime: true },
  });
  const existingHrs = sameWeek.reduce(
    (sum, s) => sum + (s.endTime.getTime() - s.startTime.getTime()) / 3_600_000,
    0,
  );
  const newHrs = (input.endTime.getTime() - input.startTime.getTime()) / 3_600_000;
  const totalHrs = existingHrs + newHrs;
  if (totalHrs > 40) {
    const otHrs = totalHrs - 40;
    conflicts.push({
      type: "overtime",
      severity: "warn",
      message: `Total this week would be ${totalHrs.toFixed(1)} hrs — ${otHrs.toFixed(1)} hrs over 40 triggers OT pay`,
      meta: { totalHrs, overtimeHrs: otHrs },
    });
  } else if (totalHrs === 40) {
    conflicts.push({
      type: "overtime",
      severity: "warn",
      message: `Total this week would hit exactly 40 hrs — any additional minute triggers OT`,
      meta: { totalHrs },
    });
  }

  return conflicts;
}

/** Convenience: returns the first BLOCKing conflict, or null. */
export function firstBlock(conflicts: ShiftConflict[]): ShiftConflict | null {
  return conflicts.find((c) => c.severity === "block") ?? null;
}
