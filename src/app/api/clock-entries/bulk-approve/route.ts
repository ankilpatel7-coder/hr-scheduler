/**
 * Bulk approve clock entries by date range and optional employee filter.
 *
 * POST /api/clock-entries/bulk-approve
 *   Body:
 *     {
 *       from?: ISO date,        // default: 30 days ago
 *       to?: ISO date,          // default: now
 *       employeeIds?: string[], // optional filter
 *       onlyPending?: boolean,  // default true — don't touch already-approved
 *       action?: "approve" | "reject" | "reset", // default "approve"
 *       note?: string,
 *     }
 *
 *   Returns { updated: number, action }.
 *
 *   Manager scope: limited to managed employees. Admin: tenant-wide.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole, getScopedEmployeeIds } from "@/lib/guards";

const bodySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  employeeIds: z.array(z.string()).optional(),
  onlyPending: z.boolean().optional().default(true),
  action: z.enum(["approve", "reject", "reset"]).optional().default("approve"),
  note: z.string().max(500).nullable().optional(),
});

export async function POST(req: Request) {
  const auth = await requireRole(["ADMIN", "MANAGER"]);
  if ("error" in auth) return auth.error;
  if (auth.isSuperAdmin || !auth.tenantId) {
    return NextResponse.json({ error: "No tenant context" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const { from, to, employeeIds, onlyPending, action, note } = parsed.data;

  const fromDate = from ? new Date(from) : new Date(Date.now() - 30 * 86400000);
  const toDate = to ? new Date(to) : new Date();

  let userIdFilter: { in: string[] } | undefined;
  if (auth.role === "MANAGER") {
    const scoped = await getScopedEmployeeIds(auth.userId, "MANAGER");
    const allowed = scoped ?? [];
    const filtered = employeeIds && employeeIds.length > 0
      ? employeeIds.filter((id) => allowed.includes(id))
      : allowed;
    userIdFilter = { in: filtered.length > 0 ? filtered : ["__none__"] };
  } else if (employeeIds && employeeIds.length > 0) {
    userIdFilter = { in: employeeIds };
  }

  const where: any = {
    tenantId: auth.tenantId,
    clockIn: { gte: fromDate, lte: toDate },
  };
  if (userIdFilter) where.userId = userIdFilter;
  if (onlyPending !== false) where.approvalStatus = "PENDING";

  const nextStatus =
    action === "approve" ? "APPROVED" : action === "reject" ? "REJECTED" : "PENDING";

  const data: any =
    action === "reset"
      ? {
          approvalStatus: "PENDING",
          approvedById: null,
          approvedAt: null,
          approvalNote: null,
        }
      : {
          approvalStatus: nextStatus,
          approvedById: auth.userId,
          approvedAt: new Date(),
          approvalNote: note ?? null,
        };

  const result = await prisma.clockEntry.updateMany({ where, data });

  return NextResponse.json({ updated: result.count, action });
}
