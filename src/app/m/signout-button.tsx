"use client";

import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";

export default function MobileSignOutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/m/login" })}
      className="text-smoke hover:text-rose p-2"
      aria-label="Sign out"
    >
      <LogOut size={20} />
    </button>
  );
}
