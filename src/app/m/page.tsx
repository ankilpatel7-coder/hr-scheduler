import { redirect } from "next/navigation";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { getServerAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Clock, Calendar, FileText, LogOut, Hash } from "lucide-react";
import MobileSignOutButton from "./signout-button";

export const dynamic = "force-dynamic";

export default async function MobileHome() {
  const session = await getServerAuth();
  if (!session) redirect("/m/login");

  const userId = (session.user as any).id;
  const tenantId = (session.user as any).tenantId;
  const isSuperAdmin = (session.user as any).superAdmin === true;
  if (isSuperAdmin) redirect("/superadmin");
  if (!tenantId) redirect("/m/login");

  // Current open clock entry (if any)
  const openClock = await prisma.clockEntry.findFirst({
    where: { userId, tenantId, clockOut: null },
    orderBy: { clockIn: "desc" },
  });

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { businessName: true } });

  const clockedIn = !!openClock;

  return (
    <div className="min-h-screen flex flex-col p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-smoke">{tenant?.businessName}</div>
          <div className="font-medium text-ink">{session.user?.name}</div>
        </div>
        <MobileSignOutButton />
      </div>

      {/* Status badge */}
      <div className="mt-8 text-center">
        {clockedIn ? (
          <>
            <div className="inline-flex items-center gap-2 chip" style={{ color: "#059669", borderColor: "rgba(16,185,129,0.4)", background: "rgba(16,185,129,0.1)" }}>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> CLOCKED IN
            </div>
            <div className="display text-3xl text-ink mt-3">
              Since {new Date(openClock!.clockIn).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            </div>
          </>
        ) : (
          <>
            <div className="inline-flex items-center gap-2 chip" style={{ color: "#64748b" }}>
              <span className="w-2 h-2 rounded-full bg-smoke" /> NOT CLOCKED IN
            </div>
            <div className="display text-2xl text-ink mt-3">Ready to clock in</div>
          </>
        )}
      </div>

      {/* Big clock-in/out button */}
      <Link
        href="/m/clock"
        className={`mt-10 mx-auto w-48 h-48 rounded-full flex flex-col items-center justify-center text-white font-medium shadow-lg active:scale-95 transition ${
          clockedIn ? "bg-rose" : "bg-rust"
        }`}
        style={{ boxShadow: clockedIn ? "0 8px 32px rgba(244,63,94,0.4)" : "0 8px 32px rgba(99,102,241,0.4)" }}
      >
        <Clock size={48} />
        <span className="mt-2 text-lg">{clockedIn ? "Clock OUT" : "Clock IN"}</span>
      </Link>

      {/* Nav */}
      <div className="mt-auto grid grid-cols-3 gap-3">
        <Link href="/m/shifts" className="card p-4 text-center hover:bg-ink/5 active:bg-ink/10">
          <Calendar size={20} className="mx-auto text-rust" />
          <div className="text-xs text-ink mt-2">My Shifts</div>
        </Link>
        <Link href="/m/paystubs" className="card p-4 text-center hover:bg-ink/5 active:bg-ink/10">
          <FileText size={20} className="mx-auto text-rust" />
          <div className="text-xs text-ink mt-2">Paystubs</div>
        </Link>
        <Link href="/change-pin" className="card p-4 text-center hover:bg-ink/5 active:bg-ink/10">
          <Hash size={20} className="mx-auto text-rust" />
          <div className="text-xs text-ink mt-2">Change PIN</div>
        </Link>
      </div>
    </div>
  );
}
