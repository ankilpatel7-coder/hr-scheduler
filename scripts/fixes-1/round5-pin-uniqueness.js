/**
 * ROUND 5 — enforce unique PINs within a tenant.
 *
 * Two write paths currently allow duplicates:
 *   1. POST /api/me/pin            — employee sets/changes their own PIN
 *   2. POST /api/employees/[id]/pin — admin/manager resets someone's PIN
 *
 * Both now go through src/lib/pin.ts. The self-service route rejects a taken
 * PIN with a clear message; the admin route generates a PIN that's guaranteed
 * unused.
 *
 * Behaviour that does NOT change: format rules, weak-PIN blocklist, the
 * current-PIN verification step, and the DELETE (clear PIN) handler.
 *
 * Idempotent. Aborts without writing if any anchor fails.
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
  // marker may be a string (already-applied sentinel) or a predicate
  const alreadyApplied =
    typeof marker === "function" ? marker(s) : marker ? s.includes(marker) : false;
  if (alreadyApplied) {
    console.log(`  = ${name}: already applied`);
    pending.set(file, s);
    return;
  }
  if (!s.includes(find)) {
    console.log(`  ! ${name}: ANCHOR NOT FOUND`);
    failed++;
    return;
  }
  s = s.replace(find, replace);
  pending.set(file, s);
  console.log(`  + ${name}`);
  ok++;
}

// ============================================================
// 1. Self-service: POST /api/me/pin
// ============================================================
console.log("== /api/me/pin ==");
const meFile = "src/app/api/me/pin/route.ts";

stage(
  meFile,
  "import shared pin helpers",
  `import { getServerAuth } from "@/lib/auth";`,
  `import { getServerAuth } from "@/lib/auth";
import { findPinOwner, pinOwnerLabel } from "@/lib/pin";`,
  `from "@/lib/pin"`,
);

stage(
  meFile,
  "select tenantId on the user",
  `  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, pinHash: true } });`,
  `  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, pinHash: true, tenantId: true },
  });`,
  `select: { id: true, pinHash: true, tenantId: true }`,
);

stage(
  meFile,
  "reject a PIN already in use",
  `  const pinHash = await bcrypt.hash(newPin, 10);
  await prisma.user.update({
    where: { id: userId },
    data: { pinHash, pinUpdatedAt: new Date() },
  });

  return NextResponse.json({ ok: true, hadExistingPin: !!user.pinHash });`,
  `  // Uniqueness within the tenant. Kiosk login resolves a user by PIN alone,
  // so a duplicate silently locks out BOTH people (auth.ts rejects ambiguous
  // matches). Block it at write time instead.
  if (user.tenantId) {
    const owner = await findPinOwner(user.tenantId, newPin, userId);
    if (owner) {
      return NextResponse.json(
        {
          error:
            "That PIN is already used by another team member. Please choose a different one.",
        },
        { status: 409 },
      );
    }
  }

  const pinHash = await bcrypt.hash(newPin, 10);
  await prisma.user.update({
    where: { id: userId },
    data: { pinHash, pinUpdatedAt: new Date() },
  });

  return NextResponse.json({ ok: true, hadExistingPin: !!user.pinHash });`,
  `const owner = await findPinOwner(user.tenantId, newPin, userId);`,
);

// ============================================================
// 2. Admin reset: POST /api/employees/[id]/pin
// ============================================================
console.log("\n== /api/employees/[id]/pin ==");
const adminFile = "src/app/api/employees/[id]/pin/route.ts";

stage(
  adminFile,
  "import generateUniquePin",
  `import { requireRole, getScopedEmployeeIds } from "@/lib/guards";`,
  `import { requireRole, getScopedEmployeeIds } from "@/lib/guards";
import { generateUniquePin } from "@/lib/pin";`,
  `import { generateUniquePin } from "@/lib/pin";`,
);

stage(
  adminFile,
  "drop the local non-unique generator",
  `function generateTempPin(): string {
  // Random 4-digit PIN avoiding common weak ones
  const weak = new Set(["0000","1111","2222","3333","4444","5555","6666","7777","8888","9999","1234","4321"]);
  while (true) {
    const pin = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
    if (!weak.has(pin)) return pin;
  }
}

`,
  ``,
  (src) => !src.includes("function generateTempPin"),
);

stage(
  adminFile,
  "generate a tenant-unique temp PIN",
  `  const tempPin = generateTempPin();
  const pinHash = await bcrypt.hash(tempPin, 10);`,
  `  // Guaranteed not to collide with another active employee in this tenant —
  // a duplicate would break kiosk login for both of them.
  let tempPin: string;
  try {
    tempPin = await generateUniquePin(tenantId);
  } catch {
    return NextResponse.json(
      { error: "Could not generate an unused PIN. Please try again." },
      { status: 500 },
    );
  }
  const pinHash = await bcrypt.hash(tempPin, 10);`,
  `tempPin = await generateUniquePin(tenantId);`,
);

// ============================================================
// Commit or abort
// ============================================================
if (failed > 0) {
  console.log(`\n!! ${failed} hunk(s) failed — NOTHING written.`);
  process.exit(1);
}

for (const [file, content] of pending) {
  fs.writeFileSync(file, content);
}
console.log(`\n=== ${ok} hunk(s) applied across ${pending.size} file(s) ===`);
