import { notFound } from "next/navigation";
import { PatternHowToPrintView } from "@/components/pattern/PatternHowToPrintView";
import { getSessionContext } from "@/lib/auth/session";
import { PATTERN_HOWTO_NOTICES } from "@/lib/pattern/pattern-operator-notice-copy";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ id?: string }>;
};

export default async function PatternHowToPrintPage({ searchParams }: PageProps) {
  const session = await getSessionContext();
  if (!session.canAccessPattern) notFound();

  const { id } = await searchParams;
  const wanted = id?.trim() || "";
  const items = wanted
    ? PATTERN_HOWTO_NOTICES.filter((howto) => howto.id === wanted)
    : PATTERN_HOWTO_NOTICES;
  if (items.length === 0) notFound();

  return <PatternHowToPrintView items={items} />;
}
