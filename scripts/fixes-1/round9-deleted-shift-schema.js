/**
 * ROUND 9a — DeletedShift archive table.
 *
 * Rather than adding Shift.deletedAt and then having to add `deletedAt: null`
 * to all 33 places that read shifts (miss one and deleted shifts reappear
 * there), deleted rows move OUT of Shift into this archive. The Shift table
 * therefore only ever holds live shifts and every existing query stays correct
 * with no modification.
 *
 * The original Shift.id is preserved as the primary key so a restore recreates
 * the row with its original identity.
 *
 * Employee and location names are denormalised so the recycle bin still renders
 * correctly if those records are later renamed or archived.
 *
 * Idempotent.
 */

const fs = require("fs");
const file = "prisma/schema.prisma";

let s = fs.readFileSync(file, "utf8");

if (s.includes("model DeletedShift")) {
  console.log("  = DeletedShift already present");
  process.exit(0);
}

const model = `

// ============================================================
// DeletedShift — archive of removed shifts, restorable for 30 days.
// Rows live HERE, not in Shift, so no read query needs a deleted filter.
// ============================================================

model DeletedShift {
  // Same id the Shift had, so restore recreates it exactly.
  id       String @id
  tenantId String
  tenant   Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  // Snapshot of the shift as it was
  employeeId   String?
  employeeName String?
  managerId    String
  locationId   String?
  locationName String?
  startTime    DateTime
  endTime      DateTime
  role         String?
  tagId        String?
  notes        String?
  published    Boolean
  publishedAt  DateTime?

  originalCreatedAt DateTime

  // Who removed it and why
  deletedById   String
  deletedByName String?
  deletedAt     DateTime @default(now())
  deleteReason  String?

  @@index([tenantId, deletedAt])
}
`;

s = s.trimEnd() + "\n" + model;

// Back-relation on Tenant
const tenantRe = /(model Tenant \{[\s\S]*?)(\n\})/m;
const m = s.match(tenantRe);
if (m && !m[1].includes("deletedShifts")) {
  s = s.replace(tenantRe, `$1\n  deletedShifts     DeletedShift[]$2`);
  console.log("  + Tenant.deletedShifts relation added");
}

fs.writeFileSync(file, s);
console.log("  + DeletedShift model added");
console.log("\nNext: npx prisma format && npx prisma db push && npx prisma generate");
