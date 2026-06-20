/**
 * Enforce separation of duties: managers cannot edit, create, approve, or
 * reject their own timesheet entries. Admins can.
 *
 * Patches:
 *   1. /api/clock-entries PATCH        (edit existing)
 *   2. /api/clock-entries DELETE       (delete existing)
 *   3. /api/clock-entries POST         (create manual entry)
 *   4. /api/clock-entries/[id]/approve loadAndAuthorize
 *   5. /api/clock-entries/[id]/reject  loadAndAuthorize (identical file)
 *   6. /api/clock-entries/bulk-approve allowed-list filter
 *
 * Idempotent.
 */

const fs = require("fs");

let total = 0;
function patch(file, name, find, replace, marker) {
  if (!fs.existsSync(file)) { console.log(`  - ${file}: not found`); return; }
  let s = fs.readFileSync(file, "utf8");
  if (marker && s.includes(marker)) { console.log(`  = ${file}: ${name}`); return; }
  if (!s.includes(find)) { console.log(`  ! ${file}: ${name} anchor not found`); return; }
  s = s.replace(find, replace);
  fs.writeFileSync(file, s);
  console.log(`  + ${file}: ${name}`);
  total++;
}

// ============================================================
// 1. /api/clock-entries PATCH — block manager editing own entry
// ============================================================
patch(
  "src/app/api/clock-entries/route.ts",
  "PATCH: select userId + self-edit guard",
  `  const existing = await prisma.clockEntry.findUnique({ where: { id }, select: { tenantId: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.tenantId !== tenantId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const data: any = { editedBy: auth.userId };`,
  `  const existing = await prisma.clockEntry.findUnique({ where: { id }, select: { tenantId: true, userId: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.tenantId !== tenantId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  // Separation of duties — managers cannot edit their own entries
  if (auth.role === "MANAGER" && existing.userId === auth.userId) {
    return NextResponse.json(
      { error: "Managers cannot edit their own timesheet entries. Ask another admin/manager to make the correction." },
      { status: 403 },
    );
  }

  const data: any = { editedBy: auth.userId };`,
  `Managers cannot edit their own timesheet entries`,
);

// ============================================================
// 2. /api/clock-entries DELETE — block manager deleting own entry
// ============================================================
patch(
  "src/app/api/clock-entries/route.ts",
  "DELETE: select userId + self-delete guard",
  `  const existing = await prisma.clockEntry.findUnique({ where: { id }, select: { tenantId: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.tenantId !== tenantId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.clockEntry.delete({ where: { id } });`,
  `  const existing = await prisma.clockEntry.findUnique({ where: { id }, select: { tenantId: true, userId: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.tenantId !== tenantId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  // Separation of duties — managers cannot delete their own entries
  if (auth.role === "MANAGER" && existing.userId === auth.userId) {
    return NextResponse.json(
      { error: "Managers cannot delete their own timesheet entries." },
      { status: 403 },
    );
  }

  await prisma.clockEntry.delete({ where: { id } });`,
  `Managers cannot delete their own timesheet entries`,
);

// ============================================================
// 3. /api/clock-entries POST — block manager creating manual entry for self
// ============================================================
patch(
  "src/app/api/clock-entries/route.ts",
  "POST: block manager self-create",
  `  if (!userId || !clockIn) {
    return NextResponse.json({ error: "Missing userId or clockIn" }, { status: 400 });
  }

  // Verify target user is in same tenant`,
  `  if (!userId || !clockIn) {
    return NextResponse.json({ error: "Missing userId or clockIn" }, { status: 400 });
  }
  // Separation of duties — managers cannot create manual entries for themselves.
  // They must clock in/out through the normal Clock page like everyone else.
  if (auth.role === "MANAGER" && userId === auth.userId) {
    return NextResponse.json(
      { error: "Managers cannot create timesheet entries for themselves. Use the Clock page to clock in/out." },
      { status: 403 },
    );
  }

  // Verify target user is in same tenant`,
  `Managers cannot create timesheet entries for themselves`,
);

// ============================================================
// 4 & 5. /api/clock-entries/[id]/approve  AND  /reject
//        Both files share identical loadAndAuthorize — patch identically.
// ============================================================
const APPROVE_ANCHOR = `  if (!entry) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  // Manager scope check
  if (auth.role === "MANAGER") {`;

const APPROVE_REPLACEMENT = `  if (!entry) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  // Separation of duties — managers can't approve/reject their own entries
  if (auth.role === "MANAGER" && entry.userId === auth.userId) {
    return {
      error: NextResponse.json(
        { error: "Managers cannot approve or reject their own timesheet entries" },
        { status: 403 },
      ),
    };
  }
  // Manager scope check
  if (auth.role === "MANAGER") {`;

for (const f of [
  "src/app/api/clock-entries/[id]/approve/route.ts",
  "src/app/api/clock-entries/[id]/reject/route.ts",
]) {
  patch(
    f,
    "approve/reject: self-action guard",
    APPROVE_ANCHOR,
    APPROVE_REPLACEMENT,
    `Managers cannot approve or reject their own timesheet entries`,
  );
}

// ============================================================
// 6. bulk-approve — exclude manager's own ID from the allowed set
// ============================================================
patch(
  "src/app/api/clock-entries/bulk-approve/route.ts",
  "bulk-approve: strip self from allowed",
  `    const scoped = await getScopedEmployeeIds(auth.userId, "MANAGER");
    const allowed = scoped ?? [];`,
  `    const scoped = await getScopedEmployeeIds(auth.userId, "MANAGER");
    // Separation of duties — strip the manager's own ID from the allowed set
    // so bulk actions never touch their own entries
    const allowed = (scoped ?? []).filter((id) => id !== auth.userId);`,
  `strip the manager's own ID`,
);

console.log(`\n=== ${total} change(s) ===`);
