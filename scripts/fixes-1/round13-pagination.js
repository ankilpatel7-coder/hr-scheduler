/**
 * ROUND 13 — pagination on Time off, Swaps and the Activity log.
 *
 * Time off and Swaps are client components holding the full list in state,
 * so they paginate client-side — no API or query changes at all. The Activity
 * log is server-rendered, so it gets real skip/take with ?page= links.
 *
 * Controls sit ABOVE each list ("Showing 1–25 of 87" plus prev/next), which
 * also means every anchor here is a single unambiguous line.
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

const PAGE_SIZE = 25;

// ============================================================
// 1. TIME OFF
// ============================================================
console.log("== time-off ==");
const timeOff = "src/app/[tenant]/time-off/page.tsx";

stage(
  timeOff,
  "import Pagination",
  `import LocationFilter from "@/components/location-filter";`,
  `import LocationFilter from "@/components/location-filter";
import Pagination from "@/components/pagination";`,
  `import Pagination from "@/components/pagination";`,
);

stage(
  timeOff,
  "page state + reset on filter change",
  `  const [locationFilter, setLocationFilter] = useState("");`,
  `  const [locationFilter, setLocationFilter] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = ${PAGE_SIZE};`,
  `const PAGE_SIZE = ${PAGE_SIZE};`,
);

stage(
  timeOff,
  "paginate the list",
  `            {requests.map((r) => (`,
  `            <Pagination
              page={page}
              pageSize={PAGE_SIZE}
              total={requests.length}
              onPageChange={setPage}
              label="requests"
            />
            {requests
              .slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
              .map((r) => (`,
  `total={requests.length}`,
);

// ============================================================
// 2. SWAPS — paginate the closed/history list only.
//    The open list stays whole because those need action.
// ============================================================
console.log("\n== swaps ==");
const swaps = "src/app/[tenant]/swaps/page.tsx";

stage(
  swaps,
  "import Pagination",
  `import LocationFilter from "@/components/location-filter";`,
  `import LocationFilter from "@/components/location-filter";
import Pagination from "@/components/pagination";`,
  `import Pagination from "@/components/pagination";`,
);

stage(
  swaps,
  "closed page state",
  `  const [locationFilter, setLocationFilter] = useState("");`,
  `  const [locationFilter, setLocationFilter] = useState("");
  const [closedPage, setClosedPage] = useState(1);
  const CLOSED_PAGE_SIZE = 10;`,
  `const CLOSED_PAGE_SIZE = 10;`,
);

stage(
  swaps,
  "paginate closed swaps",
  `                  {closed.slice(0, 10).map((s) => (`,
  `                  <Pagination
                    page={closedPage}
                    pageSize={CLOSED_PAGE_SIZE}
                    total={closed.length}
                    onPageChange={setClosedPage}
                    label="resolved"
                  />
                  {closed
                    .slice(
                      (closedPage - 1) * CLOSED_PAGE_SIZE,
                      closedPage * CLOSED_PAGE_SIZE,
                    )
                    .map((s) => (`,
  `total={closed.length}`,
);

// ============================================================
// 3. ACTIVITY LOG — server-side skip/take
// ============================================================
console.log("\n== activity log ==");
const log = "src/app/[tenant]/timesheets/adjustments/page.tsx";

stage(
  log,
  "import Pagination",
  `import { ArrowLeft, History, Pencil, CheckCircle2, XCircle } from "lucide-react";`,
  `import { ArrowLeft, History, Pencil, CheckCircle2, XCircle } from "lucide-react";
import Pagination from "@/components/pagination";`,
  `import Pagination from "@/components/pagination";`,
);

stage(
  log,
  "accept page param",
  `  searchParams?: { days?: string };`,
  `  searchParams?: { days?: string; page?: string };`,
  `days?: string; page?: string };`,
);

stage(
  log,
  "count + paginate the query",
  `  const entries = await prisma.clockEntry.findMany({
    where: {
      tenantId,
      clockIn: { gte: since },
      ...scope,
      OR: [
        { editNote: { not: null } },
        { approvalStatus: { not: "PENDING" } },
      ],
    },`,
  `  const PAGE_SIZE = ${PAGE_SIZE};
  const pageRaw = Number(searchParams?.page ?? 1);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;

  const logWhere = {
    tenantId,
    clockIn: { gte: since },
    ...scope,
    OR: [
      { editNote: { not: null } },
      { approvalStatus: { not: "PENDING" as const } },
    ],
  };

  const totalEntries = await prisma.clockEntry.count({ where: logWhere });

  const entries = await prisma.clockEntry.findMany({
    where: logWhere,`,
  `const totalEntries = await prisma.clockEntry.count`,
);

stage(
  log,
  "swap take for skip/take",
  `    orderBy: [{ clockIn: "desc" }],
    take: 400,
  });`,
  `    orderBy: [{ clockIn: "desc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });`,
  `skip: (page - 1) * PAGE_SIZE,`,
);

stage(
  log,
  "render pagination control",
  `        {entries.length === 0 ? (`,
  `        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          total={totalEntries}
          hrefFor={(p) =>
            \`/\${params.tenant}/timesheets/adjustments?days=\${days}&page=\${p}\`
          }
          label="events"
        />

        {entries.length === 0 ? (`,
  `total={totalEntries}`,
);

stage(
  log,
  "drop the 400-row notice",
  `        {entries.length >= 400 && (
          <p className="text-[11px] text-smoke mt-3">
            Showing the 400 most recent. Narrow the period to see older entries.
          </p>
        )}`,
  ``,
  `Narrow the period to see older entries.`,
);

// Period links must reset to page 1
stage(
  log,
  "period links reset to page 1",
  `              href={\`/\${params.tenant}/timesheets/adjustments?days=\${d}\`}`,
  `              href={\`/\${params.tenant}/timesheets/adjustments?days=\${d}&page=1\`}`,
  `?days=\${d}&page=1\``,
);

if (failed > 0) {
  console.log(`\n!! ${failed} hunk(s) failed — NOTHING written.`);
  process.exit(1);
}
for (const [f, c] of pending) fs.writeFileSync(f, c);
console.log(`\n=== ${ok} hunk(s) across ${pending.size} file(s) ===`);
