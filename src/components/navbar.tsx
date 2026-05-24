"use client";

import Link from "next/link";
import {
  ClipboardCheck, usePathname } from "next/navigation";
import {
  ClipboardCheck, useSession, signOut } from "next-auth/react";
import {
  ClipboardCheck, useEffect, useRef, useState } from "react";
import {
  ClipboardCheck,
  LogOut, Shield, Key, Hash, Menu, X, ChevronDown,
  LayoutDashboard, Clock, Calendar, CalendarCheck, CalendarDays,
  Users, MapPin, Plane, ArrowLeftRight, ClipboardList, DollarSign,
  FileText, User as UserIcon, Settings as SettingsIcon, ClipboardCheck,
} from "lucide-react";

/**
 * v12.7 navbar — modern, mobile-friendly, glassy.
 *
 * Desktop (≥lg): icon + label pills in a glass tray, gradient active state.
 * Mobile (<lg): hamburger button → slide-out drawer covering the right
 *   side of the screen with the full nav list, swipeable away.
 * Avatar with initials gradient; tap → profile actions menu.
 */

type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
  show: boolean;
};

function initials(name: string | null | undefined): string {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function hashHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 360;
}

export default function Navbar() {
  const { data: session } = useSession();
  const path = usePathname() ?? "";
  const role = (session?.user as any)?.role;
  const isSuperAdmin = (session?.user as any)?.superAdmin === true;
  const userName = session?.user?.name ?? "";
  const userEmail = session?.user?.email ?? "";

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  // Close menus on route change
  useEffect(() => {
    setDrawerOpen(false);
    setProfileOpen(false);
  }, [path]);

  // Click outside to close profile menu
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    }
    if (profileOpen) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [profileOpen]);

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.style.overflow = drawerOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [drawerOpen]);

  if (!session) return null;

  // Extract current tenant slug
  const segments = path.replace(/^\/+/, "").split("/");
  const currentSlug =
    segments[0] && !["login", "signup", "change-password", "superadmin", "api"].includes(segments[0])
      ? segments[0]
      : "";
  const tlink = (p: string) => (currentSlug ? `/${currentSlug}${p}` : p);

  const isStaff = !isSuperAdmin && (role === "EMPLOYEE" || role === "LEAD");
  const isManager = !isSuperAdmin && role === "MANAGER";
  const isAdmin = !isSuperAdmin && role === "ADMIN";

  const items: NavItem[] = [
    { href: tlink("/dashboard"),     label: "Overview",     icon: <LayoutDashboard size={14} />, show: !isSuperAdmin },
    { href: tlink("/clock"),         label: "Clock In",     icon: <Clock size={14} />,           show: isStaff },
    { href: tlink("/my-shifts"),     label: "My Shifts",    icon: <Calendar size={14} />,        show: isStaff },
    { href: tlink("/availability"),  label: "Availability", icon: <CalendarCheck size={14} />,   show: isStaff },
    { href: tlink("/my-documents"),  label: "Documents",    icon: <FileText size={14} />,        show: isStaff },
    { href: tlink("/schedule"),      label: "Schedule",     icon: <CalendarDays size={14} />,    show: isAdmin || isManager },
    { href: tlink("/employees"),     label: "Employees",    icon: <Users size={14} />,           show: isAdmin || isManager },
    { href: tlink("/locations"),     label: "Locations",    icon: <MapPin size={14} />,          show: isAdmin },
    { href: tlink("/time-off"),      label: "Time Off",     icon: <Plane size={14} />,           show: !isSuperAdmin },
    { href: tlink("/swaps"),         label: "Swaps",        icon: <ArrowLeftRight size={14} />,  show: !isSuperAdmin },
    { href: tlink("/timesheets"),    label: "Timesheets",   icon: <ClipboardList size={14} />,   show: !isSuperAdmin },
    { href: tlink("/payroll"),       label: "Payroll",      icon: <DollarSign size={14} />,      show: isAdmin },
    { href: tlink("/attendance"),    label: "Attendance",   icon: <ClipboardCheck size={14} />,  show: isAdmin || isManager },
    { href: tlink("/documents"),     label: "Documents",    icon: <FileText size={14} />,        show: isAdmin },
    { href: tlink("/calendar"),      label: "Calendar",     icon: <Calendar size={14} />,        show: isAdmin || isManager },
    { href: tlink("/profile"),       label: "Profile",      icon: <UserIcon size={14} />,        show: isStaff },
    { href: tlink("/settings"),      label: "Settings",     icon: <SettingsIcon size={14} />,    show: isAdmin },
  ];
  const visible = items.filter((i) => i.show);

  function isActive(href: string): boolean {
    if (href === tlink("/dashboard")) return path === href;
    return path === href || path.startsWith(href + "/");
  }

  const hue = hashHue(userName || userEmail || "x");
  const avatarGradient = `linear-gradient(135deg, hsl(${hue}, 75%, 55%) 0%, hsl(${(hue + 60) % 360}, 70%, 50%) 100%)`;

  return (
    <>
      <header className="navbar-v2 sticky top-0 z-40">
        <div className="navbar-inner max-w-[1500px] mx-auto px-4 lg:px-6 h-16 flex items-center gap-3">
          {/* Brand */}
          <Link href={tlink("/dashboard")} className="flex items-center gap-2.5 shrink-0 group">
            <div className="relative w-9 h-9 rounded-xl flex items-center justify-center"
                 style={{
                   background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #ec4899 100%)",
                   boxShadow: "0 4px 12px -2px rgba(99, 102, 241, 0.45), inset 0 1px 0 rgba(255,255,255,0.25)",
                 }}>
              <span className="font-display text-white font-bold text-base leading-none">S</span>
              <span className="absolute -inset-px rounded-xl ring-1 ring-white/10 pointer-events-none" />
            </div>
            <div className="hidden sm:flex flex-col leading-tight">
              <span className="display text-lg font-semibold tracking-tight text-ink">Shiftwork</span>
              {currentSlug && (
                <span className="text-[10px] text-smoke font-mono -mt-0.5">/{currentSlug}</span>
              )}
            </div>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden lg:flex items-center gap-0.5 mx-auto bg-white/60 backdrop-blur rounded-full p-1 border border-ink/[0.06] shadow-sm">
            {visible.map((l) => {
              const active = isActive(l.href);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`relative inline-flex items-center gap-1.5 px-3 py-1.5 text-[12.5px] font-medium rounded-full transition-all whitespace-nowrap ${
                    active ? "text-white" : "text-ink/65 hover:text-ink hover:bg-ink/[0.04]"
                  }`}
                >
                  {active && (
                    <span
                      className="absolute inset-0 rounded-full"
                      style={{
                        background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
                        boxShadow: "0 4px 10px -2px rgba(99, 102, 241, 0.45), inset 0 1px 0 rgba(255,255,255,0.25)",
                      }}
                    />
                  )}
                  <span className="relative inline-flex items-center gap-1.5">
                    {l.icon}
                    {l.label}
                  </span>
                </Link>
              );
            })}
          </nav>

          {/* Right cluster: super admin link, profile, hamburger */}
          <div className="ml-auto flex items-center gap-2">
            {isSuperAdmin && (
              <Link
                href="/superadmin"
                className="hidden sm:inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-semibold border"
                style={{
                  borderColor: "rgba(99,102,241,0.3)",
                  background: "rgba(99,102,241,0.06)",
                  color: "#4f46e5",
                }}
              >
                <Shield size={12} /> Super Admin
              </Link>
            )}

            {/* Profile / actions */}
            <div ref={profileRef} className="relative">
              <button
                onClick={() => setProfileOpen((v) => !v)}
                className="flex items-center gap-2 px-1.5 py-1.5 rounded-full hover:bg-ink/[0.04] transition"
                aria-label="Profile menu"
              >
                <span
                  className="w-9 h-9 rounded-full flex items-center justify-center text-white text-[12px] font-bold relative"
                  style={{
                    background: avatarGradient,
                    boxShadow: `0 3px 8px -2px hsl(${hue}, 70%, 55%, 0.45), inset 0 1px 0 rgba(255,255,255,0.3)`,
                  }}
                >
                  {initials(userName || userEmail)}
                </span>
                <ChevronDown size={13} className="hidden sm:inline text-smoke" />
              </button>

              {profileOpen && (
                <div
                  className="absolute right-0 top-full mt-2 w-64 rounded-xl border border-ink/[0.08] shadow-xl overflow-hidden z-50"
                  style={{ background: "linear-gradient(180deg, #ffffff 0%, #fafbff 100%)" }}
                >
                  <div className="p-3 border-b border-ink/[0.06]">
                    <div className="flex items-center gap-3">
                      <span
                        className="w-10 h-10 rounded-full flex items-center justify-center text-white text-[13px] font-bold shrink-0"
                        style={{ background: avatarGradient }}
                      >
                        {initials(userName || userEmail)}
                      </span>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-ink truncate">
                          {userName || userEmail}
                        </div>
                        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-rust mt-0.5">
                          ● {role}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="py-1">
                    <ProfileItem href="/change-password" icon={<Key size={14} />} label="Change password" />
                    <ProfileItem href="/change-pin" icon={<Hash size={14} />} label="Change 4-digit PIN" />
                    <button
                      onClick={() => signOut({ callbackUrl: "/login" })}
                      className="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition"
                    >
                      <LogOut size={14} /> Sign out
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Hamburger for mobile */}
            <button
              onClick={() => setDrawerOpen(true)}
              className="lg:hidden p-2 rounded-md hover:bg-ink/[0.04] text-ink"
              aria-label="Open menu"
            >
              <Menu size={20} />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-[60] lg:hidden">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in"
            onClick={() => setDrawerOpen(false)}
          />
          <aside
            className="absolute right-0 top-0 bottom-0 w-80 max-w-[88vw] bg-white shadow-2xl flex flex-col animate-slide-in"
            style={{ background: "linear-gradient(180deg, #ffffff 0%, #fafbff 100%)" }}
          >
            <div className="flex items-center justify-between p-4 border-b border-ink/[0.06]">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                     style={{
                       background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #ec4899 100%)",
                       boxShadow: "0 4px 12px -2px rgba(99, 102, 241, 0.45)",
                     }}>
                  <span className="font-display text-white font-bold text-base leading-none">S</span>
                </div>
                <div className="leading-tight">
                  <div className="display text-lg font-semibold text-ink">Shiftwork</div>
                  {currentSlug && (
                    <div className="text-[10px] text-smoke font-mono -mt-0.5">/{currentSlug}</div>
                  )}
                </div>
              </div>
              <button
                onClick={() => setDrawerOpen(false)}
                className="p-2 rounded-md hover:bg-ink/[0.04] text-ink"
                aria-label="Close menu"
              >
                <X size={20} />
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto p-3">
              <div className="space-y-1">
                {visible.map((l) => {
                  const active = isActive(l.href);
                  return (
                    <Link
                      key={l.href}
                      href={l.href}
                      className="block"
                      onClick={() => setDrawerOpen(false)}
                    >
                      <div
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                          active ? "text-white" : "text-ink hover:bg-ink/[0.04]"
                        }`}
                        style={
                          active
                            ? {
                                background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
                                boxShadow: "0 4px 10px -2px rgba(99, 102, 241, 0.4)",
                              }
                            : undefined
                        }
                      >
                        <span className={active ? "text-white" : "text-smoke"}>{l.icon}</span>
                        {l.label}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </nav>

            <div className="p-3 border-t border-ink/[0.06]">
              <div className="flex items-center gap-3 mb-3 px-2">
                <span
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white text-[13px] font-bold shrink-0"
                  style={{ background: avatarGradient }}
                >
                  {initials(userName || userEmail)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-ink truncate">{userName || userEmail}</div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-rust mt-0.5">● {role}</div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-1">
                <Link href="/change-password" onClick={() => setDrawerOpen(false)} className="flex flex-col items-center gap-1 py-2 rounded-lg hover:bg-ink/[0.04] text-ink text-[11px]">
                  <Key size={14} /> Password
                </Link>
                <Link href="/change-pin" onClick={() => setDrawerOpen(false)} className="flex flex-col items-center gap-1 py-2 rounded-lg hover:bg-ink/[0.04] text-ink text-[11px]">
                  <Hash size={14} /> PIN
                </Link>
                <button
                  onClick={() => { setDrawerOpen(false); signOut({ callbackUrl: "/login" }); }}
                  className="flex flex-col items-center gap-1 py-2 rounded-lg hover:bg-red-50 text-red-600 text-[11px]"
                >
                  <LogOut size={14} /> Sign out
                </button>
              </div>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

function ProfileItem({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 px-3 py-2 text-sm text-ink hover:bg-ink/[0.04] transition"
    >
      <span className="text-smoke">{icon}</span>
      {label}
    </Link>
  );
}
