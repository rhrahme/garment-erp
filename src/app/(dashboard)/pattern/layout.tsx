import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth/session";

export default async function PatternLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionContext();
  if (!session.canAccessPattern) {
    redirect("/dashboard");
  }
  return children;
}
