/**
 * Cottage theme + sidebar nav conversion.
 *
 *   1. Remap tailwind tokens:
 *        bone   #fafbfc → #FAF6EE  (cream page bg)
 *        paper  #ffffff stays
 *        ink    #0f172a → #2C2C2A  (warm dark)
 *        smoke  #64748b → #7A7872  (warm secondary)
 *        dust   #e2e8f0 → #E5DECF  (warm border)
 *        rust   #6366f1 → #C99A2C  (HARVEST GOLD accent)
 *        moss   #10b981 → #3B6D11  (deep green success)
 *        glow   #8b5cf6 → #1F3A2E  (forest — reused as decorative)
 *        amber  #f59e0b → #BA7517  (warmer)
 *        rose   #ef4444 stays
 *        steel  #f1f5f9 → #F0EBE0  (warm raised surface)
 *      Plus new tokens: forest, forest-text, forest-muted, gold-on
 *
 *   2. Warm-tinted shadows + gold-tinted focus ring (shadow-glow → gold)
 *
 *   3. Create src/components/app-shell/{nav-items.ts, sidebar.tsx, app-shell.tsx}
 *
 *   4. Patch src/app/[tenant]/layout.tsx to fetch the user and wrap children
 *      in <AppShell>. Bare-children layouts (clock kiosk, mobile pages) are
 *      handled inside AppShell via pathname check.
 *
 * Idempotent — re-runnable.
 */

const fs = require("fs");
const path = require("path");

let total = 0;
function patch(file, name, find, replace, marker) {
  if (!fs.existsSync(file)) { console.log(`  - ${file}: not found`); return false; }
  let s = fs.readFileSync(file, "utf8");
  if (marker && s.includes(marker)) { console.log(`  = ${file}: ${name}`); return true; }
  if (!s.includes(find)) { console.log(`  ! ${file}: ${name} anchor not found`); return false; }
  s = s.replace(find, replace);
  fs.writeFileSync(file, s);
  console.log(`  + ${file}: ${name}`);
  total++;
  return true;
}

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file)) { console.log(`  = ${file}: exists, skipping`); return; }
  fs.writeFileSync(file, content);
  console.log(`  + ${file}`);
  total++;
}

// ============================================================
// 1. Tailwind config — remap colors + shadows
// ============================================================
console.log("== Tailwind config ==");

patch(
  "tailwind.config.ts",
  "colors block → Cottage palette",
  `      colors: {
        // Token names preserved from prior versions so component classes still work.
        // LIGHT THEME: Linear-structure (cool grays, restrained) + Stripe-data (white cards, indigo accents)
        bone: "#fafbfc",       // page background — cool off-white (Linear-style)
        paper: "#ffffff",      // surface card — pure white (Stripe data tables)
        ink: "#0f172a",        // primary text — rich slate-black
        smoke: "#64748b",      // secondary text — neutral cool gray
        dust: "#e2e8f0",       // borders — soft cool gray, visible but understated
        rust: "#6366f1",       // primary accent — indigo (consistent with prior versions)
        moss: "#10b981",       // success — emerald
        glow: "#8b5cf6",       // accent highlight — slightly purpler indigo
        amber: "#f59e0b",      // warnings
        rose: "#ef4444",       // errors
        steel: "#f1f5f9",      // raised/hover surface — pale cool blue-gray
      },`,
  `      colors: {
        // COTTAGE theme — warm cream surfaces, deep forest sidebar, harvest gold accent.
        // Token names preserved from prior versions so component classes still work.
        bone: "#FAF6EE",          // page background — warm cream
        paper: "#FFFFFF",         // surface card — pure white
        ink: "#2C2C2A",           // primary text — warm dark
        smoke: "#7A7872",         // secondary text — warm gray
        dust: "#E5DECF",          // borders — warm cream-toned
        rust: "#C99A2C",          // PRIMARY ACCENT — harvest gold
        moss: "#3B6D11",          // success — deep botanical green
        glow: "#1F3A2E",          // forest — sidebar/decorative deep green
        amber: "#BA7517",         // warnings — warm amber
        rose: "#A32D2D",          // errors — muted brick red
        steel: "#F0EBE0",         // raised/hover surface — warm pale cream
        // NEW Cottage-specific tokens for the sidebar
        forest: "#1F3A2E",        // sidebar background
        "forest-text": "#E8DCC4", // sidebar default text (warm cream)
        "forest-muted": "#C9BFA6",// sidebar inactive items
        "gold-on": "#3D2E08",     // dark text for use on harvest-gold backgrounds
      },`,
  `bone: "#FAF6EE"`,
);

patch(
  "tailwind.config.ts",
  "shadows → warm + gold focus ring",
  `      boxShadow: {
        // Light-theme shadows are subtler — black at low opacity, no glow halos
        soft: "0 1px 2px rgba(15, 23, 42, 0.04), 0 1px 3px rgba(15, 23, 42, 0.06)",
        lift: "0 4px 6px -1px rgba(15, 23, 42, 0.05), 0 10px 15px -3px rgba(15, 23, 42, 0.08)",
        glow: "0 0 0 1px rgba(99, 102, 241, 0.15), 0 1px 2px rgba(99, 102, 241, 0.1)",
        "glow-cyan": "0 0 0 1px rgba(16, 185, 129, 0.15), 0 1px 2px rgba(16, 185, 129, 0.1)",
      },`,
  `      boxShadow: {
        // Cottage — warm-tinted, low-opacity. Focus rings use harvest gold.
        soft: "0 1px 2px rgba(60, 40, 20, 0.04), 0 1px 3px rgba(60, 40, 20, 0.06)",
        lift: "0 4px 6px -1px rgba(60, 40, 20, 0.05), 0 10px 15px -3px rgba(60, 40, 20, 0.08)",
        glow: "0 0 0 1px rgba(201, 154, 44, 0.20), 0 1px 2px rgba(201, 154, 44, 0.12)",
        "glow-cyan": "0 0 0 1px rgba(59, 109, 17, 0.18), 0 1px 2px rgba(59, 109, 17, 0.10)",
      },`,
  `rgba(60, 40, 20, 0.04)`,
);

// ============================================================
// 2. AppShell components
// ============================================================
console.log("\n== AppShell components ==");

write("src/components/app-shell/nav-items.ts", `import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Calendar,
  Clock,
  Users,
  DollarSign,
  FileText,
  CheckSquare,
  Settings,
  PlaneTakeoff,
  ShieldCheck,
  IdCard,
} from "lucide-react";

export type Role = "ADMIN" | "MANAGER" | "EMPLOYEE";

export type NavItem = {
  label: string;
  href: (tenant: string) => string;
  icon: LucideIcon;
  roles: Role[];
  matchPrefix?: (tenant: string) => string;
};

export const NAV_ITEMS: NavItem[] = [
  {
    label: "Dashboard",
    href: (t) => \`/\${t}/dashboard\`,
    icon: LayoutDashboard,
    roles: ["ADMIN", "MANAGER", "EMPLOYEE"],
  },
  {
    label: "Schedule",
    href: (t) => \`/\${t}/schedule\`,
    icon: Calendar,
    roles: ["ADMIN", "MANAGER", "EMPLOYEE"],
  },
  {
    label: "Timesheets",
    href: (t) => \`/\${t}/timesheets\`,
    icon: Clock,
    roles: ["ADMIN", "MANAGER"],
  },
  {
    label: "Approvals",
    href: (t) => \`/\${t}/approvals\`,
    icon: CheckSquare,
    roles: ["ADMIN", "MANAGER"],
  },
  {
    label: "Employees",
    href: (t) => \`/\${t}/admin/employees\`,
    icon: Users,
    roles: ["ADMIN", "MANAGER"],
    matchPrefix: (t) => \`/\${t}/admin/employees\`,
  },
  {
    label: "Payroll",
    href: (t) => \`/\${t}/payroll\`,
    icon: DollarSign,
    roles: ["ADMIN"],
  },
  {
    label: "Documents",
    href: (t) => \`/\${t}/admin/documents\`,
    icon: FileText,
    roles: ["ADMIN", "MANAGER"],
    matchPrefix: (t) => \`/\${t}/admin/documents\`,
  },
  {
    label: "Time off",
    href: (t) => \`/\${t}/admin/time-off\`,
    icon: PlaneTakeoff,
    roles: ["ADMIN", "MANAGER"],
  },
  {
    label: "Settings",
    href: (t) => \`/\${t}/admin/settings\`,
    icon: Settings,
    roles: ["ADMIN"],
    matchPrefix: (t) => \`/\${t}/admin/settings\`,
  },
];

// Employee-specific items (shown only to EMPLOYEE role)
export const EMPLOYEE_ITEMS: NavItem[] = [
  {
    label: "Clock",
    href: (t) => \`/\${t}/clock\`,
    icon: ShieldCheck,
    roles: ["EMPLOYEE"],
  },
  {
    label: "My documents",
    href: (t) => \`/\${t}/my-documents\`,
    icon: IdCard,
    roles: ["EMPLOYEE"],
  },
];
`);

write("src/components/app-shell/sidebar.tsx", `"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, EMPLOYEE_ITEMS, type Role } from "./nav-items";

export default function Sidebar({
  tenant,
  businessName,
  userName,
  userRole,
}: {
  tenant: string;
  businessName: string;
  userName: string | null;
  userRole: Role;
}) {
  const pathname = usePathname() || "";

  const visibleItems = (userRole === "EMPLOYEE" ? EMPLOYEE_ITEMS : NAV_ITEMS).filter((i) =>
    i.roles.includes(userRole),
  );

  const initials = (userName || "?")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <aside className="hidden md:flex md:flex-col w-[200px] shrink-0 bg-forest text-forest-text min-h-screen">
      {/* Brand */}
      <div className="px-4 py-4 flex items-center gap-2 border-b border-forest-muted/15">
        <div className="w-7 h-7 rounded-md bg-rust flex items-center justify-center text-gold-on text-sm font-display font-medium">
          {(businessName || "S")[0].toUpperCase()}
        </div>
        <div className="leading-tight min-w-0">
          <div className="text-sm font-medium text-forest-text truncate">{businessName || "Shiftwork"}</div>
          <div className="text-[10px] text-forest-muted truncate">{tenant}</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 flex flex-col gap-0.5 overflow-y-auto">
        {visibleItems.map((item) => {
          const href = item.href(tenant);
          const prefix = item.matchPrefix ? item.matchPrefix(tenant) : href;
          const active = pathname === href || pathname.startsWith(prefix + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.label}
              href={href}
              className={\`flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] transition-colors \${
                active
                  ? "bg-rust text-gold-on font-medium"
                  : "text-forest-muted hover:bg-forest-muted/10 hover:text-forest-text"
              }\`}
            >
              <Icon size={15} />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* User */}
      <div className="px-3 py-3 border-t border-forest-muted/15 flex items-center gap-2">
        <div className="w-7 h-7 rounded-full bg-forest-text text-forest flex items-center justify-center text-[11px] font-medium">
          {initials || "U"}
        </div>
        <div className="leading-tight min-w-0 flex-1">
          <div className="text-xs text-forest-text truncate">{userName || "Unnamed"}</div>
          <div className="text-[10px] text-forest-muted capitalize">{userRole.toLowerCase()}</div>
        </div>
        <Link href={\`/api/auth/signout\`} className="text-[10px] text-forest-muted hover:text-forest-text">
          Sign out
        </Link>
      </div>
    </aside>
  );
}
`);

write("src/components/app-shell/mobile-topbar.tsx", `"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { NAV_ITEMS, EMPLOYEE_ITEMS, type Role } from "./nav-items";

export default function MobileTopbar({
  tenant,
  businessName,
  userRole,
}: {
  tenant: string;
  businessName: string;
  userRole: Role;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname() || "";

  const items = (userRole === "EMPLOYEE" ? EMPLOYEE_ITEMS : NAV_ITEMS).filter((i) =>
    i.roles.includes(userRole),
  );

  return (
    <div className="md:hidden">
      <div className="bg-forest text-forest-text px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-rust flex items-center justify-center text-gold-on text-xs font-display font-medium">
            {(businessName || "S")[0].toUpperCase()}
          </div>
          <span className="text-sm font-medium">{businessName || "Shiftwork"}</span>
        </div>
        <button onClick={() => setOpen(!open)} className="text-forest-text" aria-label="Toggle menu">
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>
      {open && (
        <nav className="bg-forest text-forest-text px-2 py-2 flex flex-col gap-0.5 border-t border-forest-muted/15">
          {items.map((item) => {
            const href = item.href(tenant);
            const prefix = item.matchPrefix ? item.matchPrefix(tenant) : href;
            const active = pathname === href || pathname.startsWith(prefix + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.label}
                href={href}
                onClick={() => setOpen(false)}
                className={\`flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] \${
                  active ? "bg-rust text-gold-on font-medium" : "text-forest-muted"
                }\`}
              >
                <Icon size={15} />
                {item.label}
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}
`);

write("src/components/app-shell/app-shell.tsx", `"use client";

import { usePathname } from "next/navigation";
import Sidebar from "./sidebar";
import MobileTopbar from "./mobile-topbar";
import type { Role } from "./nav-items";

// Pages that should render bare — no sidebar, no topbar.
// Kiosk/clock-in screens are full-bleed by design.
const BARE_PATTERNS = [/\\/clock(\\/|$)/, /\\/pin-clock(\\/|$)/, /\\/login(\\/|$)/, /\\/kiosk(\\/|$)/];

export default function AppShell({
  tenant,
  businessName,
  userName,
  userRole,
  children,
}: {
  tenant: string;
  businessName: string;
  userName: string | null;
  userRole: Role;
  children: React.ReactNode;
}) {
  const pathname = usePathname() || "";
  if (BARE_PATTERNS.some((re) => re.test(pathname))) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen flex bg-bone text-ink">
      <Sidebar tenant={tenant} businessName={businessName} userName={userName} userRole={userRole} />
      <div className="flex-1 min-w-0 flex flex-col">
        <MobileTopbar tenant={tenant} businessName={businessName} userRole={userRole} />
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
`);

// ============================================================
// 3. Patch [tenant]/layout.tsx to wrap in AppShell
// ============================================================
console.log("\n== Layout wiring ==");

patch(
  "src/app/[tenant]/layout.tsx",
  "add AppShell import",
  `import { getServerAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";`,
  `import { getServerAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import AppShell from "@/components/app-shell/app-shell";`,
  `from "@/components/app-shell/app-shell"`,
);

patch(
  "src/app/[tenant]/layout.tsx",
  "fetch user + wrap children in AppShell",
  `  // Super-admins can view any tenant. Regular users only their own.
  if (!isSuperAdmin && userTenantId !== tenant.id) {
    // If they have a tenant, send them to their tenant's dashboard
    if (userTenantId) {
      const ownTenant = await prisma.tenant.findUnique({ where: { id: userTenantId }, select: { slug: true } });
      if (ownTenant) redirect(\`/\${ownTenant.slug}/dashboard\`);
    }
    // Otherwise (no tenant), send to superadmin (if super-admin) or login
    redirect("/login");
  }

  return <>{children}</>;
}`,
  `  // Super-admins can view any tenant. Regular users only their own.
  if (!isSuperAdmin && userTenantId !== tenant.id) {
    // If they have a tenant, send them to their tenant's dashboard
    if (userTenantId) {
      const ownTenant = await prisma.tenant.findUnique({ where: { id: userTenantId }, select: { slug: true } });
      if (ownTenant) redirect(\`/\${ownTenant.slug}/dashboard\`);
    }
    // Otherwise (no tenant), send to superadmin (if super-admin) or login
    redirect("/login");
  }

  // Fetch user details for the sidebar
  const userId = (session.user as any).id as string | undefined;
  const user = userId
    ? await prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, role: true },
      })
    : null;

  return (
    <AppShell
      tenant={tenant.slug}
      businessName={tenant.businessName}
      userName={user?.name ?? null}
      userRole={(user?.role as any) ?? "EMPLOYEE"}
    >
      {children}
    </AppShell>
  );
}`,
  `<AppShell`,
);

console.log(`\n=== ${total} change(s) ===`);
console.log("\nNext: npm run build to verify, then commit.");
