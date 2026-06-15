/**
 * API patches for private/personal documents:
 *
 *   1. POST /api/documents — accept `requireSignature` field on upload
 *   2. GET /api/clock/precheck — only consider requireSignature=true docs
 *      (personal docs never block clock-in)
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

// 1. POST /api/documents accepts requireSignature
console.log("== Documents POST: accept requireSignature ==");
patch(
  "src/app/api/documents/route.ts",
  "read requireSignature from form data",
  `  const required = String(formData.get("required") ?? "true") === "true";`,
  `  const required = String(formData.get("required") ?? "true") === "true";
  // requireSignature defaults to true. When false, the doc is view-only:
  // no signature workflow, never blocks clock-in. Used for paystubs etc.
  const requireSignature = String(formData.get("requireSignature") ?? "true") === "true";`,
  `const requireSignature = String(formData.get("requireSignature")`,
);

patch(
  "src/app/api/documents/route.ts",
  "include requireSignature on create",
  `      required,
      folderId,
      uploadedById: auth.userId,
    },
  });`,
  `      required,
      requireSignature,
      folderId,
      uploadedById: auth.userId,
    },
  });`,
  `requireSignature,\n      folderId,`,
);

// 2. Precheck: exclude personal docs from blocker list
console.log("\n== Clock precheck: exclude personal docs ==");
patch(
  "src/app/api/clock/precheck/route.ts",
  "only require signatures on requireSignature docs",
  `  const blockers = await prisma.documentSignature.findMany({
    where: {
      employeeId: userId,
      status: "PENDING",
      document: { tenantId, active: true, required: true },
    },`,
  `  const blockers = await prisma.documentSignature.findMany({
    where: {
      employeeId: userId,
      status: "PENDING",
      // Only block on docs that BOTH require signature AND are marked required.
      // Personal/paystub docs (requireSignature=false) never block clock-in.
      document: { tenantId, active: true, required: true, requireSignature: true },
    },`,
  `requireSignature: true },`,
);

console.log(`\n=== ${total} change(s) ===`);
