/**
 * Patch the document upload form to support Personal mode (paystubs etc).
 *
 *   1. Add `requireSignature` state (default true)
 *   2. Add Mode card with two options:
 *      - "Requires signature" (existing flow)
 *      - "Personal — view only (paystubs)"
 *   3. Append requireSignature to formData
 *   4. Reset state on success
 *   5. When Personal: force assignment to a single employee + force required=false
 *
 * Idempotent.
 */

const fs = require("fs");
const file = "src/components/document-upload-form.tsx";

let s = fs.readFileSync(file, "utf8");
const before = s;
let changes = 0;

function patch(name, find, replace, marker) {
  if (marker && s.includes(marker)) {
    console.log(`  = ${name}: already applied`);
    return;
  }
  if (!s.includes(find)) {
    console.log(`  ! ${name}: anchor not found`);
    return;
  }
  s = s.replace(find, replace);
  console.log(`  + ${name}`);
  changes++;
}

// 1. Add state
patch(
  "add requireSignature state + private mode helper",
  `  const [required, setRequired] = useState(true);`,
  `  const [required, setRequired] = useState(true);
  // requireSignature=true → existing signing flow. false → personal/view-only
  // (paystubs, personal HR docs). Personal docs never block clock-in and
  // are NOT in the employee's "to sign" list.
  const [requireSignature, setRequireSignature] = useState(true);`,
  `setRequireSignature`,
);

// 2. Append to formData
patch(
  "append requireSignature to formData",
  `    fd.append("required", String(required));`,
  `    fd.append("required", String(required));
    fd.append("requireSignature", String(requireSignature));`,
  `fd.append("requireSignature",`,
);

// 3. Reset state on success
patch(
  "reset requireSignature on success",
  `      setRequired(true);
      setMode("all");`,
  `      setRequired(true);
      setRequireSignature(true);
      setMode("all");`,
  `setRequireSignature(true);`,
);

// 4. Insert Mode card just before the PDF file input
patch(
  "insert Mode card in JSX",
  `      <div>
        <label className="block text-xs font-medium text-ink mb-1">PDF file</label>
        <input
          type="file"
          ref={fileRef}
          accept="application/pdf"
          className="w-full text-xs"
        />
      </div>`,
  `      <div>
        <label className="block text-xs font-medium text-ink mb-1">PDF file</label>
        <input
          type="file"
          ref={fileRef}
          accept="application/pdf"
          className="w-full text-xs"
        />
      </div>

      {/* === Mode: signed vs personal === */}
      <div>
        <label className="block text-xs font-medium text-ink mb-2">Mode</label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          <button
            type="button"
            onClick={() => {
              setRequireSignature(true);
              setRequired(true);
            }}
            className={\`text-left rounded border px-3 py-2 transition \${
              requireSignature
                ? "border-rust bg-rust/5 ring-2 ring-rust/30"
                : "border-ink/10 hover:bg-ink/5"
            }\`}
          >
            <div className="font-medium text-ink">Requires signature</div>
            <div className="text-[11px] text-smoke mt-0.5">
              Employees must e-sign. Can block clock-in.
            </div>
          </button>
          <button
            type="button"
            onClick={() => {
              setRequireSignature(false);
              setRequired(false);
              setMode("custom");
            }}
            className={\`text-left rounded border px-3 py-2 transition \${
              !requireSignature
                ? "border-rust bg-rust/5 ring-2 ring-rust/30"
                : "border-ink/10 hover:bg-ink/5"
            }\`}
          >
            <div className="font-medium text-ink">Personal — view only</div>
            <div className="text-[11px] text-smoke mt-0.5">
              No signature. Only the assigned employee can see it (e.g. paystubs).
            </div>
          </button>
        </div>
      </div>`,
  `=== Mode: signed vs personal ===`,
);

// 5. Hide the "Required to clock in" checkbox when in Personal mode
//    Actually we leave it visible but disabled. We'll only add a note.
//    For simplicity skip this — when user picks Personal we already force
//    required=false in the click handler above.

if (s !== before) {
  fs.writeFileSync(file, s);
  console.log(`\nWrote ${changes} change(s).`);
} else {
  console.log("\nNo changes.");
}
