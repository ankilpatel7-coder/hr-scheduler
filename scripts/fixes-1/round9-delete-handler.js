/**
 * ROUND 9b — archive shifts on delete instead of destroying them.
 *
 * Replaces the bare `prisma.shift.delete(...)` in the DELETE handler with a
 * transaction that snapshots the row into DeletedShift first. Everything else
 * about the handler — auth, tenant check, manager permission check — is
 * untouched.
 *
 * Idempotent. Aborts without writing if the anchor fails.
 */

const fs = require("fs");
const file = "src/app/api/shifts/route.ts";

if (!fs.existsSync(file)) {
  console.log(`  ! ${file} NOT FOUND — aborting`);
  process.exit(1);
}

let s = fs.readFileSync(file, "utf8");

if (s.includes("deletedShift.create")) {
  console.log("  = archive-on-delete already applied");
  process.exit(0);
}

const anchor = `  await prisma.shift.delete({ where: { id } });
  return NextResponse.json({ ok: true });`;

if (!s.includes(anchor)) {
  console.log("  ! ANCHOR NOT FOUND — aborting, nothing changed");
  process.exit(1);
}

const replacement = `  // Archive before removing so an admin can restore from the recycle bin.
  // Names are denormalised so the archive still reads correctly if the
  // employee or location is later renamed or archived.
  const [employee, location] = await Promise.all([
    existing.employeeId
      ? prisma.user.findUnique({
          where: { id: existing.employeeId },
          select: { name: true, email: true },
        })
      : Promise.resolve(null),
    existing.locationId
      ? prisma.location.findUnique({
          where: { id: existing.locationId },
          select: { name: true },
        })
      : Promise.resolve(null),
  ]);
  const actor = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { name: true, email: true },
  });

  const { searchParams: delParams } = new URL(req.url);
  const deleteReason = delParams.get("reason");

  await prisma.$transaction([
    prisma.deletedShift.create({
      data: {
        id: existing.id,
        tenantId: existing.tenantId,
        employeeId: existing.employeeId,
        employeeName: employee?.name ?? employee?.email ?? null,
        managerId: existing.managerId,
        locationId: existing.locationId,
        locationName: location?.name ?? null,
        startTime: existing.startTime,
        endTime: existing.endTime,
        role: existing.role,
        tagId: existing.tagId,
        notes: existing.notes,
        published: existing.published,
        publishedAt: existing.publishedAt,
        originalCreatedAt: existing.createdAt,
        deletedById: auth.userId,
        deletedByName: actor?.name ?? actor?.email ?? null,
        deleteReason: deleteReason || null,
      },
    }),
    prisma.shift.delete({ where: { id } }),
  ]);

  return NextResponse.json({ ok: true, archived: true });`;

s = s.replace(anchor, replacement);
fs.writeFileSync(file, s);
console.log("  + shifts are archived to DeletedShift before deletion");
console.log("\n=== 1 change ===");
