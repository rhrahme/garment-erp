import { redirect } from "next/navigation";
import { defaultPathForSession } from "@/lib/auth/permissions";
import { getSessionContext } from "@/lib/auth/session";

export default async function Home() {
  const session = await getSessionContext();
  redirect(defaultPathForSession(session.isClientManager));
}
