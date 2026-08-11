/**
 * ROUND 8c — pass the viewer's identity into the week schedule widget so it
 * can scope by location.
 *
 * Without this the widget showed every shift in the tenant to every viewer —
 * an employee at one location could see other locations' schedules.
 *
 * Idempotent. Aborts without writing if the anchor fails.
 */

const fs = require("fs");
const file = "src/app/[tenant]/dashboard/page.tsx";

if (!fs.existsSync(file)) {
  console.log(`  ! ${file} NOT FOUND — aborting`);
  process.exit(1);
}

let s = fs.readFileSync(file, "utf8");

if (s.includes("viewerId={userId}")) {
  console.log("  = viewer props already passed");
  process.exit(0);
}

const anchor = `            <DashboardWeekSchedule
              tenantId={tenantId}
              tenantSlug={tenantSlug}
              timezone={tenantTimezone}
              week={searchParams?.week}
              locationId={searchParams?.locationId}
            />`;

const replacement = `            <DashboardWeekSchedule
              tenantId={tenantId}
              tenantSlug={tenantSlug}
              timezone={tenantTimezone}
              viewerId={userId}
              viewerRole={role}
              week={searchParams?.week}
              locationId={searchParams?.locationId}
            />`;

if (!s.includes(anchor)) {
  console.log("  ! ANCHOR NOT FOUND — aborting, nothing changed");
  process.exit(1);
}

s = s.replace(anchor, replacement);
fs.writeFileSync(file, s);
console.log("  + viewerId / viewerRole passed to DashboardWeekSchedule");
console.log("\n=== 1 change ===");
