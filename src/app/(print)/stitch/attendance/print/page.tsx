import { notFound } from "next/navigation";
import { HereAttendancePrintView } from "@/components/production/HereAttendancePrintView";
import { getSessionContext } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ copies?: string }>;
};

export default async function StitchAttendancePrintPage({ searchParams }: PageProps) {
  const session = await getSessionContext();
  if (!session.isAdmin) {
    notFound();
  }

  const { copies } = await searchParams;
  const parsed = Number.parseInt(copies ?? "6", 10);
  return <HereAttendancePrintView copies={Number.isFinite(parsed) ? parsed : 6} />;
}
