import { NextResponse } from "next/server";
import {
  createCustomFabric,
  customFabricCreatedEventData,
  ensureCustomFabricsLoaded,
  listCustomFabricsAsSupplierFabrics,
  peekNextCustomFabricNumber,
  readCustomFabrics,
  validateCreateCustomFabricInput,
} from "@/lib/data/custom-fabrics";
import { parseCreateCustomFabricRequest } from "@/lib/fabric-sourcing/parse-custom-fabric-request";
import { notifyIntegration } from "@/lib/integrations";
import { verifyApiKey } from "@/lib/integrations/api-auth";

export const maxDuration = 60;

export async function GET(request: Request) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  try {
    await ensureCustomFabricsLoaded();
    const store = readCustomFabrics();
    return NextResponse.json({
      fabrics: listCustomFabricsAsSupplierFabrics(store),
      next_fabric_number: peekNextCustomFabricNumber(store.fabrics),
      updated_at: store.updated_at,
    });
  } catch (error) {
    console.error("List custom fabrics (API) failed:", error);
    return NextResponse.json({ error: "Failed to load custom fabrics." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  try {
    const parsed = await parseCreateCustomFabricRequest(request, {
      uploadedBy: "api",
    });
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: parsed.status });
    }

    const validated = validateCreateCustomFabricInput(parsed.data);
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }

    await ensureCustomFabricsLoaded();
    const { fabric, supplierFabric } = await createCustomFabric(validated.data);

    await notifyIntegration("custom_fabric.created", customFabricCreatedEventData(fabric), "api");

    return NextResponse.json(
      {
        fabric,
        supplier_fabric: supplierFabric,
        next_fabric_number: peekNextCustomFabricNumber(),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Create custom fabric (API) failed:", error);
    const message = error instanceof Error ? error.message : "Failed to create custom fabric.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
