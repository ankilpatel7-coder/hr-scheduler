import { NextResponse } from "next/server";
import { getServerAuth } from "./auth";
import { prisma } from "./db";

export type AppRole = "ADMIN" | "MANAGER" | "LEAD" | "EMPLOYEE";

/**
 * For permission checks, LEAD and EMPLOYEE are equivalent.
 * Use this helper to normalize the role for permission decisions.
 */
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
 * Returns the location IDs the user is allowed to operate on.
 * - ADMIN: returns null (means "no restriction — all locations")
 * - MANAGER: returns array of location IDs the manager is assigned to via EmployeeLocation
 * - LEAD/EMPLOYEE: returns array of location IDs they're assigned to
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
 * Returns the user IDs that a manager is allowed to see/manage.
 * - ADMIN: returns null (no restriction)
 * - MANAGER: returns array of user IDs who share at least one location with the manager
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
