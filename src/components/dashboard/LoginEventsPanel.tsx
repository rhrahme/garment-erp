import Link from "next/link";
import { LoginEventsTable } from "@/components/admin/LoginEventsTable";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { listLoginEvents } from "@/lib/data/login-events";

export async function LoginEventsPanel() {
  const events = await listLoginEvents(8);
  if (events.length === 0) return null;

  return (
    <div id="login-log" className="mb-8">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Recent logins</CardTitle>
            <Link href="/logins" className="text-sm font-medium text-indigo-700 hover:underline">
              Full login log
            </Link>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <LoginEventsTable events={events} />
        </CardContent>
      </Card>
    </div>
  );
}
