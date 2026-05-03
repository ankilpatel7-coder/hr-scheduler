"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { LogOut, Shield } from "lucide-react";

export default function Navbar() {
  const { data: session } = useSession();
  const path = usePathname();
  const role = (session?.user as any)?.role;
  const isSuperAdmin = (session?.user as any)?.superAdmin === true;

  if (!session) return null;

  const isStaffMember = role === "EMPLOYEE" || role === "LEAD";
  const isManager = role === "MANAGER";
  const isAdmin = role === "ADMIN";

  const links: { href: string; label: string; show: boolean }[] = [
    { href: "/dashboard", label: "Overview", show: true },
    { href: "/clock", label: "Clock In", show: isStaffMember },
    { href: "/my-shifts", label: "My Shifts", show: isStaffMember },
    { href: "/availability", label: "Availability", show: isStaffMember },
    { href: "/schedule", label: "Schedule", show: isAdmin || isManager },
    { href: "/employees", label: "Employees", show: isAdmin || isManager },
    { href: "/locations", label: "Locations", show: isAdmin },
    { href: "/time-off", label: "Time Off", show: true },
    { href: "/swaps", label: "Swaps", show: true },
    { href: "/timesheets", label: "Timesheets", show: true },
    { href: "/payroll", label: "Payroll", show: isAdmin },
    { href: "/profile", label: "Profile", show: isStaffMember },
    { href: "/settings", label: "Settings", show: isAdmin },
  ];

  return (
    <header className="glass sticky top-0 z-40 border-b border-dust/60">
      <div className="max-w-[1500px] mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/dashboard" className="flex items-center gap-3 group">
          <div className="relative w-8 h-8 rounded-md bg-rust flex items-center justify-center">
            <span className="relative font-display text-white font-bold text-base leading-none">S</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="display text-xl font-semibold tracking-tight text-ink">Shiftwork</span>
          </div>
        </Link>

        <nav className="hidden lg:flex items-center gap-0.5 bg-paper/40 rounded-full p-1 border border-dust/60">
          {links
            .filter((l) => l.show)
            .map((l) => {
              const active = path === l.href || (l.href !== "/dashboard" && path?.startsWith(l.href));
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`relative px-3.5 py-1.5 text-[13px] font-medium rounded-full transition-all duration-200 ${
                    active ? "text-white" : "text-smoke hover:text-ink"
                  }`}
                >
                  {active && <span className="absolute inset-0 rounded-full bg-rust"></span>}
                  <span className="relative">{l.label}</span>
                </Link>
              );
            })}
        </nav>

        <div className="flex items-center gap-3">
          {isSuperAdmin && (
            <Link
              href="/_admin"
              className="flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium border border-rust/30 text-rust hover:bg-rust/5"
              title="Super-admin console"
            >
              <Shield size={12} /> Super Admin
            </Link>
          )}
          <div className="hidden sm:flex flex-col items-end">
            <div className="text-sm font-medium leading-tight text-ink">{session.user?.name}</div>
            <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-rust mt-0.5">
              ● {role}
            </div>
          </div>
          <button onClick={() => signOut({ callbackUrl: "/login" })} className="btn btn-ghost !p-2" title="Sign out">
            <LogOut size={16} />
          </button>
        </div>
      </div>

      <div className="lg:hidden border-t border-dust/60 overflow-x-auto">
        <div className="flex gap-1 px-4 py-2 min-w-max">
          {links
            .filter((l) => l.show)
            .map((l) => {
              const active = path === l.href;
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`relative px-3 py-1 text-xs rounded-full whitespace-nowrap transition-all ${
                    active ? "text-white bg-rust" : "text-smoke"
                  }`}
                >
                  {l.label}
                </Link>
              );
            })}
        </div>
      </div>
    </header>
  );
}
