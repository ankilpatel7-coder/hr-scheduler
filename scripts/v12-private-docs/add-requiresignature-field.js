/**
 * Add Document.requireSignature field for personal/paystub docs.
 *
 * When requireSignature=true (default): existing signing flow (required for
 * clock-in if Document.required=true, otherwise voluntary acknowledgment).
 *
 * When requireSignature=false: view-only mode. Employee can view, no
 * signing required, never blocks clock-in. Used for paystubs and other
 * personal docs.
 *
 * Idempotent.
 */

const fs = require("fs");
const file = "prisma/schema.prisma";

let s = fs.readFileSync(file, "utf8");

if (s.includes("requireSignature Boolean")) {
  console.log("[=] requireSignature field already present");
  process.exit(0);
}

// Insert right after the `required` field on the Document model.
const find = `  required      Boolean             @default(true) // gate clock-in if true`;
const replace = `  required      Boolean             @default(true) // gate clock-in if true
  // When false, doc is view-only — no signature required, never blocks
  // clock-in. Used for paystubs + other personal employee docs.
  requireSignature Boolean          @default(true)`;

if (!s.includes(find)) {
  console.log("[!] anchor not found");
  process.exit(1);
}

s = s.replace(find, replace);
fs.writeFileSync(file, s);
console.log("[+] requireSignature field added to Document");
console.log("\nRun: npx prisma format && npx prisma db push");
