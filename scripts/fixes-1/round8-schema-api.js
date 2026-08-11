/**
 * ROUND 8a — tenant setting: show the weekly schedule on the dashboard.
 *
 *   Tenant.showScheduleOnDashboard Boolean @default(false)
 *
 * Defaults to false, so nothing changes until an admin turns it on.
 * Also wires the field through the settings API (GET select + PATCH schema).
 *
 * Idempotent. Aborts without writing if an anchor fails.
 */

const fs = require("fs");

let ok = 0;
let failed = 0;
const pending = new Map();

function stage(file, name, find, replace, marker) {
  if (!fs.existsSync(file)) {
    console.log(`  ! ${file}: NOT FOUND`);
    failed++;
    return;
  }
  let s = pending.has(file) ? pending.get(file) : fs.readFileSync(file, "utf8");
  if (marker && s.includes(marker)) {
    console.log(`  = ${name}: already applied`);
    pending.set(file, s);
    return;
  }
  if (!s.includes(find)) {
    console.log(`  ! ${name}: ANCHOR NOT FOUND`);
    failed++;
    return;
  }
  pending.set(file, s.replace(find, replace));
  console.log(`  + ${name}`);
  ok++;
}

// ---- schema ----
console.log("== prisma/schema.prisma ==");
stage(
  "prisma/schema.prisma",
  "Tenant.showScheduleOnDashboard",
  `  // When true (default), employees must take a selfie when starting a break.
  requireBreakSelfie   Boolean @default(true)`,
  `  // When true (default), employees must take a selfie when starting a break.
  requireBreakSelfie   Boolean @default(true)
  // When true, the dashboard shows a read-only weekly schedule grid to
  // everyone (including employees) so the team can see coverage at a glance.
  showScheduleOnDashboard Boolean @default(false)`,
  `showScheduleOnDashboard`,
);

// ---- settings API ----
console.log("\n== /api/tenant/settings ==");
const api = "src/app/api/tenant/settings/route.ts";

stage(
  api,
  "PATCH schema accepts the flag",
  `  enableHouseShifts: z.boolean().optional(),
  requireBreakSelfie: z.boolean().optional(),
});`,
  `  enableHouseShifts: z.boolean().optional(),
  requireBreakSelfie: z.boolean().optional(),
  showScheduleOnDashboard: z.boolean().optional(),
});`,
  `showScheduleOnDashboard: z.boolean().optional(),`,
);

stage(
  api,
  "GET returns the flag",
  `      requireClockApproval: true,
      enableHouseShifts: true,
      requireBreakSelfie: true,
      businessName: true,`,
  `      requireClockApproval: true,
      enableHouseShifts: true,
      requireBreakSelfie: true,
      showScheduleOnDashboard: true,
      businessName: true,`,
  `      showScheduleOnDashboard: true,\n      businessName: true,`,
);

if (failed > 0) {
  console.log(`\n!! ${failed} hunk(s) failed — NOTHING written.`);
  process.exit(1);
}
for (const [f, c] of pending) fs.writeFileSync(f, c);
console.log(`\n=== ${ok} hunk(s) across ${pending.size} file(s) ===`);
console.log("Next: npx prisma format && npx prisma db push && npx prisma generate");
