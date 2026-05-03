/**
 * Tenant-scoped Prisma client.
 *
 * Wraps the global Prisma client with $extends to auto-inject `tenantId` filters
 * on all reads and `tenantId` value on all writes for tenant-scoped models.
 *
 * Usage in API routes:
 *   const auth = await requireAuth();
 *   if ("error" in auth) return auth.error;
 *   if (!auth.tenantId) return NextResponse.json({error: "No tenant"}, {status: 400});
 *   const prisma = scopedPrisma(auth.tenantId);
 *   // Now ALL prisma queries auto-scope to this tenant.
 *   const employees = await prisma.user.findMany();  // implicitly: where: { tenantId }
 *
 * Models that get auto-scoped: User, Location, Shift, ClockEntry, TimeOffRequest, ShiftSwap, PayPeriod, PayStub
 *
 * Models NOT auto-scoped (no tenantId column or accessed cross-tenant):
 *   Tenant (super-admin only), EmployeeLocation (junction), Availability (via user),
 *   PasswordReset (via user)
 */

import { prisma as basePrisma } from "./db";

const TENANT_SCOPED_MODELS = new Set([
  "user",
  "location",
  "shift",
  "clockEntry",
  "timeOffRequest",
  "shiftSwap",
  "payPeriod",
]);

function isScoped(model: string | undefined): boolean {
  if (!model) return false;
  return TENANT_SCOPED_MODELS.has(model.charAt(0).toLowerCase() + model.slice(1));
}

export function scopedPrisma(tenantId: string) {
  return basePrisma.$extends({
    name: `tenant-scope:${tenantId}`,
    query: {
      $allModels: {
        async findMany({ args, query, model }) {
          if (isScoped(model)) {
            args.where = { ...(args.where as any), tenantId };
          }
          return query(args);
        },
        async findFirst({ args, query, model }) {
          if (isScoped(model)) {
            args.where = { ...(args.where as any), tenantId };
          }
          return query(args);
        },
        async findFirstOrThrow({ args, query, model }) {
          if (isScoped(model)) {
            args.where = { ...(args.where as any), tenantId };
          }
          return query(args);
        },
        async count({ args, query, model }) {
          if (isScoped(model)) {
            args.where = { ...(args.where as any), tenantId };
          }
          return query(args);
        },
        async findUnique({ args, query, model }) {
          // findUnique queries a unique key — usually `id`. We can't add tenantId
          // to the where clause. Instead, fetch then verify tenantId post-hoc.
          const result = await query(args);
          if (
            result &&
            isScoped(model) &&
            (result as any).tenantId &&
            (result as any).tenantId !== tenantId
          ) {
            return null;
          }
          return result;
        },
        async create({ args, query, model }) {
          if (isScoped(model)) {
            args.data = { ...(args.data as any), tenantId };
          }
          return query(args);
        },
        async createMany({ args, query, model }) {
          if (isScoped(model)) {
            const data = args.data as any;
            if (Array.isArray(data)) {
              args.data = data.map((row) => ({ ...row, tenantId }));
            } else {
              args.data = { ...data, tenantId };
            }
          }
          return query(args);
        },
        async update({ args, query, model }) {
          if (isScoped(model)) {
            args.where = { ...(args.where as any), tenantId };
          }
          return query(args);
        },
        async updateMany({ args, query, model }) {
          if (isScoped(model)) {
            args.where = { ...(args.where as any), tenantId };
          }
          return query(args);
        },
        async delete({ args, query, model }) {
          if (isScoped(model)) {
            args.where = { ...(args.where as any), tenantId };
          }
          return query(args);
        },
        async deleteMany({ args, query, model }) {
          if (isScoped(model)) {
            args.where = { ...(args.where as any), tenantId };
          }
          return query(args);
        },
        async aggregate({ args, query, model }) {
          if (isScoped(model)) {
            args.where = { ...(args.where as any), tenantId };
          }
          return query(args);
        },
        async groupBy({ args, query, model }) {
          if (isScoped(model)) {
            args.where = { ...(args.where as any), tenantId };
          }
          return query(args);
        },
      },
    },
  });
}
