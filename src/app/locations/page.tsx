import { redirectToTenant } from "@/lib/redirect-to-tenant";
export const dynamic = "force-dynamic";
export default async function Stub() { return redirectToTenant("/locations"); }
