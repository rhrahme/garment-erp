import { NextResponse } from "next/server";
import { canCreateCustomFabric } from "@/lib/auth/custom-fabric-access";
import {
  canViewPrices,
  redactPriceFields,
  redactSupplierFabricPrice,
  redactSupplierFabricPrices,
} from "@/lib/auth/fabric-price-access";
import { requireAuthenticated } from "@/lib/auth/session";
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
import type { CustomFabric } from "@/lib/types/custom-fabrics";

export const maxDuration = 60;

function redactCustomFabric(fabric: CustomFabric): CustomFabric {
  return redactPriceFields(fabric);
}

export async function GET() {
  try {
    const session = await requireAuthenticated();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    await ensureCustomFabricsLoaded();
    const store = readCustomFabrics();
    const fabrics = listCustomFabricsAsSupplierFabrics(store);
    return NextResponse.json({
      fabrics: canViewPrices(session) ? fabrics : redactSupplierFabricPrices(fabrics),
      next_fabric_number: peekNextCustomFabricNumber(store.fabrics),
      can_create: canCreateCustomFabric(session),
      updated_at: store.updated_at,
    });
  } catch (error) {
    console.error("Failed to list custom fabrics:", error);
    return NextResponse.json({ error: "Failed to load custom fabrics." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireAuthenticated();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    if (!canCreateCustomFabric(session)) {
      return NextResponse.json(
        { error: "Sales operators cannot create custom fabrics." },
        { status: 403 }
      );
    }

    const canSetPrice = canViewPrices(session);
    const parsed = await parseCreateCustomFabricRequest(request, {
      uploadedBy: session.email ?? session.userId,
      stripPrice: !canSetPrice,
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

    await notifyIntegration("custom_fabric.created", customFabricCreatedEventData(fabric));

    return NextResponse.json(
      {
        fabric: canSetPrice ? fabric : redactCustomFabric(fabric),
        supplier_fabric: canSetPrice ? supplierFabric : redactSupplierFabricPrice(supplierFabric),
        next_fabric_number: peekNextCustomFabricNumber(),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Create custom fabric failed:", error);
    const message = error instanceof Error ? error.message : "Failed to create custom fabric.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
