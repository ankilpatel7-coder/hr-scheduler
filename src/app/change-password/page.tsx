import { redirect } from "next/navigation";
import { getServerAuth } from "@/lib/auth";
import Navbar from "@/components/navbar";
import ChangePasswordForm from "./form";

export default async function ChangePasswordPage() {
  const session = await getServerAuth();
  if (!session) redirect("/login?from=/change-password");
  const isSuperAdmin = (session.user as any).superAdmin === true;
  return (
    <div className="min-h-screen">
      {!isSuperAdmin && <Navbar />}
      <main className="max-w-md mx-auto px-6 py-10">
        <div className="mb-6">
          <div className="label-eyebrow mb-1">Account</div>
          <h1 className="display text-3xl text-ink">Change password</h1>
          <p className="text-sm text-smoke mt-1">Signed in as {session.user?.email}</p>
        </div>
        <ChangePasswordForm />
      </main>
    </div>
  );
}
