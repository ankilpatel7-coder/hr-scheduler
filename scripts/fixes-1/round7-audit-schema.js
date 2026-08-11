/**
 * ROUND 7a — add an edit timestamp to ClockEntry.
 *
 * ClockEntry already records editedBy (user id) and editNote (the reason),
 * but nothing records WHEN. Without it an activity log can't be ordered
 * chronologically.
 *
 * `editedAt DateTime?` is nullable, so existing rows are untouched and no
 * backfill is needed — historical edits simply show "—" for the timestamp.
 *
 * Idempotent.
 */

const fs = require("fs");
const file = "prisma/schema.prisma";

let s = fs.readFileSync(file, "utf8");

if (s.includes("editedAt")) {
  console.log("  = editedAt already present");
  process.exit(0);
}

const find = `  editedBy   String?
  editNote   String?`;

const replace = `  editedBy   String?
  editNote   String?
  // When the adjustment was made. Nullable: rows edited before this column
  // existed have a note and an author but no timestamp.
  editedAt   DateTime?`;

if (!s.includes(find)) {
  console.log("  ! ANCHOR NOT FOUND — aborting, nothing changed");
  process.exit(1);
}

s = s.replace(find, replace);
fs.writeFileSync(file, s);
console.log("  + ClockEntry.editedAt added");
console.log("\nNext: npx prisma format && npx prisma db push && npx prisma generate");
