import { NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/integrations/api-auth";
import { getClientById, readClients } from "@/lib/data/clients";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { addReadyMadeSample } from "@/lib/clients/ready-made-samples";

/** Zapier parity for client ready-made samples. */
export async function GET(request: Request) {
  const authError = verifyApiKey(request);
  if (authError) return authError;
  await ensureDocumentsLoaded(["clients"]);

  const clientId = new URL(request.url).searchParams.get("client_id")?.trim() ?? "";
  if (clientId) {
    const client = getClientById(clientId);
    if (!client) {
      return NextResponse.json({ error: "Client not found." }, { status: 404 });
    }
    return NextResponse.json({
      client_id: client.id,
      client_code: client.code,
      samples: client.ready_made_samples ?? [],
    });
  }

  const rows = readClients()
    .clients.filter((client) => (client.ready_made_samples ?? []).length > 0)
    .map((client) => ({
      client_id: client.id,
      client_code: client.code,
      samples: client.ready_made_samples ?? [],
    }));
  return NextResponse.json({ clients: rows });
}

export async function POST(request: Request) {
  const authError = verifyApiKey(request);
  if (authError) return authError;
  await ensureDocumentsLoaded(["clients"]);

  let body: {
    client_id?: string;
    product_type?: string;
    brand?: string;
    color?: string;
    size?: string;
    notes?: string;
    received_by_badge?: string;
    received_by_name?: string;
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const result = await addReadyMadeSample(
    {
      client_id: String(body.client_id ?? ""),
      product_type: body.product_type,
      brand: body.brand,
      color: body.color,
      size: body.size,
      notes: body.notes,
      received_by_badge: body.received_by_badge,
      received_by_name: body.received_by_name,
      added_by: "api",
    },
    "api"
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ sample: result.sample }, { status: 201 });
}
