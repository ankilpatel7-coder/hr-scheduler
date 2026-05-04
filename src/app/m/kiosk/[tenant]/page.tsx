/**
 * Kiosk PIN-only login page.
 * URL: /m/kiosk/<tenant-slug>
 * Employees just tap their 4-digit PIN — no email needed.
 * After clock action, auto-signs-out so the next employee can use the device.
 */

import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import KioskForm from "./form";
import InstallPrompt from "./install-prompt";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { tenant: string } }): Promise<Metadata> {
  const tenant = await prisma.tenant.findUnique({
    where: { slug: params.tenant },
    select: { businessName: true },
  });
  return {
    title: tenant ? `${tenant.businessName} — Clock-in` : "Shiftwork Clock-in",
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: tenant?.businessName ?? "Clock-in",
    },
  };
}

export default async function KioskPage({ params }: { params: { tenant: string } }) {
  const tenant = await prisma.tenant.findUnique({
    where: { slug: params.tenant },
    select: { id: true, slug: true, businessName: true, active: true },
  });
  if (!tenant || !tenant.active) notFound();

  return (
    <>
      <KioskForm tenantSlug={tenant.slug} businessName={tenant.businessName} />
      <InstallPrompt tenantSlug={tenant.slug} businessName={tenant.businessName} />
    </>
  );
}
