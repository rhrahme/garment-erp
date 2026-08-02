import { notFound } from "next/navigation";
import { BaseSizeSheetPrintView } from "@/components/pattern/library/BaseSizeSheetPrintView";
import { getSessionContext } from "@/lib/auth/session";
import { ensurePatternLibraryLoaded, getBasePatternByIdFresh } from "@/lib/data/pattern-library";

export const dynamic = "force-dynamic";

export default async function BaseSizeSheetPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ baseId: string; size: string }>;
  searchParams: Promise<{ client?: string }>;
}) {
  const { baseId, size: rawSize } = await params;
  const { client: clientId } = await searchParams;
  const size = decodeURIComponent(rawSize);

  const session = await getSessionContext();
  if (!session.canAccessPattern) notFound();

  await ensurePatternLibraryLoaded();
  const base = await getBasePatternByIdFresh(baseId);
  if (!base || !base.sizes.includes(size)) notFound();

  // ?client= prints the client's fit column next to the base size values.
  const clientColumn = clientId
    ? base.client_columns?.find((column) => column.client_id === clientId) ?? null
    : null;

  return <BaseSizeSheetPrintView base={base} size={size} clientColumn={clientColumn} />;
}
