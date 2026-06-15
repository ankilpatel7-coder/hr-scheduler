/**
 * Add Personal docs section to the employee /my-documents page.
 *
 *   1. SigRow type gets `requireSignature: boolean`
 *   2. Server passes through requireSignature from doc.requireSignature
 *   3. Client splits rows into personal (requireSignature=false) + signing
 *      (requireSignature=true). Personal docs render in a top card with
 *      simple "View PDF" links. Signing docs stay in folder sections.
 *
 * Idempotent.
 */

const fs = require("fs");
let total = 0;
function patch(file, name, find, replace, marker) {
  if (!fs.existsSync(file)) { console.log(`  - ${file}: not found`); return; }
  let s = fs.readFileSync(file, "utf8");
  if (marker && s.includes(marker)) { console.log(`  = ${file}: ${name}`); return; }
  if (!s.includes(find)) { console.log(`  ! ${file}: ${name} anchor not found`); return; }
  s = s.replace(find, replace);
  fs.writeFileSync(file, s);
  console.log(`  + ${file}: ${name}`);
  total++;
}

// ─── 1. SigRow type ─────────────────────────────────────────────
const clientFile = "src/app/[tenant]/my-documents/my-docs-client.tsx";
patch(
  clientFile,
  "add requireSignature to SigRow type",
  `  required: boolean;
  version: number;`,
  `  required: boolean;
  requireSignature: boolean;
  version: number;`,
  `requireSignature: boolean;\n  version: number;`,
);

// ─── 2. Server-side row mapping ─────────────────────────────────
const pageFile = "src/app/[tenant]/my-documents/page.tsx";
patch(
  pageFile,
  "server includes requireSignature in row",
  `    required: s.document.required,
    version: s.document.version,`,
  `    required: s.document.required,
    requireSignature: s.document.requireSignature,
    version: s.document.version,`,
  `requireSignature: s.document.requireSignature,`,
);

// ─── 3. Client: split rows + render Personal section ───────────
// Insert just before the existing groupMap loop
patch(
  clientFile,
  "split rows + render Personal section at top",
  `export default function MyDocsClient({ rows }: { rows: SigRow[] }) {
  const router = useRouter();
  const [signing, setSigning] = useState<SigRow | null>(null);

  // Group by folder
  const groupMap = new Map<string, FolderGroup>();
  for (const r of rows) {`,
  `export default function MyDocsClient({ rows }: { rows: SigRow[] }) {
  const router = useRouter();
  const [signing, setSigning] = useState<SigRow | null>(null);

  // Split out personal (view-only) docs — they go in a dedicated section
  // at the top and aren't part of the signing folder groups.
  const personalRows = rows.filter((r) => r.requireSignature === false);
  const signingRows = rows.filter((r) => r.requireSignature !== false);

  // Group SIGNING docs by folder
  const groupMap = new Map<string, FolderGroup>();
  for (const r of signingRows) {`,
  `const personalRows = rows.filter`,
);

// ─── 4. Insert the Personal card render right after the page title ─
//    Need to find a stable anchor in the JSX. The component returns starting
//    with <div className="min-h-screen">.
patch(
  clientFile,
  "render Personal card above folder groups",
  `      {groups.length === 0 ? (`,
  `      {personalRows.length > 0 && (
        <div className="card p-5 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <FileText size={16} className="text-rust" />
            <h2 className="display text-lg text-ink">Personal documents</h2>
            <span className="chip">{personalRows.length}</span>
          </div>
          <p className="text-xs text-smoke mb-3">
            These are for your eyes only. Paystubs, personal letters, etc.
          </p>
          <ul className="divide-y divide-ink/5">
            {personalRows.map((r) => (
              <li key={r.id} className="py-2 flex items-center gap-3">
                <FileText size={14} className="text-smoke shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-ink truncate">{r.title}</div>
                  {r.description && (
                    <div className="text-[11px] text-smoke truncate">{r.description}</div>
                  )}
                </div>
                <a
                  href={r.fileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-secondary !py-1 !text-xs inline-flex items-center gap-1"
                >
                  <ExternalLink size={12} /> View PDF
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {groups.length === 0 && personalRows.length === 0 ? (`,
  `Personal documents</h2>`,
);

// We changed the conditional opener — also need to update the closing else.
// The original was `groups.length === 0 ? (...) : (...)`. We now have
// `groups.length === 0 && personalRows.length === 0 ? (empty) : (groups)`.
// The original "no docs" message is fine to keep.

console.log(`\n=== ${total} change(s) ===`);
