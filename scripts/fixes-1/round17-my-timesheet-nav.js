/**
 * ROUND 17 — add "My timesheet" to the sidebar.
 *
 * Appears for employees (after My shifts) and for admins/managers in the
 * "My work" section, since they work shifts too.
 *
 * Also fixes the my-attendance range bug: the server only understood
 * 14d / 30d / 90d and fell through to 90 for anything else, so a 60-day
 * button silently returned 90 days.
 *
 * Idempotent. Aborts without writing if an anchor fails.
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
  if (marker && s.includes(marker)) {
    console.log(`  = ${name}: already applied`);
    pending.set(file, s);
    return;
  }
  if (!s.includes(find)) {
    console.log(`  ! ${name}: ANCHOR NOT FOUND`);
    failed++;
    return;
  }
  pending.set(file, s.replace(find, replace));
  console.log(`  + ${name}`);
  ok++;
}

// ============================================================
// 1. Nav entries
// ============================================================
console.log("== nav-items.ts ==");
const nav = "src/components/app-shell/nav-items.ts";

stage(
  nav,
  "employee: My timesheet",
  `  {
    label: "Clock",
    href: (t) => \`/\${t}/clock\`,
    icon: ShieldCheck,
    roles: ["EMPLOYEE"],
  },`,
  `  {
    label: "My timesheet",
    href: (t) => \`/\${t}/my-timesheet\`,
    icon: Clock,
    roles: ["EMPLOYEE"],
  },
  {
    label: "Clock",
    href: (t) => \`/\${t}/clock\`,
    icon: ShieldCheck,
    roles: ["EMPLOYEE"],
  },`,
  `label: "My timesheet",\n    href: (t) => \`/\${t}/my-timesheet\`,\n    icon: Clock,\n    roles: ["EMPLOYEE"],`,
);

stage(
  nav,
  "admin/manager: My timesheet",
  `  {
    label: "My attendance",
    href: (t) => \`/\${t}/my-attendance\`,
    icon: UserCheck,
    roles: ["ADMIN", "MANAGER"],
  },`,
  `  {
    label: "My timesheet",
    href: (t) => \`/\${t}/my-timesheet\`,
    icon: Clock,
    roles: ["ADMIN", "MANAGER"],
  },
  {
    label: "My attendance",
    href: (t) => \`/\${t}/my-attendance\`,
    icon: UserCheck,
    roles: ["ADMIN", "MANAGER"],
  },`,
  `roles: ["ADMIN", "MANAGER"],\n  },\n  {\n    label: "My attendance",`,
);

// ============================================================
// 2. Sidebar section list
// ============================================================
console.log("\n== sidebar.tsx ==");
stage(
  "src/components/app-shell/sidebar.tsx",
  "My work section includes My timesheet",
  `  { title: "My work", labels: ["Clock", "My shifts", "My attendance", "My documents"] },`,
  `  { title: "My work", labels: ["Clock", "My shifts", "My timesheet", "My attendance", "My documents"] },`,
  `"My shifts", "My timesheet", "My attendance"`,
);

// ============================================================
// 3. my-attendance range fix
// ============================================================
console.log("\n== my-attendance range ==");
const att = "src/app/[tenant]/my-attendance/page.tsx";

stage(
  att,
  "Range type accepts 60d",
  `type Range = "14d" | "30d" | "90d" | "custom";`,
  `type Range = "14d" | "30d" | "60d" | "90d" | "custom";`,
  `"30d" | "60d" | "90d"`,
);

stage(
  att,
  "resolveRange handles every option",
  `  const days = range === "14d" ? 14 : range === "30d" ? 30 : 90;
  return { from: startOfDay(subDays(today, days)), to: today };`,
  `  // Parse the leading number out of the range key so any Nd value works and
  // an unknown value falls back to 14 rather than silently returning 90.
  const parsed = parseInt(String(range), 10);
  const days = Number.isFinite(parsed) && parsed > 0 ? parsed : 14;
  return { from: startOfDay(subDays(today, days)), to: today };`,
  `const parsed = parseInt(String(range), 10);`,
);

if (failed > 0) {
  console.log(`\n!! ${failed} hunk(s) failed — NOTHING written.`);
  process.exit(1);
}
for (const [f, c] of pending) fs.writeFileSync(f, c);
console.log(`\n=== ${ok} hunk(s) across ${pending.size} file(s) ===`);
