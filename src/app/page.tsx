import { redirect } from "next/navigation";
import { defaultPathForSession } from "@/lib/auth/permissions";
import { getSessionContext } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export default async function Home() {
  if (!isSupabaseConfigured()) {
    redirect("/login");
  }

  const session = await getSessionContext();
  if (!session.userId && !session.email) {
    redirect("/login");
  }

  redirect(defaultPathForSession({
    isClientManager: session.isClientManager,
    isTaskOperator: session.isTaskOperator,
  }));
}
