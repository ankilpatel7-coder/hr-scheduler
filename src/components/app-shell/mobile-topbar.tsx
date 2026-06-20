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
                className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] ${
                  active ? "bg-rust text-gold-on font-medium" : "text-forest-muted"
                }`}
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
