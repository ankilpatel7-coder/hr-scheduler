import { redirect } from "next/navigation";
import { getServerAuth } from "@/lib/auth";
import AdminNav from "@/components/admin-nav";

export const metadata = {
  title: "Shiftwork — Super Admin",
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerAuth();

  // Not logged in → login
  if (!session) {
    redirect("/login?from=/_admin");
  }

  // Logged in but not a super-admin → kick to root
  if (!(session.user as any).superAdmin) {
    redirect("/");
  }

  return (
    <div className="min-h-screen bg-paper">
      <AdminNav userName={(session.user as any).name ?? "Admin"} />
      <main className="max-w-[1200px] mx-auto px-6 py-10">{children}</main>
    </div>
  );
}
