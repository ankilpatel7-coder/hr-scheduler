/**
 * ROUND 8b — render the weekly schedule on the dashboard.
 *
 * Inserted BEFORE the isStaff ternary so it appears for every role, which is
 * the point of the feature: staff should see team coverage too.
 *
 * Gated on the tenant flag, so with the setting off the dashboard renders
 * byte-for-byte as it does today.
 *
 * Idempotent. Aborts without writing if an anchor fails.
 */

const fs = require("fs");
const file = "src/app/[tenant]/dashboard/page.tsx";

if (!fs.existsSync(file)) {
  console.log(`  ! ${file} NOT FOUND — aborting`);
  process.exit(1);
}

let s = fs.readFileSync(file, "utf8");
const original = s;
let ok = 0;
let failed = 0;

function hunk(name, find, replace, marker) {
  if (marker && s.includes(marker)) {
    console.log(`  = ${name}: already applied`);
    return;
  }
  if (!s.includes(find)) {
    console.log(`  ! ${name}: ANCHOR NOT FOUND`);
    failed++;
    return;
  }
  s = s.replace(find, replace);
  console.log(`  + ${name}`);
  ok++;
}

// ---- 1. import the widget ----
hunk(
  "import DashboardWeekSchedule",
  `import KpiStrip from "@/components/kpi-strip";`,
  `import KpiStrip from "@/components/kpi-strip";
import DashboardWeekSchedule from "@/components/dashboard-week-schedule";`,
  `import DashboardWeekSchedule from "@/components/dashboard-week-schedule";`,
);

// ---- 2. accept the ?week= param ----
hunk(
  "accept week search param",
  `export default async function Dashboard({ searchParams }: { searchParams?: { rosterDate?: string; locationId?: string } }) {`,
  `export default async function Dashboard({ searchParams }: { searchParams?: { rosterDate?: string; locationId?: string; week?: string } }) {`,
  `week?: string }`,
);

// ---- 3. read the tenant flag alongside slug/timezone ----
hunk(
  "select showScheduleOnDashboard",
  `  const tenantInfo = tenantId ? await prisma.tenant.findUnique({ where: { id: tenantId }, select: { slug: true, timezone: true } }) : null;`,
  `  const tenantInfo = tenantId ? await prisma.tenant.findUnique({ where: { id: tenantId }, select: { slug: true, timezone: true, showScheduleOnDashboard: true } }) : null;`,
  `showScheduleOnDashboard: true }`,
);

// ---- 4. render above the role split so everyone sees it ----
hunk(
  "render the widget",
  `        {isStaff(role) ? (`,
  `        {tenantInfo?.showScheduleOnDashboard && (
          <div className="mb-6">
            <DashboardWeekSchedule
              tenantId={tenantId}
              tenantSlug={tenantSlug}
              timezone={tenantTimezone}
              week={searchParams?.week}
              locationId={searchParams?.locationId}
            />
          </div>
        )}

        {isStaff(role) ? (`,
  `<DashboardWeekSchedule`,
);

if (failed > 0) {
  console.log(`\n!! ${failed} hunk(s) failed — NOTHING written.`);
  process.exit(1);
}

if (s !== original) {
  fs.writeFileSync(file, s);
  console.log(`\n=== ${ok} hunk(s) applied ===`);
} else {
  console.log("\n=== no changes needed ===");
}
