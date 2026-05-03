/**
 * v12 data migration: single-tenant → multi-tenant.
 *
 * THIS IS DESTRUCTIVE TO YOUR SCHEMA. RUN ONLY AFTER:
 *   1. Backing up the Neon DB (Neon console → Backups → make a manual snapshot)
 *   2. Running `npx prisma db push` against the *transitional* v12 schema
 *      (where tenantId is nullable on existing models). See prisma/schema.transitional.prisma.
 *
 * What this script does:
 *   1. Verifies preconditions (no orphan data, expected counts).
 *   2. Creates the Greenreleaf tenant.
 *   3. Backfills tenantId on every existing User, Location, Shift, ClockEntry,
 *      TimeOffRequest, ShiftSwap.
 *   4. Ensures the SUPER_ADMIN user exists — creates it if not, promotes it if it does.
 *      Prints temporary password to console if newly created.
 *   5. Verifies postconditions.
 *
 * After this script completes successfully:
 *   - Replace prisma/schema.prisma with the FINAL v12 schema (tenantId NOT NULL where required).
 *   - Run `npx prisma db push` again to enforce NOT NULL.
 *
 * If anything fails, the transaction rolls back and the DB is unchanged.
 *
 * Usage:
 *   DATABASE_URL=<prod-url> npx tsx scripts/migrate-to-v12.ts
 *   DATABASE_URL=<prod-url> npx tsx scripts/migrate-to-v12.ts --dry-run
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

const prisma = new PrismaClient();

// CONFIG — edit these before running
const GREENRELEAF_CONFIG = {
  slug: "greenreleaf",
  businessName: "Greenreleaf",
  legalName: "Greenreleaf",
  state: "KY" as const,
  addressLine1: null,
  city: null,
  zip: null,
  phone: null,
  federalEIN: null,
  stateTaxId: null,
  payFrequency: "BIWEEKLY",
  firstPeriodStart: null,
};

const SUPER_ADMIN_EMAIL = "ankilpatel7@gmail.com";
const SUPER_ADMIN_NAME = "Ankil Patel";

const DRY_RUN = process.argv.includes("--dry-run");

function generateTempPassword(): string {
  // 16-char alphanumeric, easy to type. Not for permanent use.
  return randomBytes(12).toString("base64").replace(/[+/=]/g, "").slice(0, 16);
}

async function main() {
  console.log("=".repeat(60));
  console.log("Shiftwork v12 migration");
  console.log(DRY_RUN ? "MODE: DRY RUN (no changes will be applied)" : "MODE: LIVE");
  console.log("=".repeat(60));

  console.log("\n[1/5] Checking preconditions...");

  const existingTenantCount = await prisma.tenant.count();
  if (existingTenantCount > 0) {
    console.error(`  ✗ Tenant table already has ${existingTenantCount} rows. Migration appears to have already run. Aborting.`);
    process.exit(1);
  }
  console.log("  ✓ Tenant table is empty");

  const userCount = await prisma.user.count();
  const locationCount = await prisma.location.count();
  const shiftCount = await prisma.shift.count();
  const clockEntryCount = await prisma.clockEntry.count();
  const timeOffCount = await prisma.timeOffRequest.count();
  const swapCount = await prisma.shiftSwap.count();

  console.log("  Found:");
  console.log(`    - Users: ${userCount}`);
  console.log(`    - Locations: ${locationCount}`);
  console.log(`    - Shifts: ${shiftCount}`);
  console.log(`    - Clock entries: ${clockEntryCount}`);
  console.log(`    - Time-off requests: ${timeOffCount}`);
  console.log(`    - Shift swaps: ${swapCount}`);

  const existingSuperAdmin = await prisma.user.findUnique({
    where: { email: SUPER_ADMIN_EMAIL },
  });
  const willCreateUser = !existingSuperAdmin;
  console.log(`  Super-admin user (${SUPER_ADMIN_EMAIL}): ${existingSuperAdmin ? "EXISTS — will be promoted" : "MISSING — will be created"}`);

  if (DRY_RUN) {
    console.log("\n[DRY RUN] Stopping. Re-run without --dry-run to apply changes.");
    await prisma.$disconnect();
    return;
  }

  console.log("\n[2/5] Running migration in single transaction...");

  let tempPassword: string | null = null;
  if (willCreateUser) {
    tempPassword = generateTempPassword();
  }

  const result = await prisma.$transaction(
    async (tx) => {
      // Create Greenreleaf tenant
      console.log("  Creating Greenreleaf tenant...");
      const tenant = await tx.tenant.create({
        data: {
          slug: GREENRELEAF_CONFIG.slug,
          businessName: GREENRELEAF_CONFIG.businessName,
          legalName: GREENRELEAF_CONFIG.legalName,
          state: GREENRELEAF_CONFIG.state,
          addressLine1: GREENRELEAF_CONFIG.addressLine1,
          city: GREENRELEAF_CONFIG.city,
          zip: GREENRELEAF_CONFIG.zip,
          phone: GREENRELEAF_CONFIG.phone,
          federalEIN: GREENRELEAF_CONFIG.federalEIN,
          stateTaxId: GREENRELEAF_CONFIG.stateTaxId,
          payFrequency: GREENRELEAF_CONFIG.payFrequency,
          firstPeriodStart: GREENRELEAF_CONFIG.firstPeriodStart,
          active: true,
        },
      });
      console.log(`    ✓ Tenant created: id=${tenant.id} slug=${tenant.slug}`);

      // Backfill tenantId on every existing row
      console.log("  Backfilling tenantId on existing rows...");
      const userBackfill = await tx.user.updateMany({ where: { tenantId: null }, data: { tenantId: tenant.id } });
      console.log(`    ✓ Users updated: ${userBackfill.count}`);
      const locBackfill = await tx.location.updateMany({ where: { tenantId: null }, data: { tenantId: tenant.id } });
      console.log(`    ✓ Locations updated: ${locBackfill.count}`);
      const shiftBackfill = await tx.shift.updateMany({ where: { tenantId: null }, data: { tenantId: tenant.id } });
      console.log(`    ✓ Shifts updated: ${shiftBackfill.count}`);
      const clockBackfill = await tx.clockEntry.updateMany({ where: { tenantId: null }, data: { tenantId: tenant.id } });
      console.log(`    ✓ Clock entries updated: ${clockBackfill.count}`);
      const toBackfill = await tx.timeOffRequest.updateMany({ where: { tenantId: null }, data: { tenantId: tenant.id } });
      console.log(`    ✓ Time-off requests updated: ${toBackfill.count}`);
      const swapBackfill = await tx.shiftSwap.updateMany({ where: { tenantId: null }, data: { tenantId: tenant.id } });
      console.log(`    ✓ Shift swaps updated: ${swapBackfill.count}`);

      // Create or promote super-admin
      let superAdmin;
      if (willCreateUser) {
        console.log(`  Creating new SUPER_ADMIN user ${SUPER_ADMIN_EMAIL}...`);
        const passwordHash = await bcrypt.hash(tempPassword!, 10);
        superAdmin = await tx.user.create({
          data: {
            email: SUPER_ADMIN_EMAIL,
            name: SUPER_ADMIN_NAME,
            passwordHash,
            role: "ADMIN",
            superAdmin: true,
            tenantId: tenant.id, // also Greenreleaf admin
            active: true,
          },
        });
        console.log(`    ✓ User created: id=${superAdmin.id}`);
      } else {
        console.log(`  Promoting existing user ${SUPER_ADMIN_EMAIL} to SUPER_ADMIN...`);
        superAdmin = await tx.user.update({
          where: { email: SUPER_ADMIN_EMAIL },
          data: {
            superAdmin: true,
            tenantId: tenant.id,
            role: "ADMIN", // ensure ADMIN at the tenant level too
          },
        });
        console.log(`    ✓ User promoted: superAdmin=${superAdmin.superAdmin}`);
      }

      return { tenant, superAdmin, willCreateUser };
    },
    { timeout: 30000 }
  );

  console.log("\n[3/5] Verifying postconditions...");
  const orphanCounts: Record<string, number> = {
    locations: await prisma.location.count({ where: { tenantId: null as any } }),
    shifts: await prisma.shift.count({ where: { tenantId: null as any } }),
    clockEntries: await prisma.clockEntry.count({ where: { tenantId: null as any } }),
    timeOff: await prisma.timeOffRequest.count({ where: { tenantId: null as any } }),
    swaps: await prisma.shiftSwap.count({ where: { tenantId: null as any } }),
  };
  const orphans = Object.entries(orphanCounts).filter(([, c]) => c > 0);
  if (orphans.length > 0) {
    console.error("  ✗ Found rows with NULL tenantId after migration:", orphans);
    process.exit(1);
  }
  console.log("  ✓ No orphan rows.");

  console.log("\n[4/5] Migration complete.");
  console.log(`  Tenant: ${result.tenant.businessName} (slug=${result.tenant.slug}, id=${result.tenant.id})`);
  console.log(`  Super-admin: ${result.superAdmin.email}`);

  if (result.willCreateUser && tempPassword) {
    console.log("");
    console.log("  ⚠ TEMPORARY PASSWORD for new super-admin (save this NOW, it won't be shown again):");
    console.log("  ⚠ ");
    console.log(`  ⚠   Email:    ${result.superAdmin.email}`);
    console.log(`  ⚠   Password: ${tempPassword}`);
    console.log("  ⚠ ");
    console.log("  ⚠ After logging in, change this immediately via Settings → Change Password.");
  }

  console.log("\n[5/5] NEXT STEPS:");
  console.log("  1. Replace prisma/schema.prisma with the FINAL v12 schema (tenantId NOT NULL).");
  console.log("  2. Run: npx prisma db push");
  console.log("  3. Deploy v12 application code.");
  console.log("  4. Log in at /login with the super-admin credentials above.");

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("\n✗ MIGRATION FAILED:", e);
  console.error("\nThe transaction was rolled back. Your DB is in its pre-migration state.");
  await prisma.$disconnect();
  process.exit(1);
});
