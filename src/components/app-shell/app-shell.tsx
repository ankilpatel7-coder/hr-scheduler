"use client";

import { usePathname } from "next/navigation";
import Sidebar from "./sidebar";
import MobileTopbar from "./mobile-topbar";
import type { Role } from "./nav-items";

// Pages that should render bare — no sidebar, no topbar.
// Kiosk/clock-in screens are full-bleed by design.
const BARE_PATTERNS = [/\/clock(\/|$)/, /\/pin-clock(\/|$)/, /\/login(\/|$)/, /\/kiosk(\/|$)/];

export default function AppShell({
  tenant,
  businessName,
  userName,
  userRole,
  children,
}: {
  tenant: string;
  businessName: string;
  userName: string | null;
  userRole: Role;
  children: React.ReactNode;
}) {
  const pathname = usePathname() || "";
  if (BARE_PATTERNS.some((re) => re.test(pathname))) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen flex bg-bone text-ink">
      <Sidebar tenant={tenant} businessName={businessName} userName={userName} userRole={userRole} />
      <div className="flex-1 min-w-0 flex flex-col">
        <MobileTopbar tenant={tenant} businessName={businessName} userRole={userRole} />
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
