import { redirect } from "next/navigation";
import { LoginEventsTable } from "@/components/admin/LoginEventsTable";
import { Card, CardContent } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { getSessionContext } from "@/lib/auth/session";
import { listLoginEvents } from "@/lib/data/login-events";

export const dynamic = "force-dynamic";

export default async function LoginsPage() {
  const session = await getSessionContext();
  if (!session.isAdmin) {
    redirect("/dashboard");
  }

  const events = await listLoginEvents(300);

  return (
    <div>
      <PageHeader
        title="Login log"
        description="Who signed in or failed, with time (Riyadh), device, and IP"
      />
      <Card>
        <CardContent className="p-0">
          <LoginEventsTable events={events} />
        </CardContent>
      </Card>
    </div>
  );
}
