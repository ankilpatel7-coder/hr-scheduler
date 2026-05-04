import { redirect } from "next/navigation";
import { getServerAuth } from "@/lib/auth";
import MobileLoginForm from "./form";

export const dynamic = "force-dynamic";

export default async function MobileLogin() {
  const session = await getServerAuth();
  if (session) {
    const isSuperAdmin = (session.user as any).superAdmin === true;
    const tenantId = (session.user as any).tenantId;
    // Only redirect away from login if the session is FULLY VALID for /m.
    // Otherwise, stay on the login form so the user can sign in fresh.
    // (Avoids /m → /m/login → /m loop when session is partial/stale.)
    if (isSuperAdmin) redirect("/superadmin");
    if (tenantId) redirect("/m");
  }
  return <MobileLoginForm />;
}
