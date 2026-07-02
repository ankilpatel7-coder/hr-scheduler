/**
 * Add Calendar link to the employee sidebar nav so employees can see
 * company events and holidays.
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
const before = s;

if (s.includes("EMPLOYEE_ITEMS") && /label:\s*"Calendar"[\s\S]*roles:\s*\[\s*"EMPLOYEE"/.test(s)) {
  console.log("  = Calendar already in EMPLOYEE_ITEMS");
  process.exit(0);
}

// Insert Calendar entry right before Availability in EMPLOYEE_ITEMS
const anchor = `  {
    label: "Availability",
    href: (t) => \`/\${t}/availability\`,
    icon: ClipboardList,
    roles: ["EMPLOYEE"],
  },`;

const replacement = `  {
    label: "Calendar",
    href: (t) => \`/\${t}/calendar\`,
    icon: CalendarRange,
    roles: ["EMPLOYEE"],
  },
  {
    label: "Availability",
    href: (t) => \`/\${t}/availability\`,
    icon: ClipboardList,
    roles: ["EMPLOYEE"],
  },`;

if (s.includes(anchor)) {
  s = s.replace(anchor, replacement);
  console.log("  + Calendar added to EMPLOYEE_ITEMS");
} else {
  console.log("  ! Availability anchor not found — please add Calendar manually");
  process.exit(1);
}

if (s !== before) {
  fs.writeFileSync(file, s);
  console.log("\nWritten.");
}
