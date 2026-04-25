"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { LogOut } from "lucide-react";

export default function Navbar() {
  const { data: session } = useSession();
  const path = usePathname();
  const role = (session?.user as any)?.role;

  if (!session) return null;

  const links: { href: string; label: string; show: boolean }[] = [
    { href: "/dashboard", label: "Overview", show: true },
    { href: "/clock", label: "Clock In", show: role === "EMPLOYEE" },
    { href: "/my-shifts", label: "My Shifts", show: role === "EMPLOYEE" },
    { href: "/availability", label: "Availability", show: role === "EMPLOYEE" },
    { href: "/schedule", label: "Schedule", show: role === "ADMIN" || role === "MANAGER" },
    { href: "/employees", label: "Employees", show: role === "ADMIN" || role === "MANAGER" },
    { href: "/locations", label: "Locations", show: role === "ADMIN" },
    { href: "/time-off", label: "Time Off", show: true },
    { href: "/swaps", label: "Swaps", show: true },
    { href: "/timesheets", label: "Timesheets", show: true },
  ];

  return (
    <header className="border-b border-dust bg-paper/60 backdrop-blur-sm sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/dashboard" className="flex items-baseline gap-2">
          <span className="display text-2xl font-semibold tracking-tight">Shiftwork</span>
          <span className="text-[10px] uppercase tracking-[0.2em] text-smoke mt-1">
            ·&nbsp;HR
          </span>
        </Link>
        <nav className="hidden lg:flex items-center gap-1">
          {links
            .filter((l) => l.show)
            .map((l) => {
              const active = path === l.href;
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`px-3 py-1.5 text-sm rounded ${
                    active
                      ? "bg-ink text-paper"
                      : "text-ink/70 hover:text-ink hover:bg-dust/40"
                  }`}
                >
                  {l.label}
                </Link>
              );
            })}
        </nav>
        <div className="flex items-center gap-3">
          <div className="hidden sm:block text-right">
            <div className="text-sm font-medium leading-tight">{session.user?.name}</div>
            <div className="text-[10px] uppercase tracking-[0.15em] text-smoke">
              {role}
            </div>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="btn btn-ghost !p-2"
            title="Sign out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
      <div className="lg:hidden border-t border-dust overflow-x-auto">
        <div className="flex gap-1 px-4 py-2 min-w-max">
          {links
            .filter((l) => l.show)
            .map((l) => {
              const active = path === l.href;
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`px-3 py-1 text-xs rounded whitespace-nowrap ${
                    active ? "bg-ink text-paper" : "text-ink/70"
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
