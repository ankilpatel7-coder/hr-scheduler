/**
 * ROUND 10 — the last two UI entry points.
 *
 *   a) Settings → Tenant preferences gains a "Show weekly schedule on
 *      dashboard" toggle, matching the existing Toggle pattern in the panel.
 *   b) Schedule page header gains a "Deleted" link to the recycle bin.
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
// a) Settings toggle
// ============================================================
console.log("== tenant-prefs-panel.tsx ==");
const panel = "src/components/tenant-prefs-panel.tsx";

stage(
  panel,
  "import CalendarDays icon",
  `import { Building2, Camera, Loader2, Check, AlertCircle } from "lucide-react";`,
  `import { Building2, Camera, Loader2, Check, AlertCircle, CalendarDays } from "lucide-react";`,
  `AlertCircle, CalendarDays }`,
);

stage(
  panel,
  "state for the new flag",
  `  const [requireBreakSelfie, setRequireBreakSelfie] = useState(true);`,
  `  const [requireBreakSelfie, setRequireBreakSelfie] = useState(true);
  const [showScheduleOnDashboard, setShowScheduleOnDashboard] = useState(false);`,
  `const [showScheduleOnDashboard, setShowScheduleOnDashboard]`,
);

stage(
  panel,
  "load the flag",
  `          setRequireBreakSelfie(j.tenant.requireBreakSelfie ?? true);`,
  `          setRequireBreakSelfie(j.tenant.requireBreakSelfie ?? true);
          setShowScheduleOnDashboard(!!j.tenant.showScheduleOnDashboard);`,
  `setShowScheduleOnDashboard(!!j.tenant.showScheduleOnDashboard);`,
);

stage(
  panel,
  "render the toggle",
  `          {saving && (
            <div className="inline-flex items-center gap-1.5 text-xs text-smoke">`,
  `          <Toggle
            label="Show weekly schedule on dashboard"
            description="Everyone — including employees — sees a read-only week grid on their dashboard. Each person only sees locations they're assigned to."
            icon={<CalendarDays size={14} />}
            checked={showScheduleOnDashboard}
            disabled={saving}
            onChange={(v) => {
              setShowScheduleOnDashboard(v);
              save("showScheduleOnDashboard", v);
            }}
          />

          {saving && (
            <div className="inline-flex items-center gap-1.5 text-xs text-smoke">`,
  `label="Show weekly schedule on dashboard"`,
);

// ============================================================
// b) Recycle bin link on the schedule page
// ============================================================
console.log("\n== schedule page header ==");
const schedule = "src/app/[tenant]/schedule/page.tsx";

stage(
  schedule,
  "Deleted shifts link",
  `            <button className="btn btn-secondary !p-2" onClick={() => setWeekStart(addDays(weekStart, 7))}><ChevronRight size={16} /></button>`,
  `            <button className="btn btn-secondary !p-2" onClick={() => setWeekStart(addDays(weekStart, 7))}><ChevronRight size={16} /></button>
            <a
              href={\`/\${typeof window !== "undefined" ? window.location.pathname.split("/")[1] : ""}/schedule/recycle-bin\`}
              className="btn btn-secondary print:hidden"
              title="Restore recently deleted shifts (admin only)"
            >
              <Trash2 size={14} /> Deleted
            </a>`,
  `/schedule/recycle-bin\``,
);

// Make sure Trash2 is imported on the schedule page
{
  const s = pending.has(schedule)
    ? pending.get(schedule)
    : fs.existsSync(schedule)
      ? fs.readFileSync(schedule, "utf8")
      : null;
  if (s === null) {
    console.log(`  ! ${schedule}: NOT FOUND`);
    failed++;
  } else if (/\bTrash2\b/.test(s.split("\n").slice(0, 60).join("\n"))) {
    console.log("  = Trash2 already imported");
  } else {
    const m = s.match(/import \{([^}]*)\} from "lucide-react";/);
    if (!m) {
      console.log("  ! lucide-react import not found on schedule page");
      failed++;
    } else {
      const updated = s.replace(
        m[0],
        `import {${m[1].replace(/\s*$/, "")}, Trash2 } from "lucide-react";`,
      );
      pending.set(schedule, updated);
      console.log("  + Trash2 imported");
      ok++;
    }
  }
}

if (failed > 0) {
  console.log(`\n!! ${failed} hunk(s) failed — NOTHING written.`);
  process.exit(1);
}
for (const [f, c] of pending) fs.writeFileSync(f, c);
console.log(`\n=== ${ok} hunk(s) across ${pending.size} file(s) ===`);
