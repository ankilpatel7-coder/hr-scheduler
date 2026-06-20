"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Menu,
  X,
  User as UserIcon,
  Key,
  Hash,
  LogOut,
} from "lucide-react";
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
      <div className="bg-forest text-forest-text px-4 py-2.5 flex items-center justify-between border-b border-forest-text/10">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-rust flex items-center justify-center text-gold-on text-xs font-display font-medium">
            {(businessName || "S")[0].toUpperCase()}
          </div>
          <span className="text-sm font-medium">{businessName || "Shiftwork"}</span>
        </div>
        <button
          onClick={() => setOpen(!open)}
          className="text-forest-text p-1.5 rounded hover:bg-forest-text/[0.05]"
          aria-label="Toggle menu"
        >
          {open ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>
      {open && (
        <div className="bg-forest text-forest-text border-b border-forest-text/10">
          <nav className="px-2 py-2 flex flex-col gap-px">
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
                  className={`relative flex items-center gap-2.5 pl-4 pr-3 py-2 rounded-md text-[13px] ${
                    active
                      ? "bg-forest-text/[0.07] text-forest-text font-medium"
                      : "text-forest-muted"
                  }`}
                >
                  {active && (
                    <span className="absolute left-0 top-[8px] bottom-[8px] w-[2.5px] bg-rust rounded-r" />
                  )}
                  <Icon size={15} className={active ? "text-rust" : ""} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="border-t border-forest-text/10 px-2 py-2 flex flex-col gap-px">
            <Link
              href={`/${tenant}/profile`}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2 rounded-md text-[13px] text-forest-muted hover:bg-forest-text/[0.04]"
            >
              <UserIcon size={15} />
              Profile
            </Link>
            <Link
              href="/change-password"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2 rounded-md text-[13px] text-forest-muted hover:bg-forest-text/[0.04]"
            >
              <Key size={15} />
              Change password
            </Link>
            <Link
              href="/change-pin"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2 rounded-md text-[13px] text-forest-muted hover:bg-forest-text/[0.04]"
            >
              <Hash size={15} />
              Change PIN
            </Link>
            <Link
              href="/api/auth/signout"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2 rounded-md text-[13px] text-rose hover:bg-forest-text/[0.04]"
            >
              <LogOut size={15} />
              Sign out
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
