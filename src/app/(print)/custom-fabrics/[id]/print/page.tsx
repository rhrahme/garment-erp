import { notFound } from "next/navigation";
import { CustomFabricFilingPrintView } from "@/components/fabric-specification/CustomFabricFilingPrintView";
import { getSessionContext } from "@/lib/auth/session";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { getCustomFabricById } from "@/lib/data/custom-fabrics";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function CustomFabricFilingPrintPage({ params }: PageProps) {
  await getSessionContext();
  const { id } = await params;
  await ensureDocumentsLoaded(["custom_fabrics"]);
  const fabric = getCustomFabricById(id);
  if (!fabric) notFound();

  return <CustomFabricFilingPrintView fabric={fabric} />;
}
