import { NextResponse } from "next/server";
import {
  canViewPrices,
  redactPriceFields,
  redactSupplierFabricPrice,
  redactSupplierFabricPrices,
} from "@/lib/auth/fabric-price-access";
import { requireAuthenticated } from "@/lib/auth/session";
import {
  createCustomFabric,
  ensureCustomFabricsLoaded,
  listCustomFabricsAsSupplierFabrics,
  peekNextCustomFabricNumber,
  readCustomFabrics,
  validateCreateCustomFabricInput,
} from "@/lib/data/custom-fabrics";
import { notifyIntegration } from "@/lib/integrations";
import type { CreateCustomFabricInput, CustomFabric } from "@/lib/types/custom-fabrics";

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

    const body = (await request.json()) as CreateCustomFabricInput;
    const canSetPrice = canViewPrices(session);
    const validated = validateCreateCustomFabricInput({
      ...body,
      // Non-admins cannot set list price via the session UI/API.
      ...(canSetPrice ? {} : { unit_price: null, currency: null }),
      created_by: body.created_by ?? session.email ?? session.userId,
    });
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }

    await ensureCustomFabricsLoaded();
    const { fabric, supplierFabric } = await createCustomFabric(validated.data);

    await notifyIntegration("custom_fabric.created", {
      id: fabric.id,
      fabric_number: fabric.fabric_number,
      description: fabric.description,
      color: fabric.color,
      composition: fabric.composition,
      weight_gsm: fabric.weight_gsm,
      width_cm: fabric.width_cm,
      unit_price: fabric.unit_price,
      currency: fabric.currency,
      source_note: fabric.source_note,
      supplier_name: fabric.supplier_name,
      client_id: fabric.client_id,
      client_name: fabric.client_name,
      sales_order_id: fabric.sales_order_id,
      one_off: true,
      kind: "custom",
      created_at: fabric.created_at,
      created_by: fabric.created_by,
    });

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
