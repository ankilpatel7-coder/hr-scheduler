"use client";

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
        <nav className="bg-forest text-forest-text px-2 py-2 flex flex-col gap-px border-b border-forest-text/10">
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
      )}
    </div>
  );
}
