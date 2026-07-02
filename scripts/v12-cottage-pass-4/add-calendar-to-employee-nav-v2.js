/**
 * Actually add Calendar to EMPLOYEE_ITEMS — v1 script had a too-loose
 * idempotency check that matched the ADMIN Calendar entry and bailed
 * without patching the employee array.
 *
 * v2: parse the EMPLOYEE_ITEMS array bounds by bracket-tracking, then
 * check for Calendar ONLY within that slice, then insert after the first
 * item.
 *
 * Idempotent.
 */

const fs = require("fs");
const file = "src/components/app-shell/nav-items.ts";

if (!fs.existsSync(file)) {
  console.log(`  ! ${file} not found`);
  process.exit(1);
}

let s = fs.readFileSync(file, "utf8");

// Locate the EMPLOYEE_ITEMS array
const startPattern = /export const EMPLOYEE_ITEMS[^=]*=\s*\[/;
const startMatch = s.match(startPattern);
if (!startMatch) {
  console.log("  ! EMPLOYEE_ITEMS not found");
  process.exit(1);
}
const arrayContentStart = startMatch.index + startMatch[0].length;

// Bracket-track to find matching ]
let depth = 1;
let i = arrayContentStart;
while (i < s.length && depth > 0) {
  const ch = s[i];
  if (ch === "[") depth++;
  else if (ch === "]") depth--;
  if (depth === 0) break;
  i++;
}
if (depth !== 0) {
  console.log("  ! couldn't find matching ] for EMPLOYEE_ITEMS");
  process.exit(1);
}
const arrayContentEnd = i;
const arrayContent = s.slice(arrayContentStart, arrayContentEnd);

// Idempotency — check for Calendar ONLY inside EMPLOYEE_ITEMS
if (/label:\s*"Calendar"/.test(arrayContent)) {
  console.log("  = Calendar already inside EMPLOYEE_ITEMS");
  process.exit(0);
}

// Find first `},` inside the array — insertion goes right after
const firstItemEndRe = /\},/g;
firstItemEndRe.lastIndex = arrayContentStart;
const firstItemEndMatch = firstItemEndRe.exec(s);
if (
  !firstItemEndMatch ||
  firstItemEndMatch.index >= arrayContentEnd
) {
  console.log("  ! couldn't find an insertion anchor inside EMPLOYEE_ITEMS");
  process.exit(1);
}

let insertAt = firstItemEndMatch.index + firstItemEndMatch[0].length;
if (s[insertAt] === "\n") insertAt++;

const calendarEntry = `  {
    label: "Calendar",
    href: (t) => \`/\${t}/calendar\`,
    icon: CalendarRange,
    roles: ["EMPLOYEE"],
  },
`;

const patched = s.slice(0, insertAt) + calendarEntry + s.slice(insertAt);
fs.writeFileSync(file, patched);
console.log("  + Calendar inserted into EMPLOYEE_ITEMS (after Dashboard)");
