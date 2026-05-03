import { redirectToTenant } from "@/lib/redirect-to-tenant";
export const dynamic = "force-dynamic";
export default async function Stub({ params }: { params: { id: string } }) {
  return redirectToTenant(`/payroll/${params.id}`);
}
