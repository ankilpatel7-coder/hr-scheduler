/**
 * ROUND 14 — fix the Activity log server-side exception.
 *
 * Round 13 passed `hrefFor={(p) => ...}` — a function — from the Activity log
 * (a Server Component) into Pagination (a Client Component). React cannot
 * serialize functions across that boundary, so the page threw at render.
 *
 * The component now takes a `baseHref` string and builds the URLs itself.
 * Time off and Swaps are unaffected: they're client components passing
 * onPageChange to a client component, which is legal.
 *
 * Idempotent. Aborts without writing if the anchor fails.
 */

const fs = require("fs");
const file = "src/app/[tenant]/timesheets/adjustments/page.tsx";

if (!fs.existsSync(file)) {
  console.log(`  ! ${file} NOT FOUND — aborting`);
  process.exit(1);
}

let s = fs.readFileSync(file, "utf8");

if (s.includes("baseHref={")) {
  console.log("  = already using baseHref");
  process.exit(0);
}

const anchor = `          hrefFor={(p) =>
            \`/\${params.tenant}/timesheets/adjustments?days=\${days}&page=\${p}\`
          }`;

if (!s.includes(anchor)) {
  console.log("  ! ANCHOR NOT FOUND — aborting, nothing changed");
  process.exit(1);
}

const replacement = `          baseHref={\`/\${params.tenant}/timesheets/adjustments?days=\${days}\`}`;

s = s.replace(anchor, replacement);
fs.writeFileSync(file, s);
console.log("  + Activity log passes baseHref (string) instead of a function");
console.log("\n=== 1 change ===");
