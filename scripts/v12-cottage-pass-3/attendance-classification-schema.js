/**
 * Add manager-applied attendance classification to the Shift model.
 *
 *   AttendanceReason enum: SICK_CALL | ABSENT_NO_CALL | LEFT_EARLY_APPROVED
 *                          | LATE_EXCUSED | OTHER
 *   Shift fields:
 *     attendanceReason       AttendanceReason?
 *     attendanceNote         String?
 *     attendanceSetById      String?    (User who classified)
 *     attendanceSetAt        DateTime?
 *
 * Distinct from existing attendanceIgnored (which excludes a shift entirely).
 * The reason explains the displayed status (sick, excused, etc.).
 *
 * Idempotent.
 */

const fs = require("fs");
const file = "prisma/schema.prisma";

let s = fs.readFileSync(file, "utf8");
const before = s;

// 1. Add enum (after the last existing enum or at end)
if (!s.includes("enum AttendanceReason")) {
  s = s.trimEnd() + `\n\nenum AttendanceReason {
  SICK_CALL
  ABSENT_NO_CALL
  LEFT_EARLY_APPROVED
  LATE_EXCUSED
  OTHER
}
`;
  console.log("  + AttendanceReason enum added");
}

// 2. Add fields to Shift model — anchor on the existing attendanceIgnoreReason line
if (!s.includes("attendanceReason       AttendanceReason?")) {
  const anchor = `  attendanceIgnoreReason String?
  createdAt              DateTime  @default(now())`;

  const replacement = `  attendanceIgnoreReason String?
  // Manager-applied classification — explains computed status (sick call,
  // approved early departure, etc.). Distinct from attendanceIgnored which
  // excludes the shift from scoring entirely.
  attendanceReason       AttendanceReason?
  attendanceNote         String?
  attendanceSetById      String?
  attendanceSetBy        User?     @relation("ShiftAttendanceSetBy", fields: [attendanceSetById], references: [id], onDelete: SetNull)
  attendanceSetAt        DateTime?
  createdAt              DateTime  @default(now())`;

  if (s.includes(anchor)) {
    s = s.replace(anchor, replacement);
    console.log("  + Shift attendance fields added");
  } else {
    console.log("  ! Anchor not found in Shift model — please paste the current Shift block");
  }
}

// 3. Add back-relation on User model
function ensureUserRelation() {
  const re = /(model User \{[\s\S]*?)(\n\})/m;
  const m = s.match(re);
  if (!m) { console.log("  ! User model not found"); return; }
  if (m[1].includes("ShiftAttendanceSetBy")) {
    console.log("  = User.shiftsAttendanceSet relation already present");
    return;
  }
  s = s.replace(re, `$1\n  shiftsAttendanceSet Shift[] @relation("ShiftAttendanceSetBy")$2`);
  console.log("  + User.shiftsAttendanceSet relation added");
}
ensureUserRelation();

if (s !== before) {
  fs.writeFileSync(file, s);
  console.log("\nSchema written. Run: npx prisma format && npx prisma db push");
} else {
  console.log("\nNo changes.");
}
