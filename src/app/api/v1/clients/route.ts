import { NextResponse } from "next/server";
import { createAndPersistClient } from "@/lib/clients/create-client";
import { healClientDataForRead } from "@/lib/clients/heal-on-read";
import { migrateClientName } from "@/lib/clients/names";
import { getActiveClients, getClientById } from "@/lib/data/clients";
import { verifyApiKey } from "@/lib/integrations/api-auth";

export async function GET(request: Request) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  await healClientDataForRead("api");

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (id) {
    const client = getClientById(id);
    if (!client) return NextResponse.json({ error: "Client not found." }, { status: 404 });
    return NextResponse.json({ client: { ...client, ...migrateClientName(client) } });
  }

  return NextResponse.json({
    clients: getActiveClients().map((entry) => ({ ...entry, ...migrateClientName(entry) })),
  });
}

export async function POST(request: Request) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const result = await createAndPersistClient(body, {
      allowContactFields: true,
      source: "api",
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ client: result.client, updated_at: result.updated_at }, { status: 201 });
  } catch (error) {
    console.error("Create client failed:", error);
    return NextResponse.json({ error: "Failed to create client." }, { status: 500 });
  }
}
