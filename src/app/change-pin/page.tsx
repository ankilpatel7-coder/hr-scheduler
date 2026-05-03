import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Smartphone } from "lucide-react";
import { getServerAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import Navbar from "@/components/navbar";
import PinForm from "./pin-form";

export const dynamic = "force-dynamic";

export default async function ChangePinPage() {
  const session = await getServerAuth();
  if (!session) redirect("/login?from=/change-pin");
  const isSuperAdmin = (session.user as any).superAdmin === true;
  const userId = (session.user as any).id;

  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { pinHash: true, pinUpdatedAt: true },
  });

  return (
    <div className="min-h-screen">
      {!isSuperAdmin && <Navbar />}
      <main className="max-w-md mx-auto px-6 py-10 space-y-5">
        <Link href="/change-password" className="text-smoke hover:text-ink text-sm inline-flex items-center gap-1">
          <ArrowLeft size={14} /> Change password instead
        </Link>
        <div>
          <div className="label-eyebrow mb-1">Mobile clock-in PIN</div>
          <h1 className="display text-3xl text-ink">Set your 4-digit PIN</h1>
          <p className="text-sm text-smoke mt-1 flex items-start gap-2">
            <Smartphone size={14} className="shrink-0 mt-0.5" />
            <span>Used for fast clock-in/out from the mobile app. Pick a 4-digit number that&apos;s easy for you to remember but not too obvious.</span>
          </p>
          {me?.pinUpdatedAt && (
            <p className="text-[11px] text-smoke mt-2">PIN last updated: {new Date(me.pinUpdatedAt).toLocaleString()}</p>
          )}
        </div>
        <PinForm hasExistingPin={!!me?.pinHash} />
      </main>
    </div>
  );
}
