import { notFound } from "next/navigation";
import { BasePatternPrintView } from "@/components/pattern/library/BasePatternPrintView";
import { getSessionContext } from "@/lib/auth/session";
import { ensurePatternLibraryLoaded, getBasePatternByIdFresh } from "@/lib/data/pattern-library";

export const dynamic = "force-dynamic";

export default async function BasePatternPrintPage({
  params,
}: {
  params: Promise<{ baseId: string }>;
}) {
  const { baseId } = await params;

  const session = await getSessionContext();
  if (!session.canAccessPattern) notFound();

  await ensurePatternLibraryLoaded();
  const base = await getBasePatternByIdFresh(baseId);
  if (!base) notFound();

  return <BasePatternPrintView base={base} />;
}
