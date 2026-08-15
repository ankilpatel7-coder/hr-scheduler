/**
 * ROUND 11 — make Approvals → Details actually show the entry.
 *
 * Root cause: /api/timesheets defaults to approvalStatus = "APPROVED".
 * Approval-queue rows are PENDING, so the deep link landed on a correctly
 * filtered — and therefore empty — list.
 *
 * Fix: the Details link opts into all statuses, and the timesheets page
 * honours that via an includeAll flag. The page default is unchanged, so
 * payroll-facing views still show approved hours only.
 *
 * Idempotent. Aborts without writing if any anchor fails.
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

// ---- 1. Details link opts in ----
console.log("== approval-queue.tsx ==");
stage(
  "src/components/approval-queue.tsx",
  "Details link requests all statuses",
  "href={`/${tenantSlug}/timesheets?from=${day}&to=${day}&employeeIds=${e.userId}`}",
  "href={`/${tenantSlug}/timesheets?from=${day}&to=${day}&employeeIds=${e.userId}&includeAll=true`}",
  "&includeAll=true`}",
);

// ---- 2. Timesheets page honours it ----
console.log("\n== timesheets/page.tsx ==");
const ts = "src/app/[tenant]/timesheets/page.tsx";

stage(
  ts,
  "includeAll state",
  `  const [outsideOnly, setOutsideOnly] = useState(false);`,
  `  const [outsideOnly, setOutsideOnly] = useState(false);
  // When true, show entries of every approval status (pending / rejected too).
  // Off by default so the payroll-facing view stays approved-hours-only.
  const [includeAll, setIncludeAll] = useState(false);`,
  `const [includeAll, setIncludeAll] = useState(false);`,
);

stage(
  ts,
  "read includeAll from the URL",
  `    if (qLocation) setLocationFilter(qLocation);`,
  `    if (qLocation) setLocationFilter(qLocation);
    if (sp.get("includeAll") === "true") setIncludeAll(true);`,
  `if (sp.get("includeAll") === "true") setIncludeAll(true);`,
);

stage(
  ts,
  "send includeAll to the API",
  `    const empParam = selectedEmployeeIds.length > 0 ? \`&employeeIds=\${selectedEmployeeIds.join(",")}\` : "";
    const res = await fetch(\`/api/timesheets?from=\${fromIso}&to=\${toIso}\${locParam}\${empParam}\`);`,
  `    const empParam = selectedEmployeeIds.length > 0 ? \`&employeeIds=\${selectedEmployeeIds.join(",")}\` : "";
    const allParam = includeAll ? "&includeAll=true" : "";
    const res = await fetch(\`/api/timesheets?from=\${fromIso}&to=\${toIso}\${locParam}\${empParam}\${allParam}\`);`,
  `const allParam = includeAll ? "&includeAll=true" : "";`,
);

stage(
  ts,
  "refetch when includeAll changes",
  `  }, [session, from, to, locationFilter, selectedEmployeeIds]);`,
  `  }, [session, from, to, locationFilter, selectedEmployeeIds, includeAll]);`,
  `selectedEmployeeIds, includeAll]);`,
);

if (failed > 0) {
  console.log(`\n!! ${failed} hunk(s) failed — NOTHING written.`);
  process.exit(1);
}
for (const [f, c] of pending) fs.writeFileSync(f, c);
console.log(`\n=== ${ok} hunk(s) across ${pending.size} file(s) ===`);
