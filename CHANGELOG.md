# Shiftwork — v1.0.0

First production release. Multi-tenant SaaS for HR scheduling, time-tracking,
payroll, document management, and attendance analytics.

---

## 🆕 New features

### Multi-tenant + roles
- Multi-tenant architecture with per-tenant data isolation
- Role hierarchy: SUPER_ADMIN · ADMIN · MANAGER · LEAD · EMPLOYEE
- Manager role audit: location-scoped schedule + employee management; locations + payroll + settings stay admin-only

### Payroll
- Multi-state payroll engine (Kentucky + Nevada to start, dispatcher pattern for adding states)
- Louisville Metro local occupational tax (2.2%)
- Pre-tax deductions: 401(k) percent/dollar, Section 125 (health/HSA/FSA)
- FLSA-compliant overtime per workweek (Sun–Sat)
- Per-location LLC support (paystubs use location-specific EIN, legal name, address)
- Encrypted SSN storage (AES-256-GCM)
- Year-end forms: W-2 (Copy B/C/D PDF) and 941 (Quarterly PDF)
- Admin can delete finalized pay periods with audit trail

### Documents
- Document signing system with PDF preview + signature canvas
- Folder management with nested folders, color tags, drag-and-drop
- Bulk actions: move, archive, mark required/optional
- Versioning: replace a doc with a new PDF; signed sigs stay with old version, pending sigs migrate forward
- Flexible assignment: all employees / by location / specific picks / add-more-later
- Required-doc gating: blocks clock-in until signed
- Auto-waive pending signatures when employee is archived

### Attendance
- Admin scoreboard at `/attendance` with 0–100 reliability score and letter grade (A+ to F)
- Per-shift detail rows with status icons (on-time / early / late / missed)
- Day / Week / Month / Custom date range filters
- Bar chart: scheduled vs actual hours per person
- Admin "Ignore shift" for legitimate exceptions (e.g. new hire onboarding)
- Employee `/my-attendance` view with stars, streak counter, grade badge

### Scheduling
- Real-time schedule grid with drag-to-copy, paste, role grouping
- Schedule templates: save week patterns, apply to any future week
- Calendar events (holidays, meetings, shop-closed days)
- Labor budget tracking per day + weekly
- Hide house shifts behind a tenant setting (default off)
- Schedule PDF download (clean tabular, location-filtered, totals row)

### Clock + breaks
- Selfie + geolocation on clock-in
- 4-digit PIN login for mobile kiosks
- Daily clock approval workflow (PENDING / APPROVED / REJECTED)
- Break tracking: 10-min paid · 30-min meal (unpaid) · other
- Selfie required when starting a break (tenant toggle)
- Tenant toggle: require clock approval or auto-approve
- Manual entry: cascading location → employee + break entry inline
- Auto-approve when admin creates manual entries

### Time-off + swaps
- Time-off requests with admin approval queue
- Admin can create on-behalf-of any employee (auto-approved)
- Shift swap marketplace
- Auto-unassign future shifts when employee is archived (become house shifts)

### AI (free tier — Groq Llama 3.3 70B)
- Payroll Explainer: plain-English breakdown of how a paystub was computed
- Document Q&A chatbot with keyword-retrieval chunking + citations
- Schedule anomaly detection (background scan)

### Dashboard
- Live operations console with KPIs, charts, today's roster
- Page-wide location filter (defaults to last-picked, persists in localStorage)
- Pending documents banner for employees
- Premium UI: glassy navbar, gradient KPI tiles, animated charts

---

## 🎨 UI / UX polish
- Tailwind theme: ink / smoke / rust / moss / paper / dust palette
- Gradient text + display headings
- Mobile slide-out nav drawer
- All time values formatted in tenant's timezone
- Default location filter on every relevant page

## 🔒 Security
- Block archived/inactive users from login (email/password + kiosk PIN paths)
- Surface specific Zod field names in validation errors (no more "Invalid input")
- Tenant scoping enforced at every API route
- Encrypted SSN storage; decryption only at filing time

## 🤖 Stack notes
- Next.js 14.2 App Router
- Prisma 5.22 + Neon Postgres (pooled)
- NextAuth (JWT strategy)
- Recharts for dashboards
- @dnd-kit for drag-and-drop
- jsPDF + jspdf-autotable for tabular PDFs
- react-signature-canvas for document signatures
- unpdf for PDF text extraction (serverless-friendly)
- Vercel Blob for file storage
- Groq SDK for AI

## 🐛 Notable bug fixes
- Time-off dates no longer drift by viewer timezone
- Schedule PDF excludes archived employees + house shifts
- Payroll/timesheet hours match to sub-second precision
- Sign button on docs opens modal in-place (was bouncing to home)
- Roster forward arrow navigates reliably (hard nav fallback)
- Doc kebab menu flips upward when near viewport bottom

---

## Migration notes
Major schema additions since v11:
- `Tenant`, `DocumentFolder`, `DocumentSignature`, `Break`, `PayPeriod`, `PayStub`, `CalendarEvent`, `ScheduleTemplate`, `LaborBudget`, `ShiftRole`, `ShiftTag`, `AnomalyFlag` models
- `User`: tenantId, W-4 fields, primaryLocationId, pre-tax deductions, ssnEncrypted, pinHash, jobRole
- `Shift`: tagId, attendanceIgnored/Reason
- `Location`: per-location LLC fields, lat/lng, geofence radius

Run `npx prisma db push` against the production database before deploying v1.0.0.
