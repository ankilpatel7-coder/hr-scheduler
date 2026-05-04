"use client";

import { useEffect } from "react";
import { signOut } from "next-auth/react";

/**
 * Auto-signout recovery component.
 * Used when /m detects a partial/stale session (e.g. JWT from before
 * tenantId/superAdmin fields existed). Calls NextAuth signOut() programmatically
 * to clear the cookie, then redirects to /m/login. No user click required.
 */
export default function AutoSignout() {
  useEffect(() => {
    signOut({ callbackUrl: "/m/login", redirect: true });
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-paper">
      <div className="text-center">
        <div className="display text-2xl text-ink mb-2">Refreshing your session…</div>
        <div className="text-sm text-smoke">You&apos;ll be sent to the login screen in a moment.</div>
      </div>
    </div>
  );
}
