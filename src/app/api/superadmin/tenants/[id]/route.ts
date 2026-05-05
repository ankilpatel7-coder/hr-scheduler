/**
 * Super-admin single-tenant API.
 *
 * GET    /api/superadmin/tenants/[id]   → tenant detail
 * PATCH  /api/superadmin/tenants/[id]   → update mutable fields
 * DELETE /api/superadmin/tenants/[id]   → soft-delete (sets active=false)
 *
 * All require super-admin authentication.
 *
 * NOTE: Slug cannot be changed once a tenant is live (it's the URL — changing it
 * would break bookmarks and the auth session of currently-logged-in admins).
 * If you need a different slug, deactivate this tenant and create a new one.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/tenant";
import { isValidTimezone } from "@/lib/timezones";

const VALID_STATES = new Set([
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT",
  "NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC",
]);

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireSuperAdmin();
  if ("error" in auth) return auth.error;

  const tenant = await prisma.tenant.findUnique({
    where: { id: params.id },
    include: {
      _count: { select: { users: true, locations: true, shifts: true, clockEntries: true, payPeriods: true } },
    },
  });
  if (!tenant) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ tenant });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireSuperAdmin();
  if ("error" in auth) return auth.error;

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const tenant = await prisma.tenant.findUnique({ where: { id: params.id } });
  if (!tenant) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Whitelist of editable fields
  const data: any = {};
  if ("businessName" in body) {
    const v = String(body.businessName ?? "").trim();
    if (!v) return NextResponse.json({ error: "Business name cannot be empty." }, { status: 400 });
    data.businessName = v;
  }
  if ("legalName" in body) data.legalName = String(body.legalName ?? "").trim() || null;
  if ("state" in body) {
    const v = String(body.state).toUpperCase();
    if (!VALID_STATES.has(v)) return NextResponse.json({ error: "Invalid state." }, { status: 400 });
    data.state = v;
  }
  if ("timezone" in body) {
    const v = String(body.timezone).trim();
    if (!isValidTimezone(v)) return NextResponse.json({ error: `Invalid timezone '${v}'.` }, { status: 400 });
    data.timezone = v;
  }
  if ("addressLine1" in body) data.addressLine1 = String(body.addressLine1 ?? "").trim() || null;
  if ("addressLine2" in body) data.addressLine2 = String(body.addressLine2 ?? "").trim() || null;
  if ("city" in body) data.city = String(body.city ?? "").trim() || null;
  if ("zip" in body) data.zip = String(body.zip ?? "").trim() || null;
  if ("phone" in body) data.phone = String(body.phone ?? "").trim() || null;
  if ("federalEIN" in body) data.federalEIN = String(body.federalEIN ?? "").replace(/\D/g, "") || null;
  if ("stateTaxId" in body) data.stateTaxId = String(body.stateTaxId ?? "").trim() || null;
  if ("active" in body) data.active = !!body.active;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No fields to update." }, { status: 400 });
  }

  const updated = await prisma.tenant.update({ where: { id: params.id }, data });
  return NextResponse.json({ tenant: updated });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireSuperAdmin();
  if ("error" in auth) return auth.error;

  const tenant = await prisma.tenant.findUnique({ where: { id: params.id } });
  if (!tenant) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Soft-delete: just deactivate. Hard-delete would cascade and lose data.
  const updated = await prisma.tenant.update({
    where: { id: params.id },
    data: { active: false },
  });
  return NextResponse.json({ tenant: updated, deactivated: true });
}
