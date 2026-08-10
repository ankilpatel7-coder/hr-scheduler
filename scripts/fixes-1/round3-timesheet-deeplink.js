/**
 * ROUND 3 — Approvals "Details" deep-link.
 *
 * The approval queue links to:
 *   /{tenant}/timesheets?from=DAY&to=DAY&employeeIds=USER_ID
 * but the timesheets page never read those params, so it always showed the
 * current week for all employees — which usually looks empty.
 *
 * Fix: on mount, apply any from / to / employeeIds / locationId params to
 * the existing state. Applied in an effect (not a lazy useState initializer)
 * to avoid an SSR/client hydration mismatch.
 *
 * Defaults are untouched — with no params the page behaves exactly as before.
 *
 * Idempotent. Aborts without writing if the anchor doesn't match.
 */

const fs = require("fs");
const file = "src/app/[tenant]/timesheets/page.tsx";

if (!fs.existsSync(file)) {
  console.log(`  ! ${file} NOT FOUND — aborting`);
  process.exit(1);
}

let s = fs.readFileSync(file, "utf8");

if (s.includes("apply-url-params-v1")) {
  console.log("  = deep-link support already present");
  process.exit(0);
}

const anchor = `  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);`;

if (!s.includes(anchor)) {
  console.log("  ! ANCHOR NOT FOUND — aborting, nothing changed");
  process.exit(1);
}

const replacement = `  // apply-url-params-v1
  // Seed filters from the query string on first mount so deep links from the
  // approval queue (?from=&to=&employeeIds=) land on the right rows. Runs in
  // an effect rather than a useState initializer so server and client render
  // the same markup. With no params present, nothing changes.
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const qFrom = sp.get("from");
    const qTo = sp.get("to");
    const qEmployees = sp.get("employeeIds");
    const qLocation = sp.get("locationId");
    if (qFrom) setFrom(qFrom);
    if (qTo) setTo(qTo);
    if (qEmployees) {
      setSelectedEmployeeIds(qEmployees.split(",").filter(Boolean));
    }
    if (qLocation) setLocationFilter(qLocation);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);`;

s = s.replace(anchor, replacement);
fs.writeFileSync(file, s);
console.log("  + deep-link param support added to timesheets page");
console.log("\n=== 1 change ===");
