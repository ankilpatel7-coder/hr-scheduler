/**
 * Remove all Navbar / AdminNav imports and JSX usages from src/app/.
 * The new AppShell sidebar makes them dead weight. Stubbed components still
 * exist as safety nets, but the source becomes clean.
 *
 * Idempotent — re-runnable safely.
 */

const fs = require("fs");
const path = require("path");

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else if (p.endsWith(".tsx") || p.endsWith(".ts")) out.push(p);
  }
  return out;
}

const importNavbar = /^import\s+Navbar\s+from\s+["']@\/components\/navbar["'];?\s*\n/gm;
const importAdminNav = /^import\s+AdminNav\s+from\s+["']@\/components\/admin-nav["'];?\s*\n/gm;
const jsxNavbar = /\s*<Navbar\s*(?:[^/>]*)\/>\s*/g;
const jsxAdminNav = /\s*<AdminNav\s*(?:[^/>]*)\/>\s*/g;

const files = walk("src/app");
let total = 0;

for (const f of files) {
  let s = fs.readFileSync(f, "utf8");
  const before = s;

  s = s.replace(importNavbar, "");
  s = s.replace(importAdminNav, "");
  s = s.replace(jsxNavbar, "");
  s = s.replace(jsxAdminNav, "");

  if (s !== before) {
    fs.writeFileSync(f, s);
    console.log(`  - ${f}`);
    total++;
  }
}

console.log(`\n=== ${total} file(s) cleaned ===`);
