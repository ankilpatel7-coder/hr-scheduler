"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { NAV_ITEMS, EMPLOYEE_ITEMS, type Role, type NavItem } from "./nav-items";

/**
 * Sectioned sidebar — admin sees grouped nav, employee sees flat list.
 * Active state: thin gold left bar + subtle tinted background + gold icon.
 * Hover: barely-there tint + text lifts to full opacity.
 */

const ADMIN_SECTIONS: { title?: string; labels: string[] }[] = [
  { labels: ["Dashboard"] },
  { title: "Scheduling", labels: ["Schedule", "Templates"] },
  { title: "Time", labels: ["Timesheets", "Approvals", "Attendance"] },
  { title: "People", labels: ["Employees", "Time off"] },
  { title: "Documents", labels: ["Documents"] },
  { title: "Finance", labels: ["Payroll"] },
  { title: "Workspace", labels: ["Locations", "Settings"] },
];

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
  const visible = (userRole === "EMPLOYEE" ? EMPLOYEE_ITEMS : NAV_ITEMS).filter((i) =>
    i.roles.includes(userRole),
  );
  const itemsByLabel = new Map(visible.map((i) => [i.label, i]));

  // For employees: one flat section. For admin/manager: grouped sections.
  const sections: { title?: string; items: NavItem[] }[] =
    userRole === "EMPLOYEE"
      ? [{ items: visible }]
      : ADMIN_SECTIONS.map((s) => ({
          title: s.title,
          items: s.labels
            .map((l) => itemsByLabel.get(l))
            .filter((i): i is NavItem => Boolean(i)),
        })).filter((s) => s.items.length > 0);

  const initials =
    (userName || "?")
      .split(" ")
      .filter(Boolean)
      .map((s) => s[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "U";

  return (
    <aside className="hidden md:flex md:flex-col w-[224px] shrink-0 bg-forest text-forest-text min-h-screen">
      {/* Brand */}
      <div className="px-4 py-5 border-b border-forest-text/10">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-md bg-rust flex items-center justify-center text-gold-on font-display font-medium text-base">
            {(businessName || "S")[0].toUpperCase()}
          </div>
          <div className="leading-tight min-w-0">
            <div className="text-[14px] font-medium text-forest-text truncate">
              {businessName || "Shiftwork"}
            </div>
            <div className="text-[10px] text-forest-muted truncate font-mono uppercase tracking-[0.15em]">
              {tenant}
            </div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 flex flex-col gap-4 overflow-y-auto">
        {sections.map((sec, i) => (
          <div key={i}>
            {sec.title && (
              <div className="px-3 mb-1.5 text-[10px] font-mono uppercase tracking-[0.18em] text-forest-muted/70">
                {sec.title}
              </div>
            )}
            <div className="flex flex-col gap-px">
              {sec.items.map((item) => {
                const href = item.href(tenant);
                const prefix = item.matchPrefix ? item.matchPrefix(tenant) : href;
                const active = pathname === href || pathname.startsWith(prefix + "/");
                const Icon = item.icon;
                return (
                  <Link
                    key={item.label}
                    href={href}
                    className={`relative flex items-center gap-2.5 pl-4 pr-3 py-[7px] rounded-md text-[13px] transition-colors ${
                      active
                        ? "bg-forest-text/[0.07] text-forest-text font-medium"
                        : "text-forest-muted hover:bg-forest-text/[0.04] hover:text-forest-text"
                    }`}
                  >
                    {active && (
                      <span className="absolute left-0 top-[7px] bottom-[7px] w-[2.5px] bg-rust rounded-r" />
                    )}
                    <Icon size={15} className={active ? "text-rust" : ""} />
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Profile */}
      <div className="px-3 py-3 border-t border-forest-text/10 flex items-center gap-1">
        <Link
          href={`/${tenant}/profile`}
          className="flex items-center gap-2 flex-1 min-w-0 rounded-md px-1.5 py-1 hover:bg-forest-text/[0.04] transition-colors"
        >
          <div className="w-7 h-7 rounded-full bg-rust text-gold-on flex items-center justify-center text-[11px] font-medium shrink-0">
            {initials}
          </div>
          <div className="leading-tight min-w-0">
            <div className="text-[12px] text-forest-text truncate">
              {userName || "Unnamed"}
            </div>
            <div className="text-[10px] text-forest-muted capitalize">
              {userRole.toLowerCase()}
            </div>
          </div>
        </Link>
        <Link
          href="/api/auth/signout"
          className="text-forest-muted hover:text-forest-text p-1.5 rounded hover:bg-forest-text/[0.04] transition-colors"
          aria-label="Sign out"
        >
          <LogOut size={14} />
        </Link>
      </div>
    </aside>
  );
}
