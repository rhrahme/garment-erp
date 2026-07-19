import { NextResponse } from "next/server";
import { getClientById } from "@/lib/data/clients";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { verifyApiKey } from "@/lib/integrations/api-auth";
import { updateSalesClientDetails } from "@/lib/sales/mutations";
import type { ClientFabricSelection } from "@/lib/types/sales-workspace";

export async function POST(request: Request) {
  const authError = verifyApiKey(request);
  if (authError) return authError;
  await ensureDocumentsLoaded(["clients", "sales_workspace"]);
  const body = (await request.json()) as {
    client_id?: string;
    measurements?: unknown;
    fabric_selection?: Partial<ClientFabricSelection>;
  };
  const clientId = String(body.client_id ?? "").trim();
  if (!clientId || !getClientById(clientId)) {
    return NextResponse.json({ error: "Client not found." }, { status: 404 });
  }
  try {
    const details = await updateSalesClientDetails(
      clientId,
      { measurements: body.measurements, fabric_selection: body.fabric_selection },
      "api",
      "api"
    );
    return NextResponse.json({ details });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid details." },
      { status: 400 }
    );
  }
}
