/**
 * Fix attendance page so cross-location workers (e.g. assigned to Ferguson,
 * worked at Elizabethtown) match their shifts to their clock entries.
 *
 * Bug: The clock entries query had `user.locations.some(locationId)` which
 * filtered out entries for any user not assigned to the current location.
 * Their cross-location SHIFTS still appeared (filtered by shift.locationId),
 * but with no matching entries → every shift shown as No-show.
 *
 * Fix:
 *   1. Drop the user-location filter on clock entries
 *   2. Guard actualHours loop so clock-entry-only users (who never have
 *      shifts in this view) don't create phantom "Unknown" rows
 *
 * Idempotent.
 */

const fs = require("fs");
const file = "src/app/[tenant]/attendance/page.tsx";

if (!fs.existsSync(file)) {
  console.log(`  ! ${file} not found`);
  process.exit(1);
}

let s = fs.readFileSync(file, "utf8");
const before = s;

// 1. Drop the user.locations filter from clock entries query
const oldEntryWhere = `        user: {
          active: true,
          archivedAt: null,
          ...(searchParams?.locationId
            ? { locations: { some: { locationId: searchParams.locationId } } }
            : {}),
        },`;

const newEntryWhere = `        user: {
          active: true,
          archivedAt: null,
        },`;

if (s.includes("Cross-location workers")) {
  console.log("  = clock entry filter already relaxed");
} else if (s.includes(oldEntryWhere)) {
  s = s.replace(
    oldEntryWhere,
    `// Don't filter by user.locations — Cross-location workers (e.g. assigned
        // to Ferguson, scheduled at Elizabethtown) need their entries to match
        // their shifts here. Phantom "Unknown" rows are prevented further down.
        ${newEntryWhere}`,
  );
  console.log("  + dropped user.locations filter on clock entries");
} else {
  console.log("  ! clock entry filter anchor not found");
}

// 2. Guard the actualHours loop against phantom rows
const oldHoursLoop = `  // Sum actual hours from APPROVED clock entries only.
  for (const ce of clockEntries) {
    if (!ce.clockOut) continue;
    if ((ce as any).approvalStatus !== "APPROVED") continue;
    const row = ensure(ce.userId);
    row.actualHours += (ce.clockOut.getTime() - ce.clockIn.getTime()) / 3_600_000;
  }`;

const newHoursLoop = `  // Sum actual hours from APPROVED clock entries only.
  // Only count for users who already have a row (i.e. have shifts in this
  // view). Prevents clock-entry-only users from appearing as "Unknown 0/0".
  for (const ce of clockEntries) {
    if (!ce.clockOut) continue;
    if ((ce as any).approvalStatus !== "APPROVED") continue;
    if (!rows.has(ce.userId)) continue;
    const row = rows.get(ce.userId)!;
    row.actualHours += (ce.clockOut.getTime() - ce.clockIn.getTime()) / 3_600_000;
  }`;

if (s.includes("Prevents clock-entry-only users")) {
  console.log("  = actualHours phantom-row guard already present");
} else if (s.includes(oldHoursLoop)) {
  s = s.replace(oldHoursLoop, newHoursLoop);
  console.log("  + added phantom-row guard to actualHours loop");
} else {
  console.log("  ! actualHours loop anchor not found");
}

if (s !== before) {
  fs.writeFileSync(file, s);
  console.log("\nFile updated.");
} else {
  console.log("\nNo changes.");
}
