"use client";

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
              className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] transition-colors ${
                active
                  ? "bg-rust text-gold-on font-medium"
                  : "text-forest-muted hover:bg-forest-muted/10 hover:text-forest-text"
              }`}
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
        <Link href={`/api/auth/signout`} className="text-[10px] text-forest-muted hover:text-forest-text">
          Sign out
        </Link>
      </div>
    </aside>
  );
}
