"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LogOut,
  ChevronUp,
  ChevronDown,
  User as UserIcon,
  Key,
  Hash,
} from "lucide-react";
import { NAV_ITEMS, EMPLOYEE_ITEMS, type Role, type NavItem } from "./nav-items";

/**
 * Sectioned sidebar with account dropdown.
 *
 * Admin/Manager: "My work" section at top (Clock, My shifts, etc.) since
 * they also work shifts, then management sections below.
 * Employee: flat list of personal items.
 */

const ADMIN_SECTIONS: { title?: string; labels: string[] }[] = [
  { title: "My work", labels: ["Clock", "My shifts", "My timesheet", "My attendance", "My documents"] },
  { labels: ["Dashboard"] },
  { title: "Scheduling", labels: ["Schedule", "Templates", "Calendar"] },
  { title: "Time", labels: ["Timesheets", "Approvals", "Attendance"] },
  { title: "People", labels: ["Employees", "Time off", "Swaps"] },
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

  // Account dropdown
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    if (menuOpen) {
      document.addEventListener("mousedown", onClick);
      document.addEventListener("keydown", onKey);
    }
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

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

      {/* Account dropdown */}
      <div
        ref={menuRef}
        className="relative px-3 py-3 border-t border-forest-text/10"
      >
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="w-full flex items-center gap-2 rounded-md px-1.5 py-1.5 hover:bg-forest-text/[0.04] transition-colors text-left"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          <div className="w-7 h-7 rounded-full bg-rust text-gold-on flex items-center justify-center text-[11px] font-medium shrink-0">
            {initials}
          </div>
          <div className="leading-tight min-w-0 flex-1">
            <div className="text-[12px] text-forest-text truncate">
              {userName || "Unnamed"}
            </div>
            <div className="text-[10px] text-forest-muted capitalize">
              {userRole.toLowerCase()}
            </div>
          </div>
          {menuOpen ? (
            <ChevronDown size={14} className="text-forest-muted shrink-0" />
          ) : (
            <ChevronUp size={14} className="text-forest-muted shrink-0" />
          )}
        </button>

        {menuOpen && (
          <div
            role="menu"
            className="absolute left-3 right-3 bottom-full mb-2 bg-paper rounded-md py-1 border border-dust overflow-hidden z-50"
            style={{
              boxShadow:
                "0 4px 6px -1px rgba(60, 40, 20, 0.10), 0 10px 20px -4px rgba(60, 40, 20, 0.12)",
            }}
          >
            <Link
              href={`/${tenant}/profile`}
              onClick={() => setMenuOpen(false)}
              className="flex items-center gap-2.5 px-3 py-2 text-[12px] text-ink hover:bg-bone transition-colors"
            >
              <UserIcon size={13} className="text-smoke" />
              Profile
            </Link>
            <Link
              href="/change-password"
              onClick={() => setMenuOpen(false)}
              className="flex items-center gap-2.5 px-3 py-2 text-[12px] text-ink hover:bg-bone transition-colors"
            >
              <Key size={13} className="text-smoke" />
              Change password
            </Link>
            <Link
              href="/change-pin"
              onClick={() => setMenuOpen(false)}
              className="flex items-center gap-2.5 px-3 py-2 text-[12px] text-ink hover:bg-bone transition-colors"
            >
              <Hash size={13} className="text-smoke" />
              Change PIN
            </Link>
            <div className="my-1 border-t border-dust" />
            <Link
              href="/api/auth/signout"
              onClick={() => setMenuOpen(false)}
              className="flex items-center gap-2.5 px-3 py-2 text-[12px] text-rose hover:bg-bone transition-colors"
            >
              <LogOut size={13} />
              Sign out
            </Link>
          </div>
        )}
      </div>
    </aside>
  );
}
