"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Building2,
  LogOut,
  ChevronUp,
  ChevronDown,
  Key,
} from "lucide-react";

/**
 * Superadmin app shell — same Cottage palette and sidebar pattern as the
 * tenant AppShell, but scoped to /superadmin/* routes (no tenant context).
 */

const SUPERADMIN_NAV = [
  { label: "Overview", href: "/superadmin", icon: LayoutDashboard, exact: true },
  { label: "Tenants", href: "/superadmin/tenants", icon: Building2, exact: false },
];

export default function SuperadminShell({
  userName,
  children,
}: {
  userName: string | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname() || "";
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

  const initials =
    (userName || "S")
      .split(" ")
      .filter(Boolean)
      .map((s) => s[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "S";

  return (
    <div className="min-h-screen flex bg-bone text-ink">
      {/* Sidebar */}
      <aside className="hidden md:flex md:flex-col w-[224px] shrink-0 bg-forest text-forest-text min-h-screen">
        {/* Brand */}
        <div className="px-4 py-5 border-b border-forest-text/10">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-rust flex items-center justify-center text-gold-on font-display font-medium text-base">
              S
            </div>
            <div className="leading-tight min-w-0">
              <div className="text-[14px] font-medium text-forest-text truncate">
                Shiftwork
              </div>
              <div className="text-[10px] text-forest-muted truncate font-mono uppercase tracking-[0.15em]">
                Superadmin
              </div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-3 flex flex-col gap-px">
          {SUPERADMIN_NAV.map((item) => {
            const active = item.exact
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(item.href + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.label}
                href={item.href}
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
                {item.label}
              </Link>
            );
          })}
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
                {userName || "Super admin"}
              </div>
              <div className="text-[10px] text-forest-muted">Super admin</div>
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
                href="/change-password"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2.5 px-3 py-2 text-[12px] text-ink hover:bg-bone transition-colors"
              >
                <Key size={13} className="text-smoke" />
                Change password
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

      {/* Main */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Mobile top bar — sign-out only since superadmin nav is just 2 items */}
        <div className="md:hidden bg-forest text-forest-text px-4 py-2.5 flex items-center justify-between border-b border-forest-text/10">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-rust flex items-center justify-center text-gold-on text-xs font-display font-medium">
              S
            </div>
            <span className="text-sm font-medium">Superadmin</span>
          </div>
          <div className="flex items-center gap-1">
            <Link
              href="/superadmin/tenants"
              className="text-[12px] text-forest-muted hover:text-forest-text px-2 py-1 rounded hover:bg-forest-text/[0.05]"
            >
              Tenants
            </Link>
            <Link
              href="/api/auth/signout"
              className="text-forest-text p-1.5 rounded hover:bg-forest-text/[0.05]"
              aria-label="Sign out"
            >
              <LogOut size={16} />
            </Link>
          </div>
        </div>
        <main className="flex-1 min-w-0">
          <div className="max-w-[1200px] mx-auto px-6 py-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
