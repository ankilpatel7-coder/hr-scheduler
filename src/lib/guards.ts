import { NextResponse } from "next/server";
import { getServerAuth } from "./auth";

export async function requireAuth() {
  const session = await getServerAuth();
  if (!session) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return {
    session,
    userId: (session.user as any).id as string,
    role: (session.user as any).role as "ADMIN" | "MANAGER" | "EMPLOYEE",
  };
}

export async function requireRole(roles: Array<"ADMIN" | "MANAGER" | "EMPLOYEE">) {
  const auth = await requireAuth();
  if ("error" in auth) return auth;
  if (!roles.includes(auth.role)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return auth;
}
