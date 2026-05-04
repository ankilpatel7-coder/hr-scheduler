/**
 * Kiosk PIN-only login page.
 * URL: /m/kiosk/<tenant-slug>
 * Employees just tap their 4-digit PIN — no email needed.
 * After clock action, auto-signs-out so the next employee can use the device.
 */

import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import KioskForm from "./form";

export const dynamic = "force-dynamic";

export default async function KioskPage({ params }: { params: { tenant: string } }) {
  const tenant = await prisma.tenant.findUnique({
    where: { slug: params.tenant },
    select: { id: true, slug: true, businessName: true, active: true },
  });
  if (!tenant || !tenant.active) notFound();

  return <KioskForm tenantSlug={tenant.slug} businessName={tenant.businessName} />;
}
