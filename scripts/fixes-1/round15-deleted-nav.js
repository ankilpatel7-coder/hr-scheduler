/**
 * ROUND 15 — "Deleted" button in the timesheets nav row.
 *
 * Sits after Activity log so "why was this changed" and "what was removed"
 * are next to each other.
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

if (s.includes("timesheets/deleted")) {
  console.log("  = Deleted button already present");
  process.exit(0);
}

const anchor = `              <Link
                href={\`/\${tenantSlugForViewToggle}/timesheets/adjustments\`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-dust bg-paper text-ink hover:bg-steel transition-colors"
              >
                <History size={12} /> Activity log
              </Link>`;

if (!s.includes(anchor)) {
  console.log("  ! ANCHOR NOT FOUND (expected round 7 markup) — aborting");
  process.exit(1);
}

const replacement = `${anchor}
              <Link
                href={\`/\${tenantSlugForViewToggle}/timesheets/deleted\`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-dust bg-paper text-ink hover:bg-steel transition-colors"
                title="Restore deleted timesheet entries (admin only)"
              >
                <Trash2 size={12} /> Deleted
              </Link>`;

s = s.replace(anchor, replacement);

// Ensure Trash2 is imported (the file already imports it for row actions,
// but check rather than assume).
const head = s.split("\n").slice(0, 40).join("\n");
if (!/\bTrash2\b/.test(head)) {
  const m = s.match(/import \{([^}]*)\} from "lucide-react";/);
  if (!m) {
    console.log("  ! lucide-react import not found — aborting");
    process.exit(1);
  }
  s = s.replace(
    m[0],
    `import {${m[1].replace(/\s*$/, "")}, Trash2 } from "lucide-react";`,
  );
  console.log("  + Trash2 imported");
}

fs.writeFileSync(file, s);
console.log("  + Deleted button added to timesheets nav");
console.log("\n=== done ===");
