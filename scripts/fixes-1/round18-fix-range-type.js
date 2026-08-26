/**
 * ROUND 18 — fix the my-attendance Range type mismatch.
 *
 * Round 17 added "60d" to the server's Range union, but the client component
 * declares its own identical-looking Range type. TypeScript treats them as
 * unrelated, so passing the widened value failed the build.
 *
 * Widens the client type to match, and adds a 60-day button if the option
 * list doesn't already have one.
 *
 * Idempotent. Aborts without writing if the type anchor fails.
 */

const fs = require("fs");
const file = "src/app/[tenant]/my-attendance/my-attendance-client.tsx";

if (!fs.existsSync(file)) {
  console.log(`  ! ${file} NOT FOUND — aborting`);
  process.exit(1);
}

let s = fs.readFileSync(file, "utf8");
const original = s;

// ---- 1. Widen the Range union ----
if (/type Range = [^;]*"60d"/.test(s)) {
  console.log("  = client Range already includes 60d");
} else {
  const m = s.match(/type Range = ([^;]+);/);
  if (!m) {
    console.log("  ! client Range type not found — aborting");
    process.exit(1);
  }
  // Insert "60d" right after "30d" so the union reads in order
  if (m[1].includes(`"30d"`)) {
    const widened = m[1].replace(`"30d"`, `"30d" | "60d"`);
    s = s.replace(m[0], `type Range = ${widened};`);
    console.log(`  + client Range widened: ${widened.trim()}`);
  } else {
    console.log("  ! could not locate \"30d\" inside the union — aborting");
    process.exit(1);
  }
}

// ---- 2. Add a 60d button to the option list ----
if (s.includes(`"60d"`) && /\[\s*"14d"[^\]]*"60d"/.test(s)) {
  console.log("  = 60d button already in the option list");
} else {
  const arr = s.match(/\[\s*"14d"\s*,\s*"30d"\s*,\s*"90d"\s*,\s*"custom"\s*\]/);
  if (arr) {
    s = s.replace(arr[0], `["14d", "30d", "60d", "90d", "custom"]`);
    console.log("  + 60d added to the range button list");
  } else {
    console.log(
      "  ~ option list not in the expected shape — type is fixed, but you may",
    );
    console.log(
      "    need to add the 60d button by hand (or it may already be there).",
    );
  }
}

if (s !== original) {
  fs.writeFileSync(file, s);
  console.log("\n=== written ===");
} else {
  console.log("\n=== no changes needed ===");
}
