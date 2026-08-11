/**
 * ROUND 7b — stamp editedAt whenever a clock entry is adjusted.
 *
 * Touches the PATCH handler in /api/clock-entries and the manual-create POST
 * so both feed the activity log.
 *
 * Idempotent. Aborts without writing if an anchor fails.
 */

const fs = require("fs");
const file = "src/app/api/clock-entries/route.ts";

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

hunk(
  "PATCH stamps editedAt",
  `  const data: any = { editedBy: auth.userId };`,
  `  const data: any = { editedBy: auth.userId, editedAt: new Date() };`,
  `editedBy: auth.userId, editedAt: new Date()`,
);

hunk(
  "manual entry stamps editedAt",
  `      editedBy: auth.userId,
      editNote: editNote ?? "Created by manager",`,
  `      editedBy: auth.userId,
      editedAt: new Date(),
      editNote: editNote ?? "Created by manager",`,
  `      editedAt: new Date(),\n      editNote: editNote ?? "Created by manager",`,
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
