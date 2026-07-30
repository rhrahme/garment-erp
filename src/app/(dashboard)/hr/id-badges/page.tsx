import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth/session";

export default async function HrIdBadgesIndexPage() {
  const session = await getSessionContext();
  // QC lands on Expats only; admin / factory managers keep Saudis as default.
  redirect(session.isClientManager ? "/hr/id-badges/expats" : "/hr/id-badges/saudis");
}
