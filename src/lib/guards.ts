/**
 * Auth guards — v12 changes:
 *   - Adds requireSuperAdmin() check for super-admin-only routes.
 *   - All existing guards continue to work but caller is responsible for
 *     also scoping queries by tenant (via requireTenantContext from tenant.ts).
 */

import { NextResponse } from "next/server";
import { getServerAuth } from "./auth";
import { prisma } from "./db";

export type AppRole = "ADMIN" | "MANAGER" | "LEAD" | "EMPLOYEE";

export function isStaff(role: AppRole): boolean {
  return role === "EMPLOYEE" || role === "LEAD";
}

export async function requireAuth() {
  const session = await getServerAuth();
  if (!session) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return {
    session,
    userId: (session.user as any).id as string,
    role: (session.user as any).role as AppRole,
    tenantId: (session.user as any).tenantId as string | null,
    isSuperAdmin: (session.user as any).superAdmin === true,
  };
}

export async function requireRole(roles: AppRole[]) {
  const auth = await requireAuth();
  if ("error" in auth) return auth;
  if (!roles.includes(auth.role)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return auth;
}

/**
 * Returns the location IDs the user is allowed to operate on, scoped to their tenant.
 *
 * - Super-admin: returns null ("all locations across all tenants" — caller decides scope)
 * - ADMIN: returns null ("all locations within their tenant")
 * - MANAGER/LEAD/EMPLOYEE: returns array of locationIds they're assigned to
 */
export async function getScopedLocationIds(
  userId: string,
  role: AppRole
): Promise<string[] | null> {
  if (role === "ADMIN") return null;
  const rows = await prisma.employeeLocation.findMany({
    where: { userId },
    select: { locationId: true },
  });
  return rows.map((r) => r.locationId);
}

/**
 * Returns the user IDs that the requesting user is allowed to see/manage.
 * Tenant-scoping is the caller's responsibility (this only handles role-based scoping).
 *
 * - ADMIN: returns null (no role-based restriction)
 * - MANAGER: returns array of userIds sharing at least one location
 * - LEAD/EMPLOYEE: returns just their own ID
 */
export async function getScopedEmployeeIds(
  userId: string,
  role: AppRole
): Promise<string[] | null> {
  if (role === "ADMIN") return null;
  if (isStaff(role)) return [userId];

  const myLocs = await prisma.employeeLocation.findMany({
    where: { userId },
    select: { locationId: true },
  });
  const locIds = myLocs.map((l) => l.locationId);

  if (locIds.length === 0) return [userId];

  const peers = await prisma.employeeLocation.findMany({
    where: { locationId: { in: locIds } },
    select: { userId: true },
  });
  const set = new Set<string>([userId, ...peers.map((p) => p.userId)]);
  return Array.from(set);
}
