import { PageHeader } from "@/components/ui/PageHeader";
import { ClientFabricBoard } from "@/components/pattern/library/ClientFabricBoard";

export default async function ClientFabricBoardPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  return (
    <div>
      <PageHeader
        title="Client fabrics"
        description="Sales-order fabrics plus pattern catalog fabrics — preview, specs and prep status. Tick SO fabrics and group them into garments."
      />
      <ClientFabricBoard clientId={clientId} />
    </div>
  );
}
