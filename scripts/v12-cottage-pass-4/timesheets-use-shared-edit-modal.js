/**
 * Wire the timesheets page to the shared EditEntryModal so break editing
 * works from the main Timesheets view (not just the approval queue).
 *
 * Three changes:
 *   1. Import the shared EditEntryModal component
 *   2. Extend the Entry.breaks type to include the id field (needed so the
 *      shared modal can PATCH existing breaks instead of duplicating them)
 *   3. Delete the inline EditEntryModal function (~874 to end of body)
 *   4. Rewrite the JSX call site to pass the shared modal's prop shape
 *
 * Idempotent.
 */

const fs = require("fs");
const file = "src/app/[tenant]/timesheets/page.tsx";

if (!fs.existsSync(file)) {
  console.log(`  ! ${file} not found`);
  process.exit(1);
}

let s = fs.readFileSync(file, "utf8");
let changes = 0;

// -----------------------------------------------------------------
// 1. Add import
// -----------------------------------------------------------------
if (s.includes('from "@/components/edit-entry-modal"')) {
  console.log("  = import already present");
} else {
  const anchor = `import ManualEntryModal from "@/components/manual-entry-modal";`;
  const replacement = `${anchor}\nimport EditEntryModal from "@/components/edit-entry-modal";`;
  if (s.includes(anchor)) {
    s = s.replace(anchor, replacement);
    console.log("  + import added");
    changes++;
  } else {
    console.log("  ! ManualEntryModal import anchor not found — please add EditEntryModal import manually");
  }
}

// -----------------------------------------------------------------
// 2. Expand Entry.breaks type to include id
// -----------------------------------------------------------------
const oldBreaksType = `breaks?: { breakStart: string; breakEnd: string | null; breakType: "SHORT_15" | "MEAL_30" | "OTHER" }[];`;
const newBreaksType = `breaks?: { id?: string; breakStart: string; breakEnd: string | null; breakType: "SHORT_15" | "MEAL_30" | "OTHER" }[];`;
if (s.includes(newBreaksType)) {
  console.log("  = Entry.breaks already has id field");
} else if (s.includes(oldBreaksType)) {
  s = s.replace(oldBreaksType, newBreaksType);
  console.log("  + Entry.breaks type expanded with id");
  changes++;
} else {
  console.log("  ! Entry.breaks type anchor not found — check the type manually");
}

// -----------------------------------------------------------------
// 3. Delete inline EditEntryModal function (brace-tracked)
// -----------------------------------------------------------------
const funcStart = s.indexOf("function EditEntryModal({");
if (funcStart === -1) {
  console.log("  = inline EditEntryModal already removed");
} else {
  // Find end of signature: `}) {` pattern
  const sigEnd = s.indexOf("}) {", funcStart);
  if (sigEnd === -1) {
    console.log("  ! couldn't find end of function signature");
  } else {
    const bodyStart = sigEnd + 3; // index of the body's `{`
    let depth = 1;
    let i = bodyStart + 1;
    while (i < s.length && depth > 0) {
      const ch = s[i];
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
      if (depth === 0) break;
      i++;
    }
    if (depth !== 0) {
      console.log("  ! couldn't find matching } for function body");
    } else {
      let end = i + 1; // one past the final `}`
      // Consume any trailing newline
      if (s[end] === "\n") end++;
      // Also consume any leading blank line so we don't leave a stray gap
      let start = funcStart;
      if (start > 0 && s[start - 1] === "\n" && s[start - 2] === "\n") {
        start--;
      }
      s = s.slice(0, start) + s.slice(end);
      console.log("  + inline EditEntryModal function removed");
      changes++;
    }
  }
}

// -----------------------------------------------------------------
// 4. Update JSX call site
// -----------------------------------------------------------------
const oldCall = `        <EditEntryModal
          entry={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />`;

const newCall = `        <EditEntryModal
          entryId={editing.id}
          displayName={editing.user.name}
          clockIn={editing.clockIn}
          clockOut={editing.clockOut}
          breaks={(editing.breaks ?? []).map((b: any) => ({
            id: b.id,
            breakStart: b.breakStart,
            breakEnd: b.breakEnd,
            breakType: b.breakType,
          }))}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />`;

if (s.includes("entryId={editing.id}")) {
  console.log("  = call site already using new props");
} else if (s.includes(oldCall)) {
  s = s.replace(oldCall, newCall);
  console.log("  + call site rewritten to use shared modal props");
  changes++;
} else {
  console.log("  ! call site anchor didn't match — checking indentation…");
  // Fallback: try with 6-space indent
  const oldCall6 = oldCall.replace(/^ {8}/gm, "      ");
  if (s.includes(oldCall6)) {
    const newCall6 = newCall.replace(/^ {8}/gm, "      ");
    s = s.replace(oldCall6, newCall6);
    console.log("  + call site rewritten (6-space indent)");
    changes++;
  } else {
    console.log("  ! could not find call site — please update manually");
  }
}

fs.writeFileSync(file, s);
console.log(`\n${changes} change(s) written`);
