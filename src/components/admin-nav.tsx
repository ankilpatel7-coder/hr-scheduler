"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { Building2, LayoutDashboard, LogOut, Shield, Key } from "lucide-react";

export default function AdminNav({ userName }: { userName: string }) {
  const pathname = usePathname();

  const links = [
    { href: "/superadmin", label: "Overview", icon: LayoutDashboard },
    { href: "/superadmin/tenants", label: "Businesses", icon: Building2 },
  ];

  return (
    <nav className="border-b border-dust bg-paper/80 backdrop-blur sticky top-0 z-30">
      <div className="max-w-[1200px] mx-auto px-6 py-3 flex items-center justify-between gap-6">
        <div className="flex items-center gap-2">
          <Shield size={18} className="text-rust" />
          <Link href="/superadmin" className="display text-lg text-ink">
            Shiftwork <span className="text-smoke">Super Admin</span>
          </Link>
        </div>
        <div className="flex items-center gap-1">
          {links.map((l) => {
            const active =
              pathname === l.href ||
              (l.href !== "/superadmin" && pathname?.startsWith(l.href));
            const Icon = l.icon;
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`px-3 py-1.5 rounded text-sm flex items-center gap-1.5 transition ${
                  active
                    ? "bg-ink/5 text-ink"
                    : "text-smoke hover:text-ink hover:bg-ink/5"
                }`}
              >
                <Icon size={14} /> {l.label}
              </Link>
            );
          })}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-smoke">{userName}</span>
          <Link href="/change-password" className="text-smoke hover:text-ink" title="Change password">
            <Key size={16} />
          </Link>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="text-smoke hover:text-rose"
            title="Sign out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </nav>
  );
}
