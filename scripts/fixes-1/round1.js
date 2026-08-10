/**
 * ROUND 1 — three verified, low-risk fixes.
 *
 *   1. Timesheets nav: "By employee" / "Approvals" links become buttons
 *      (pure markup — no logic touched)
 *   2. /api/employees: when filtering by location, ALSO include employees
 *      with no location assigned (additive — never removes results)
 *   3. /api/employees: optional ?activeOnly=true param, and doc upload form
 *      uses it so inactive staff never appear in the assign picker
 *
 * The new /api/me/password/route.ts is copied separately (pure new file).
 *
 * Idempotent — safe to re-run.
 */

const fs = require("fs");

let changes = 0;
function patch(file, name, find, replace, marker) {
  if (!fs.existsSync(file)) {
    console.log(`  - ${file}: NOT FOUND`);
    return;
  }
  let s = fs.readFileSync(file, "utf8");
  if (marker && s.includes(marker)) {
    console.log(`  = ${name}: already applied`);
    return;
  }
  if (!s.includes(find)) {
    console.log(`  ! ${name}: ANCHOR NOT FOUND (skipped, nothing changed)`);
    return;
  }
  s = s.replace(find, replace);
  fs.writeFileSync(file, s);
  console.log(`  + ${name}`);
  changes++;
}

// ============================================================
// 1. Timesheets nav links → buttons
// ============================================================
console.log("== 1. Timesheets nav buttons ==");

const tsFile = "src/app/[tenant]/timesheets/page.tsx";

const oldNav = `            <div className="mt-1 flex items-center gap-3 text-xs">
              <span className="text-smoke">View:</span>
              <span className="font-medium text-ink">Chronological</span>
              <span className="text-dust">·</span>
              <Link
                href={\`/\${tenantSlugForViewToggle}/timesheets/by-employee\`}
                className="text-rust hover:underline inline-flex items-center gap-1"
              >
                <LayoutGrid size={11} /> By employee
              </Link>
              <span className="text-dust">·</span>
              <Link
                href={\`/\${tenantSlugForViewToggle}/timesheets/approvals\`}
                className="text-rust hover:underline inline-flex items-center gap-1"
              >
                <ClipboardCheck size={11} /> Approvals
              </Link>
            </div>`;

const newNav = `            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-rust text-gold-on">
                Chronological
              </span>
              <Link
                href={\`/\${tenantSlugForViewToggle}/timesheets/by-employee\`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-dust bg-paper text-ink hover:bg-steel transition-colors"
              >
                <LayoutGrid size={12} /> By employee
              </Link>
              <Link
                href={\`/\${tenantSlugForViewToggle}/timesheets/approvals\`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-dust bg-paper text-ink hover:bg-steel transition-colors"
              >
                <ClipboardCheck size={12} /> Approvals
              </Link>
            </div>`;

patch(
  tsFile,
  "nav links → buttons",
  oldNav,
  newNav,
  `rounded-md text-xs font-medium bg-rust text-gold-on`,
);

// ============================================================
// 2. /api/employees — include unassigned when location-filtered
// ============================================================
console.log("\n== 2. Employees API: show unassigned staff ==");

const empApi = "src/app/api/employees/route.ts";

patch(
  empApi,
  "location filter includes unassigned",
  `  if (locationFilter) {
    where.locations = { some: { locationId: locationFilter } };
  }`,
  `  if (locationFilter) {
    // Include staff assigned to this location OR not assigned anywhere yet.
    // Without the second clause, a newly created employee with no location
    // is invisible on the employees page.
    where.OR = [
      { locations: { some: { locationId: locationFilter } } },
      { locations: { none: {} } },
    ];
  }`,
  `{ locations: { none: {} } }`,
);

// ============================================================
// 3. /api/employees — optional activeOnly filter
// ============================================================
console.log("\n== 3. Employees API: activeOnly param ==");

patch(
  empApi,
  "read activeOnly param",
  `  const includeArchived = searchParams.get("includeArchived") === "true";`,
  `  const includeArchived = searchParams.get("includeArchived") === "true";
  // Callers that must never show deactivated staff (e.g. document assignment)
  // pass ?activeOnly=true.
  const activeOnly = searchParams.get("activeOnly") === "true";`,
  `const activeOnly = searchParams.get("activeOnly")`,
);

patch(
  empApi,
  "apply activeOnly to where clause",
  `  if (!includeArchived) {
    where.archivedAt = null;
  }`,
  `  if (!includeArchived) {
    where.archivedAt = null;
  }
  if (activeOnly) {
    where.active = true;
  }`,
  `  if (activeOnly) {\n    where.active = true;\n  }`,
);

patch(
  "src/components/document-upload-form.tsx",
  "doc form requests activeOnly",
  `fetch("/api/employees", { cache: "no-store" })`,
  `fetch("/api/employees?activeOnly=true", { cache: "no-store" })`,
  `/api/employees?activeOnly=true`,
);

console.log(`\n=== ${changes} change(s) ===`);
