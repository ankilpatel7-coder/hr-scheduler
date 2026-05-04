/**
 * NextAuth setup — v12 changes:
 *   - Session token now includes tenantId and superAdmin flag.
 *   - On login, user can authenticate from any tenant context (or none for super-admins).
 *   - Future: super-admin can "impersonate" / view-as a tenant via a tenantOverride
 *     on the session (not implemented in Phase A).
 */

import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./db";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        kioskTenantSlug: { label: "Kiosk Tenant Slug", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.password) return null;

        // KIOSK MODE (v13.1): PIN-only login within a specific tenant.
        // Caller passes kioskTenantSlug + 4-digit PIN. We find any user in that
        // tenant whose PIN matches. Requires unique PINs within the tenant
        // (if 2+ users have same PIN, login is rejected for safety).
        if (credentials.kioskTenantSlug && /^\d{4}$/.test(credentials.password)) {
          const tenant = await prisma.tenant.findUnique({
            where: { slug: credentials.kioskTenantSlug },
            select: { id: true, active: true },
          });
          if (!tenant || !tenant.active) return null;

          const candidates = await prisma.user.findMany({
            where: {
              tenantId: tenant.id,
              active: true,
              pinHash: { not: null },
            },
          });

          const matches = [];
          for (const u of candidates) {
            if (u.pinHash && await bcrypt.compare(credentials.password, u.pinHash)) {
              matches.push(u);
            }
          }

          if (matches.length === 0) return null;
          if (matches.length > 1) {
            // PIN collision — reject to avoid signing in the wrong person.
            // Both employees should change to unique PINs via /change-pin.
            console.warn(`[kiosk] PIN collision in tenant ${credentials.kioskTenantSlug}: ${matches.length} matches`);
            return null;
          }
          const user = matches[0];
          return {
            id: user.id, email: user.email, name: user.name,
            role: user.role, tenantId: user.tenantId, superAdmin: user.superAdmin,
          } as any;
        }

        // REGULAR LOGIN: email + password (or 4-digit PIN as fallback)
        if (!credentials.email) return null;
        const user = await prisma.user.findUnique({
          where: { email: credentials.email.toLowerCase() },
        });
        if (!user || !user.active) return null;

        let ok = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!ok && /^\d{4}$/.test(credentials.password) && user.pinHash) {
          ok = await bcrypt.compare(credentials.password, user.pinHash);
        }
        if (!ok) return null;

        return {
          id: user.id, email: user.email, name: user.name,
          role: user.role, tenantId: user.tenantId, superAdmin: user.superAdmin,
        } as any;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = (user as any).id;
        token.role = (user as any).role;
        token.tenantId = (user as any).tenantId ?? null;
        token.superAdmin = (user as any).superAdmin === true;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id;
        (session.user as any).role = token.role;
        (session.user as any).tenantId = (token as any).tenantId ?? null;
        (session.user as any).superAdmin = (token as any).superAdmin === true;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};

export async function getServerAuth() {
  const { getServerSession } = await import("next-auth");
  return getServerSession(authOptions);
}
