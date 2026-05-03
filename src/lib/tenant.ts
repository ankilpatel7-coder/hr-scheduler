/**
 * Tenant context helpers.
 *
 * The middleware sets `x-tenant-slug` header on tenant-scoped requests.
 * These helpers resolve that to a Tenant record, with permission checks.
 *
 * Usage in API route:
 *   const ctx = await requireTenantContext();
 *   if ("error" in ctx) return ctx.error;
 *   const { tenant, userId, role, isSuperAdmin } = ctx;
 *   // All Prisma queries should now be scoped: where: { tenantId: tenant.id, ... }
 *
 * Usage in page (server component):
 *   const tenant = await getTenantOr404();
 *   // tenant is guaranteed non-null here
 */

import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { notFound } from "next/navigation";
import { prisma } from "./db";
import { getServerAuth } from "./auth";

export type Tenant = NonNullable<Awaited<ReturnType<typeof prisma.tenant.findUnique>>>;

/** Read the tenant slug from the middleware-injected header. */
export function getTenantSlugFromHeaders(): string | null {
  const h = headers();
  return h.get("x-tenant-slug");
}

/** Look up a tenant by slug. Returns null if not found or inactive. */
export async function getTenantBySlug(slug: string): Promise<Tenant | null> {
  if (!slug) return null;
  const t = await prisma.tenant.findUnique({ where: { slug } });
  if (!t || !t.active) return null;
  return t;
}

/**
 * Server-component helper: get the current tenant or 404 the page.
 * Use in src/app/[tenant]/.../page.tsx server components.
 */
export async function getTenantOr404(): Promise<Tenant> {
  const slug = getTenantSlugFromHeaders();
  if (!slug) notFound();
  const t = await getTenantBySlug(slug);
  if (!t) notFound();
  return t;
}

/**
 * API route helper: resolve tenant context with auth + permission check.
 *
 * Returns either { error: NextResponse } (401/403/404) or a context bag.
 *
 * Permission rules:
 *   - Request must be authenticated.
 *   - User must belong to the tenant (user.tenantId === tenant.id), OR
 *   - User must be a super-admin (superAdmin === true).
 */
export async function requireTenantContext() {
  const session = await getServerAuth();
  if (!session) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const userId = (session.user as any).id as string;
  const role = (session.user as any).role as string;
  const sessionTenantId = (session.user as any).tenantId as string | null;
  const isSuperAdmin = (session.user as any).superAdmin === true;

  const slug = getTenantSlugFromHeaders();

  // No tenant slug in URL — fall back to user's session tenant.
  // (Legacy routes that haven't been moved under /[tenant]/ yet.)
  if (!slug) {
    if (!sessionTenantId) {
      return { error: NextResponse.json({ error: "No tenant context" }, { status: 400 }) };
    }
    const t = await prisma.tenant.findUnique({ where: { id: sessionTenantId } });
    if (!t || !t.active) {
      return { error: NextResponse.json({ error: "Tenant not found" }, { status: 404 }) };
    }
    return { tenant: t, userId, role, isSuperAdmin, session };
  }

  const tenant = await getTenantBySlug(slug);
  if (!tenant) {
    return { error: NextResponse.json({ error: "Tenant not found" }, { status: 404 }) };
  }

  // Super-admins bypass tenant membership check.
  if (isSuperAdmin) {
    return { tenant, userId, role, isSuperAdmin, session };
  }

  // Regular users must belong to this tenant.
  if (sessionTenantId !== tenant.id) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { tenant, userId, role, isSuperAdmin, session };
}

/**
 * API route helper: super-admin only. No tenant context needed.
 * Used for /api/superadmin/* routes.
 */
export async function requireSuperAdmin() {
  const session = await getServerAuth();
  if (!session) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const isSuperAdmin = (session.user as any).superAdmin === true;
  if (!isSuperAdmin) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return {
    userId: (session.user as any).id as string,
    session,
  };
}
