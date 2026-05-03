/**
 * v12 multi-tenant middleware.
 *
 * Resolves the tenant from the URL path (path-based routing for v12).
 *
 * URL conventions:
 *   /                           → redirect to /login (or to user's tenant home if logged in)
 *   /login, /signup             → auth pages, no tenant context
 *   /api/auth/*                 → NextAuth, no tenant context
 *   /api/_admin/*               → super-admin API, gated by superAdmin flag
 *   /_admin, /_admin/*          → super-admin console pages, no tenant context
 *   /_next/*, /favicon.ico, etc → static assets, pass through
 *   /<slug>/*                   → tenant pages; <slug> looked up by tenantId in DB
 *   /api/<slug>/*               → tenant API routes (slug + path)
 *
 * What this middleware does:
 *   - Identifies whether the request is tenant-scoped, super-admin, auth, or static.
 *   - For tenant-scoped requests, sets `x-tenant-slug` header so downstream code
 *     can resolve the tenant via lib/tenant.ts.
 *   - Does NOT do DB lookups (Edge runtime restriction). Slug validation/lookup
 *     happens in pages/API handlers via getTenantFromHeaders().
 *   - Validates slug shape (lowercase letters, numbers, hyphens; 2-32 chars).
 *
 * Reserved top-level path segments — cannot be tenant slugs:
 *   _admin, _next, api, login, signup, signout, logout, favicon.ico, robots.txt, sitemap.xml
 */

import { NextResponse, type NextRequest } from "next/server";

const RESERVED_PATHS = new Set([
  "_admin", "_next", "api", "login", "signup", "signout", "logout",
  "favicon.ico", "robots.txt", "sitemap.xml",
]);

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/;

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Strip leading slash, get first segment
  const segments = pathname.replace(/^\/+/, "").split("/");
  const first = segments[0] ?? "";

  // Root → handled by the page (will redirect to /login if no session)
  if (pathname === "/" || pathname === "") {
    return NextResponse.next();
  }

  // Reserved paths pass through with no tenant context
  if (RESERVED_PATHS.has(first)) {
    return NextResponse.next();
  }

  // For /api/<slug>/*: extract slug from second segment
  // (api routes shaped as /api/<tenant-slug>/<resource> for tenant-scoped APIs;
  //  legacy /api/<resource> routes resolve tenant via session instead)
  if (first === "api" && segments.length >= 2 && !["auth", "_admin"].includes(segments[1])) {
    const apiSlug = segments[1];
    if (SLUG_RE.test(apiSlug)) {
      const headers = new Headers(req.headers);
      headers.set("x-tenant-slug", apiSlug);
      return NextResponse.next({ request: { headers } });
    }
    // If second segment doesn't look like a slug, it's a legacy /api/<resource>
    // route — pass through without tenant header; the route reads from session.
    return NextResponse.next();
  }

  // First segment looks like a tenant slug
  if (SLUG_RE.test(first)) {
    const headers = new Headers(req.headers);
    headers.set("x-tenant-slug", first);
    return NextResponse.next({ request: { headers } });
  }

  // Unknown path — pass through, page will 404
  return NextResponse.next();
}

export const config = {
  // Run on everything except static assets that Next.js handles
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"],
};
