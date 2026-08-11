/**
 * ROUND 4 — dashboard scoping + tenant-isolation fixes.
 *
 * TWO classes of bug found in the dashboard counts:
 *
 *   A. CROSS-TENANT LEAK (serious). Three counts had no tenantId filter at
 *      all, so they counted rows across EVERY tenant in the database:
 *        totalEmployees : prisma.user.count({ where: { active: true } })
 *        todayShifts    : prisma.shift.count({ where: { startTime ... } })
 *        draftShifts    : prisma.shift.count({ where: { published: false ...
 *
 *   B. NO MANAGER SCOPING. Counts were tenant-wide, so a location manager
 *      saw totals covering locations they don't manage — while the detail
 *      pages they click through to correctly show only their scope.
 *
 * Fix: compute scopedIds once via getScopedEmployeeIds (null => ADMIN, no
 * restriction; array => that manager's people), then apply BOTH tenantId and
 * the scope to every count.
 *
 * ShiftSwap is deliberately left alone this round — its relation shape wasn't
 * verified. It does already have a tenantId filter, so no leak there.
 *
 * Idempotent. Aborts without writing if any anchor fails.
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

// ---- 1. import getScopedEmployeeIds ----
hunk(
  "import getScopedEmployeeIds",
  `import { isStaff } from "@/lib/guards";`,
  `import { isStaff, getScopedEmployeeIds } from "@/lib/guards";`,
  `import { isStaff, getScopedEmployeeIds }`,
);

// ---- 2. compute scope once, before the counts ----
hunk(
  "compute scopedIds + where helpers",
  `  const openEntry =
    isStaff(role)
      ? await prisma.clockEntry.findFirst({ where: { userId, clockOut: null } })
      : null;`,
  `  // Manager scoping. getScopedEmployeeIds returns null for ADMIN (see
  // everything in the tenant) or the list of user ids a MANAGER oversees.
  // Every count below applies BOTH tenantId and this scope so the dashboard
  // numbers match what the detail pages actually show.
  const scopedIds = await getScopedEmployeeIds(userId, role);
  const scopeByUserId = scopedIds ? { userId: { in: scopedIds } } : {};
  const scopeByEmployeeId = scopedIds ? { employeeId: { in: scopedIds } } : {};
  const scopeById = scopedIds ? { id: { in: scopedIds } } : {};

  const openEntry =
    isStaff(role)
      ? await prisma.clockEntry.findFirst({ where: { userId, clockOut: null } })
      : null;`,
  `const scopedIds = await getScopedEmployeeIds(userId, role);`,
);

// ---- 3. totalEmployees: add tenantId (was leaking across tenants) + scope ----
hunk(
  "totalEmployees: tenant filter + scope",
  `  const totalEmployees =
    !isStaff(role)
      ? await prisma.user.count({ where: { active: true } })
      : 0;`,
  `  const totalEmployees =
    !isStaff(role)
      ? await prisma.user.count({
          where: { tenantId, active: true, archivedAt: null, ...scopeById },
        })
      : 0;`,
  `where: { tenantId, active: true, archivedAt: null, ...scopeById }`,
);

// ---- 4. todayShifts: add tenantId (was leaking) + scope ----
hunk(
  "todayShifts: tenant filter + scope",
  `  const todayShifts =
    !isStaff(role)
      ? await prisma.shift.count({
          where: { startTime: { gte: startOfDay, lt: endOfDay } },
        })
      : 0;`,
  `  const todayShifts =
    !isStaff(role)
      ? await prisma.shift.count({
          where: {
            tenantId,
            startTime: { gte: startOfDay, lt: endOfDay },
            ...scopeByEmployeeId,
          },
        })
      : 0;`,
  `startTime: { gte: startOfDay, lt: endOfDay },\n            ...scopeByEmployeeId,`,
);

// ---- 5. currentlyClockedIn: scope ----
hunk(
  "currentlyClockedIn: scope",
  `  const currentlyClockedIn =
    !isStaff(role)
      ? await prisma.clockEntry.count({ where: { tenantId, clockOut: null } })
      : 0;`,
  `  const currentlyClockedIn =
    !isStaff(role)
      ? await prisma.clockEntry.count({
          where: { tenantId, clockOut: null, ...scopeByUserId },
        })
      : 0;`,
  `where: { tenantId, clockOut: null, ...scopeByUserId }`,
);

// ---- 6. pendingTimeOff: scope (the reported bug) ----
hunk(
  "pendingTimeOff: scope",
  `  const pendingTimeOff =
    !isStaff(role)
      ? await prisma.timeOffRequest.count({ where: { tenantId, status: "PENDING" } })
      : 0;`,
  `  const pendingTimeOff =
    !isStaff(role)
      ? await prisma.timeOffRequest.count({
          where: { tenantId, status: "PENDING", ...scopeByUserId },
        })
      : 0;`,
  `where: { tenantId, status: "PENDING", ...scopeByUserId }`,
);

// ---- 7. draftShifts: add tenantId (was leaking) + scope ----
hunk(
  "draftShifts: tenant filter + scope",
  `  const draftShifts =
    !isStaff(role)
      ? await prisma.shift.count({
          where: { published: false, startTime: { gte: startOfDay } },
        })
      : 0;`,
  `  const draftShifts =
    !isStaff(role)
      ? await prisma.shift.count({
          where: {
            tenantId,
            published: false,
            startTime: { gte: startOfDay },
            ...scopeByEmployeeId,
          },
        })
      : 0;`,
  `published: false,\n            startTime: { gte: startOfDay },\n            ...scopeByEmployeeId,`,
);

// ---- 8. OT / labor cost block: scope ----
hunk(
  "OT week entries: scope",
  `    const entries = await prisma.clockEntry.findMany({
      where: { tenantId, clockIn: { gte: weekStart, lt: weekEnd } },
      include: { user: { select: { hourlyWage: true } } },
    });`,
  `    const entries = await prisma.clockEntry.findMany({
      where: {
        tenantId,
        clockIn: { gte: weekStart, lt: weekEnd },
        ...scopeByUserId,
      },
      include: { user: { select: { hourlyWage: true } } },
    });`,
  `clockIn: { gte: weekStart, lt: weekEnd },\n        ...scopeByUserId,`,
);

hunk(
  "OT scheduled shifts: scope",
  `    const scheduled = await prisma.shift.findMany({
      where: { tenantId, startTime: { gte: now, lt: weekEnd }, published: true },
      include: { employee: { select: { hourlyWage: true } } },
    });`,
  `    const scheduled = await prisma.shift.findMany({
      where: {
        tenantId,
        startTime: { gte: now, lt: weekEnd },
        published: true,
        ...scopeByEmployeeId,
      },
      include: { employee: { select: { hourlyWage: true } } },
    });`,
  `startTime: { gte: now, lt: weekEnd },\n        published: true,\n        ...scopeByEmployeeId,`,
);

if (failed > 0) {
  console.log(`\n!! ${failed} hunk(s) failed — NOT writing file. Nothing changed.`);
  process.exit(1);
}

if (s !== original) {
  fs.writeFileSync(file, s);
  console.log(`\n=== ${ok} hunk(s) applied ===`);
} else {
  console.log("\n=== no changes needed ===");
}
