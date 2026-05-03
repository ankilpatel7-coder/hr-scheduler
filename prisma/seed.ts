/**
 * v12 seed script.
 *
 * In v11 this created a default "Main Location" if none existed. In v12 with
 * multi-tenancy, locations are tenant-scoped — there's no single "default"
 * location to create globally. Tenants are created via /_admin/tenants/new
 * (which creates the tenant + initial admin), and the admin then adds locations
 * via Settings → Locations.
 *
 * Initial production data is created by scripts/migrate-to-v12.ts, not here.
 *
 * This file remains as a no-op so the build pipeline keeps working. Safe to
 * delete entirely if you don't run `prisma db seed` ever.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const tenantCount = await prisma.tenant.count();
  console.log(`Seed: ${tenantCount} tenant(s) in DB.`);
  if (tenantCount === 0) {
    console.log(
      "No tenants yet. Use the super-admin console at /_admin/tenants/new to create your first tenant, " +
      "or run scripts/migrate-to-v12.ts if you're migrating from v11."
    );
  } else {
    console.log("Tenants already exist; nothing to seed.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
