/**
 * Per-tenant PWA manifest. When an employee installs the kiosk page to their
 * home screen, the icon opens at /m/kiosk/<tenant> directly — not the generic /m.
 *
 * URL: /api/manifest/<tenant-slug>
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(_req: Request, { params }: { params: { tenant: string } }) {
  const tenant = await prisma.tenant.findUnique({
    where: { slug: params.tenant },
    select: { businessName: true, active: true },
  });
  if (!tenant || !tenant.active) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const manifest = {
    name: `${tenant.businessName} — Clock-in`,
    short_name: tenant.businessName,
    description: `Clock-in app for ${tenant.businessName}`,
    start_url: `/m/kiosk/${params.tenant}`,
    scope: `/m/kiosk/${params.tenant}`,
    display: "standalone",
    orientation: "portrait",
    background_color: "#fafbfc",
    theme_color: "#6366f1",
    icons: [
      { src: "/icon-192.svg", sizes: "192x192", type: "image/svg+xml", purpose: "any maskable" },
      { src: "/icon-512.svg", sizes: "512x512", type: "image/svg+xml", purpose: "any maskable" },
    ],
  };

  return NextResponse.json(manifest, {
    headers: {
      "Cache-Control": "public, max-age=300", // 5 minute cache
    },
  });
}
