/**
 * Repair JSX broken by purge-navbar.js — SAFE v2.
 *
 * v1 also tried to fix orphan ternaries but its regex matched TypeScript's
 * optional property syntax `{ foo?: T }` and stripped real type annotations.
 * v2 ONLY repairs the unambiguous case:
 *
 *   {!isSuperAdmin && <Navbar />}   →   {!isSuperAdmin &&}   →   (deleted)
 *
 * Also restricted to .tsx files (JSX only — never .ts API routes).
 * Idempotent.
 */

const fs = require("fs");
const path = require("path");

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

// `{ expr && }` — possibly with whitespace anywhere, possibly with ! prefix,
// possibly with dotted identifier (e.g. `user.role &&`).
// Crucially: requires the literal `&&` followed by `}`, which is illegal JSX.
const orphanAnd = /\{\s*!?\s*[\w.]+\s*&&\s*\}/g;

const files = walk("src/app");
let total = 0;

for (const f of files) {
  let s = fs.readFileSync(f, "utf8");
  const before = s;

  s = s.replace(orphanAnd, "");
  // Collapse runs of blank lines left behind (3+ → 2)
  s = s.replace(/\n{3,}/g, "\n\n");

  if (s !== before) {
    fs.writeFileSync(f, s);
    console.log(`  + ${f}`);
    total++;
  }
}

console.log(`\n=== ${total} file(s) repaired ===`);
