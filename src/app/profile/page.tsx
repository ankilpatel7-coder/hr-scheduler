"use client";
import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function ProfilePage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    } else if (status === "authenticated") {
      const id = (session?.user as any)?.id;
      if (id) router.replace(`/employees/${id}`);
    }
  }, [status, session, router]);

  return (
    <div className="min-h-screen flex items-center justify-center text-smoke">
      Redirecting to your profile…
    </div>
  );
}
