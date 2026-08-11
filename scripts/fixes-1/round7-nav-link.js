/**
 * ROUND 7c — add an "Activity log" button to the timesheets nav row.
 *
 * Slots in beside By employee / Approvals, matching the button styling added
 * in round 1.
 *
 * Idempotent. Aborts without writing if the anchor fails.
 */

const fs = require("fs");
const file = "src/app/[tenant]/timesheets/page.tsx";

if (!fs.existsSync(file)) {
  console.log(`  ! ${file} NOT FOUND — aborting`);
  process.exit(1);
}

let s = fs.readFileSync(file, "utf8");

if (s.includes("timesheets/adjustments")) {
  console.log("  = Activity log button already present");
  process.exit(0);
}

const anchor = `              <Link
                href={\`/\${tenantSlugForViewToggle}/timesheets/approvals\`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-dust bg-paper text-ink hover:bg-steel transition-colors"
              >
                <ClipboardCheck size={12} /> Approvals
              </Link>`;

const replacement = `              <Link
                href={\`/\${tenantSlugForViewToggle}/timesheets/approvals\`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-dust bg-paper text-ink hover:bg-steel transition-colors"
              >
                <ClipboardCheck size={12} /> Approvals
              </Link>
              <Link
                href={\`/\${tenantSlugForViewToggle}/timesheets/adjustments\`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-dust bg-paper text-ink hover:bg-steel transition-colors"
              >
                <History size={12} /> Activity log
              </Link>`;

if (!s.includes(anchor)) {
  console.log("  ! ANCHOR NOT FOUND (round 1 button markup expected) — aborting");
  process.exit(1);
}

s = s.replace(anchor, replacement);

// Add the History icon to the existing lucide import
if (!/\bHistory\b/.test(s.split("\n").slice(0, 40).join("\n"))) {
  const iconAnchor = `  AlertTriangle, LayoutGrid, ClipboardCheck } from "lucide-react";`;
  if (s.includes(iconAnchor)) {
    s = s.replace(
      iconAnchor,
      `  AlertTriangle, LayoutGrid, ClipboardCheck, History } from "lucide-react";`,
    );
    console.log("  + History icon imported");
  } else {
    console.log("  ! icon import anchor not found — aborting");
    process.exit(1);
  }
}

fs.writeFileSync(file, s);
console.log("  + Activity log button added");
console.log("\n=== done ===");
