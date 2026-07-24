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
        description="Every fabric article on this client's sales orders — preview, specs and prep status. Tick fabrics and group them into garments."
      />
      <ClientFabricBoard clientId={clientId} />
    </div>
  );
}
