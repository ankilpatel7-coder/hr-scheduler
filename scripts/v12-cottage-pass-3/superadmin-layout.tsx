import { redirect } from "next/navigation";
import { getServerAuth } from "@/lib/auth";
import SuperadminShell from "@/components/app-shell/superadmin-shell";

export const dynamic = "force-dynamic";

export default async function SuperadminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerAuth();
  if (!session) redirect("/login?from=/superadmin");
  const isSuperAdmin = (session.user as any).superAdmin === true;
  if (!isSuperAdmin) redirect("/");

  return (
    <SuperadminShell userName={(session.user as any).name ?? "Super admin"}>
      {children}
    </SuperadminShell>
  );
}
