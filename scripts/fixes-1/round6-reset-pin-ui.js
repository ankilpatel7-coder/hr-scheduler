/**
 * ROUND 6 — "Reset PIN" button on the employee detail page.
 *
 * The API (POST /api/employees/[id]/pin) already exists and, as of round 5,
 * generates a collision-free PIN. This only adds the UI.
 *
 * Placed in the existing action row beside Edit, gated on canEditAll so
 * managers/admins see it but an employee viewing their own profile does not
 * (they use /change-pin instead).
 *
 * Idempotent. Aborts without writing if an anchor fails.
 */

const fs = require("fs");
const file = "src/app/[tenant]/employees/[id]/page.tsx";

if (!fs.existsSync(file)) {
  console.log(`  ! ${file} NOT FOUND — aborting`);
  process.exit(1);
}

let s = fs.readFileSync(file, "utf8");
const original = s;
let ok = 0;
let failed = 0;

function hunk(name, find, replace, marker) {
  if (marker && s.includes(marker)) {
    console.log(`  = ${name}: already applied`);
    return;
  }
  if (!s.includes(find)) {
    console.log(`  ! ${name}: ANCHOR NOT FOUND`);
    failed++;
    return;
  }
  s = s.replace(find, replace);
  console.log(`  + ${name}`);
  ok++;
}

// ---- 1. import the component ----
hunk(
  "import ResetPinButton",
  `import { format } from "date-fns";`,
  `import { format } from "date-fns";
import ResetPinButton from "@/components/reset-pin-button";`,
  `import ResetPinButton from "@/components/reset-pin-button";`,
);

// ---- 2. add the button to the action row ----
hunk(
  "Reset PIN button in action row",
  `            <div className="flex gap-2 flex-shrink-0">
              {(canEditAll || canEditSelf) && (
                <button onClick={() => setEditing(true)} className="btn btn-secondary">
                  <Edit3 size={14} /> Edit
                </button>
              )}
            </div>`,
  `            <div className="flex gap-2 flex-shrink-0">
              {(canEditAll || canEditSelf) && (
                <button onClick={() => setEditing(true)} className="btn btn-secondary">
                  <Edit3 size={14} /> Edit
                </button>
              )}
              {canEditAll && (
                <ResetPinButton
                  employeeId={profile.id}
                  employeeName={profile.name || profile.email}
                />
              )}
            </div>`,
  `<ResetPinButton`,
);

if (failed > 0) {
  console.log(`\n!! ${failed} hunk(s) failed — NOTHING written.`);
  process.exit(1);
}

if (s !== original) {
  fs.writeFileSync(file, s);
  console.log(`\n=== ${ok} hunk(s) applied ===`);
} else {
  console.log("\n=== no changes needed ===");
}
