/**
 * Extend CalendarEvent with PDF attachment + EVENT type.
 *
 *   Fields:
 *     attachmentUrl  String?
 *     attachmentName String?
 *     attachmentSize Int?
 *
 *   Enum: adds EVENT (for company events like patient drives, community
 *   outreach — semantically distinct from HOLIDAY/MEETING/CLOSED/OTHER).
 *
 * Idempotent.
 */

const fs = require("fs");
const file = "prisma/schema.prisma";

let s = fs.readFileSync(file, "utf8");
const before = s;

// 1. Add attachment fields
if (!s.includes("attachmentUrl")) {
  const anchor = `  color       String?
  createdById String`;
  const replacement = `  color       String?
  // Optional PDF attachment (Vercel Blob URL) — director/CEO can attach
  // event details, flyers, safety plans, etc. for employees to download.
  attachmentUrl  String?
  attachmentName String?
  attachmentSize Int?
  createdById String`;
  if (s.includes(anchor)) {
    s = s.replace(anchor, replacement);
    console.log("  + attachment fields added");
  } else {
    console.log("  ! anchor for attachment fields not found");
  }
} else {
  console.log("  = attachment fields already present");
}

// 2. Add EVENT to enum
const enumRe = /(enum CalendarEventType\s*\{)([\s\S]*?)(\n\})/;
const m = s.match(enumRe);
if (m) {
  if (m[2].includes("EVENT")) {
    console.log("  = EVENT enum value already present");
  } else {
    s = s.replace(enumRe, `$1$2\n  EVENT$3`);
    console.log("  + EVENT enum value added");
  }
} else {
  console.log("  ! CalendarEventType enum not found");
}

if (s !== before) {
  fs.writeFileSync(file, s);
  console.log("\nRun: npx prisma format && npx prisma db push && npx prisma generate");
} else {
  console.log("\nNo changes.");
}
