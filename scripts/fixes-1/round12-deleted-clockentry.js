/**
 * ROUND 12 — archive deleted clock entries.
 *
 * Deleting a timesheet row currently destroys it, along with its breaks
 * (cascade), selfies and geo data. Same archive pattern as DeletedShift:
 * the row moves into DeletedClockEntry rather than disappearing, so every
 * existing read of ClockEntry stays correct with no modification.
 *
 * A `snapshot` Json column holds the complete row plus its breaks, so the
 * archive survives future schema changes and a restore can rebuild both.
 *
 * Idempotent. Aborts without writing if an anchor fails.
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

// ============================================================
// 1. Schema
// ============================================================
console.log("== prisma/schema.prisma ==");
{
  const file = "prisma/schema.prisma";
  let s = fs.readFileSync(file, "utf8");

  if (s.includes("model DeletedClockEntry")) {
    console.log("  = DeletedClockEntry already present");
    pending.set(file, s);
  } else {
    const model = `

// ============================================================
// DeletedClockEntry — archive of removed timesheet punches.
// Rows live HERE, not in ClockEntry, so no read query needs a filter.
// The snapshot column carries the full row + breaks for a faithful restore.
// ============================================================

model DeletedClockEntry {
  id       String @id
  tenantId String
  tenant   Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  userId   String
  userName String?

  clockIn        DateTime
  clockOut       DateTime?
  approvalStatus String
  breakCount     Int      @default(0)

  // Complete row (all scalars) plus a breaks array.
  snapshot Json

  originalCreatedAt DateTime

  deletedById   String
  deletedByName String?
  deletedAt     DateTime @default(now())
  deleteReason  String?

  @@index([tenantId, deletedAt])
  @@index([userId, clockIn])
}
`;
    s = s.trimEnd() + "\n" + model;

    const tenantRe = /(model Tenant \{[\s\S]*?)(\n\})/m;
    const m = s.match(tenantRe);
    if (m && !m[1].includes("deletedClockEntries")) {
      s = s.replace(tenantRe, `$1\n  deletedClockEntries DeletedClockEntry[]$2`);
      console.log("  + Tenant.deletedClockEntries relation added");
    }
    pending.set(file, s);
    console.log("  + DeletedClockEntry model added");
    ok++;
  }
}

// ============================================================
// 2. DELETE handler archives first
// ============================================================
console.log("\n== clock-entries DELETE ==");
stage(
  "src/app/api/clock-entries/route.ts",
  "archive before delete",
  `  await prisma.clockEntry.delete({ where: { id } });
  return NextResponse.json({ ok: true });`,
  `  // Archive the full row (plus breaks) so an admin can restore it.
  const full = await prisma.clockEntry.findUnique({
    where: { id },
    include: { breaks: true },
  });
  if (!full) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [owner, actor] = await Promise.all([
    prisma.user.findUnique({
      where: { id: full.userId },
      select: { name: true, email: true },
    }),
    prisma.user.findUnique({
      where: { id: auth.userId },
      select: { name: true, email: true },
    }),
  ]);

  const deleteReason = searchParams.get("reason");

  await prisma.$transaction([
    prisma.deletedClockEntry.create({
      data: {
        id: full.id,
        tenantId: full.tenantId,
        userId: full.userId,
        userName: owner?.name ?? owner?.email ?? null,
        clockIn: full.clockIn,
        clockOut: full.clockOut,
        approvalStatus: String(full.approvalStatus),
        breakCount: full.breaks.length,
        snapshot: JSON.parse(JSON.stringify(full)),
        originalCreatedAt: full.createdAt,
        deletedById: auth.userId,
        deletedByName: actor?.name ?? actor?.email ?? null,
        deleteReason: deleteReason || null,
      },
    }),
    prisma.clockEntry.delete({ where: { id } }),
  ]);

  return NextResponse.json({ ok: true, archived: true });`,
  `prisma.deletedClockEntry.create`,
);

if (failed > 0) {
  console.log(`\n!! ${failed} hunk(s) failed — NOTHING written.`);
  process.exit(1);
}
for (const [f, c] of pending) fs.writeFileSync(f, c);
console.log(`\n=== ${ok} hunk(s) across ${pending.size} file(s) ===`);
console.log("Next: npx prisma format && npx prisma db push && npx prisma generate");
