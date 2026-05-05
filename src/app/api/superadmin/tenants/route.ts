/**
 * Super-admin tenants API.
 *
 * GET  /api/superadmin/tenants     → list all tenants
 * POST /api/superadmin/tenants     → create new tenant + initial admin user
 *
 * Both require super-admin authentication.
 */

import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/tenant";
import { isValidTimezone, DEFAULT_TIMEZONE } from "@/lib/timezones";

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/;
const RESERVED_SLUGS = new Set([
  "superadmin", "_next", "api", "login", "signup", "signout", "logout",
  "favicon.ico", "robots.txt", "sitemap.xml", "admin", "settings",
  "dashboard", "schedule", "timesheets", "employees", "profile",
]);

const VALID_STATES = new Set([
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT",
  "NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC",
]);

function generateTempPassword(): string {
  return randomBytes(12).toString("base64").replace(/[+/=]/g, "").slice(0, 16);
}

export async function GET() {
  const auth = await requireSuperAdmin();
  if ("error" in auth) return auth.error;

  const tenants = await prisma.tenant.findMany({
    orderBy: [{ active: "desc" }, { createdAt: "desc" }],
    include: {
      _count: { select: { users: true, locations: true } },
    },
  });
  return NextResponse.json({ tenants });
}

export async function POST(req: Request) {
  const auth = await requireSuperAdmin();
  if ("error" in auth) return auth.error;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Validate
  const slug = String(body.slug ?? "").toLowerCase().trim();
  if (!SLUG_RE.test(slug)) {
    return NextResponse.json({ error: "Slug must be 2-32 chars, lowercase letters/numbers/hyphens, can't start or end with hyphen." }, { status: 400 });
  }
  if (RESERVED_SLUGS.has(slug)) {
    return NextResponse.json({ error: `'${slug}' is reserved. Choose a different slug.` }, { status: 400 });
  }

  const businessName = String(body.businessName ?? "").trim();
  if (!businessName) {
    return NextResponse.json({ error: "Business name is required." }, { status: 400 });
  }

  const state = String(body.state ?? "").toUpperCase().trim();
  if (!VALID_STATES.has(state)) {
    return NextResponse.json({ error: "Invalid state code." }, { status: 400 });
  }

  const timezone = String(body.timezone ?? DEFAULT_TIMEZONE).trim();
  if (!isValidTimezone(timezone)) {
    return NextResponse.json({ error: `Invalid timezone '${timezone}'.` }, { status: 400 });
  }

  const adminEmail = String(body.adminEmail ?? "").toLowerCase().trim();
  if (!adminEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
    return NextResponse.json({ error: "Valid admin email is required." }, { status: 400 });
  }

  const adminName = String(body.adminName ?? "").trim();
  if (!adminName) {
    return NextResponse.json({ error: "Admin name is required." }, { status: 400 });
  }

  // Check uniqueness
  const existingSlug = await prisma.tenant.findUnique({ where: { slug } });
  if (existingSlug) {
    return NextResponse.json({ error: `Slug '${slug}' is already in use.` }, { status: 409 });
  }
  const existingEmail = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (existingEmail) {
    return NextResponse.json({ error: `User with email '${adminEmail}' already exists.` }, { status: 409 });
  }

  const tempPassword = generateTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 10);

  // Create tenant + admin in single transaction
  const result = await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: {
        slug,
        businessName,
        legalName: body.legalName?.trim() || null,
        state: state as any,
        timezone,
        addressLine1: body.addressLine1?.trim() || null,
        city: body.city?.trim() || null,
        zip: body.zip?.trim() || null,
        phone: body.phone?.trim() || null,
        federalEIN: body.federalEIN?.replace(/\D/g, "") || null,
        stateTaxId: body.stateTaxId?.trim() || null,
        active: true,
      },
    });

    const admin = await tx.user.create({
      data: {
        email: adminEmail,
        name: adminName,
        passwordHash,
        role: "ADMIN",
        tenantId: tenant.id,
        superAdmin: false,
        active: true,
      },
    });

    return { tenant, admin };
  });

  return NextResponse.json({
    tenant: result.tenant,
    admin: { id: result.admin.id, email: result.admin.email, name: result.admin.name },
    tempPassword,
  });
}
