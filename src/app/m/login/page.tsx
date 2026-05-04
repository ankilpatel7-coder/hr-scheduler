import { redirect } from "next/navigation";
import { getServerAuth } from "@/lib/auth";
import MobileLoginForm from "./form";

export const dynamic = "force-dynamic";

export default async function MobileLogin() {
  const session = await getServerAuth();
  if (session) redirect("/m");
  return <MobileLoginForm />;
}
