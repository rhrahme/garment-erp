import { notFound } from "next/navigation";
import { BaseSizeSheetPrintView } from "@/components/pattern/library/BaseSizeSheetPrintView";
import { getSessionContext } from "@/lib/auth/session";
import { ensurePatternLibraryLoaded, getBasePatternByIdFresh } from "@/lib/data/pattern-library";

export const dynamic = "force-dynamic";

export default async function BaseSizeSheetPrintPage({
  params,
}: {
  params: Promise<{ baseId: string; size: string }>;
}) {
  const { baseId, size: rawSize } = await params;
  const size = decodeURIComponent(rawSize);

  const session = await getSessionContext();
  if (!session.canAccessPattern) notFound();

  await ensurePatternLibraryLoaded();
  const base = await getBasePatternByIdFresh(baseId);
  if (!base || !base.sizes.includes(size)) notFound();

  return <BaseSizeSheetPrintView base={base} size={size} />;
}
