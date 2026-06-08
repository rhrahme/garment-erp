import { NextResponse } from "next/server";
import { redactSalesOrderFabricPrices } from "@/lib/auth/fabric-price-access";
import { requireAuthenticated } from "@/lib/auth/session";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { getClientById } from "@/lib/data/clients";
import { formatClientDisplayName } from "@/lib/clients/names";
import { generateSoNumber, readSalesOrders, writeSalesOrders, buildClientReference } from "@/lib/data/sales-orders";
import { findOpenOrderWithSameArticles } from "@/lib/sales-orders/duplicate-order";
import { getSupplierByIdFromContacts } from "@/lib/data/supplier-contacts";
import { normalizeFabricSupplierFields, fabricPoSupplierId } from "@/lib/fabric-sourcing/supplier-display";
import { isGarmentStitchType } from "@/lib/sales-orders/garment-types";
import { generateFabricLabelStickers } from "@/lib/sales-orders/label-codes";
import { notifyIntegration } from "@/lib/integrations";
import { isDeliveryDestination } from "@/lib/shipping/delivery-destinations";
import type { SalesOrder, SalesOrderFabricLine } from "@/lib/types/sales-orders";

function normalizeText(value: unknown): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function GET() {
  try {
    const session = await requireAuthenticated();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    await ensureDocumentsLoaded(["sales_orders"]);
    const store = readSalesOrders();
    if (!session.canViewFabricListPrices) {
      return NextResponse.json({
        ...store,
        orders: store.orders.map(redactSalesOrderFabricPrices),
      });
    }
    return NextResponse.json(store);
  } catch (error) {
    console.error("Failed to read sales orders:", error);
    return NextResponse.json({ error: "Failed to load sales orders." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireAuthenticated();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    await ensureDocumentsLoaded(["sales_orders", "clients"]);

    const body = (await request.json()) as {
      client_id?: string;
      delivery_destination?: string;
      delivery_date?: string | null;
      notes?: string | null;
      fabric_lines?: Array<{
        garment_type: string;
        label_count?: number;
        supplier_id: string;
        supplier_name?: string;
        fabric_number: string;
        quantity: number;
        unit?: string;
        unit_price?: number;
        composition?: string | null;
        weight_gsm?: number | null;
        width_cm?: number | null;
        width_inches?: number | null;
        color?: string | null;
        stock_status?: "in_stock" | "temp_unavailable" | "permanently_unavailable" | null;
        restock_date?: string | null;
        needs_replacement?: boolean;
        replacement_fabric_number?: string | null;
      }>;
    };

    const client_id = String(body.client_id ?? "").trim();
    const client = getClientById(client_id);
    if (!client) {
      return NextResponse.json({ error: "Client not found." }, { status: 400 });
    }

    const rawLines = body.fabric_lines ?? [];
    if (rawLines.length === 0) {
      return NextResponse.json({ error: "Add at least one fabric line." }, { status: 400 });
    }

    const delivery_destination = String(body.delivery_destination ?? "").trim();
    if (!isDeliveryDestination(delivery_destination)) {
      return NextResponse.json({ error: "Select a fabric delivery destination (Riyadh or Dubai)." }, { status: 400 });
    }

    const store = readSalesOrders();
    const so_number = generateSoNumber(store.orders);
    const client_reference = buildClientReference(client.code, so_number);

    const fabric_lines: SalesOrderFabricLine[] = [];
    for (const [index, line] of rawLines.entries()) {
      const supplier_id = String(line.supplier_id ?? "").trim();
      const fabric_number = String(line.fabric_number ?? "").trim();
      const quantity = Number(line.quantity);

      if (!supplier_id || !fabric_number || !Number.isFinite(quantity) || quantity <= 0) {
        return NextResponse.json({ error: "Each fabric line needs supplier, fabric number, and quantity." }, { status: 400 });
      }

      const poSupplierId = fabricPoSupplierId(supplier_id, fabric_number);
      const supplier = getSupplierByIdFromContacts(poSupplierId) ?? getSupplierByIdFromContacts(supplier_id);
      if (!supplier) {
        return NextResponse.json({ error: `Unknown supplier: ${supplier_id}` }, { status: 400 });
      }

      const garment_type = String(line.garment_type ?? "").trim();
      if (!garment_type) {
        return NextResponse.json({ error: "Each fabric line needs a garment type." }, { status: 400 });
      }
      if (!isGarmentStitchType(garment_type)) {
        return NextResponse.json({ error: `Invalid garment type: ${garment_type}` }, { status: 400 });
      }

      const label_stickers = generateFabricLabelStickers(client_reference, index + 1, garment_type);
      const label_count = label_stickers.length;

      const supplierFields = normalizeFabricSupplierFields(
        supplier_id,
        line.supplier_name ?? supplier.name,
        fabric_number
      );

      fabric_lines.push({
        id: `line-${Date.now()}-${index}`,
        garment_type,
        label_count,
        label_stickers,
        supplier_id: supplierFields.supplier_id,
        supplier_name: supplierFields.supplier_name,
        fabric_number,
        quantity,
        unit: line.unit?.trim() || "meters",
        unit_price: Number(line.unit_price) || 0,
        composition: line.composition ?? null,
        weight_gsm: line.weight_gsm ?? null,
        width_cm: line.width_cm ?? null,
        width_inches: line.width_inches ?? null,
        color: line.color ?? null,
        stock_status: line.stock_status ?? null,
        restock_date: line.restock_date ?? null,
        needs_replacement: Boolean(line.needs_replacement),
        replacement_fabric_number: line.replacement_fabric_number ?? null,
        added_at: new Date().toISOString(),
        added_by: session.email,
        a4_printed_at: null,
        prep_stickers_printed_at: null,
        prod_stickers_printed_at: null,
      });
    }

    const duplicateOrder = findOpenOrderWithSameArticles(store.orders, client_id, fabric_lines);
    if (duplicateOrder) {
      return NextResponse.json(
        {
          error: `${formatClientDisplayName(client)} already has open order ${duplicateOrder.so_number} with the same fabrics — open that order instead of creating a duplicate.`,
          existing_order_id: duplicateOrder.id,
          existing_so_number: duplicateOrder.so_number,
        },
        { status: 409 }
      );
    }

    const order: SalesOrder = {
      id: `so-${Date.now()}`,
      so_number,
      client_id: client.id,
      client_code: client.code,
      client_name: formatClientDisplayName(client),
      client_reference,
      order_date: new Date().toISOString().slice(0, 10),
      delivery_date: normalizeText(body.delivery_date),
      delivery_destination,
      status: "open",
      notes: normalizeText(body.notes),
      fabric_lines,
      fabric_po_ids: [],
    };

    store.orders.unshift(order);
    const saved = await writeSalesOrders(store);

    await notifyIntegration("sales_order.created", {
      id: order.id,
      so_number: order.so_number,
      client_id: order.client_id,
      client_code: order.client_code,
      line_count: order.fabric_lines.length,
    });

    const safeOrder = session.canViewFabricListPrices ? order : redactSalesOrderFabricPrices(order);

    return NextResponse.json({ order: safeOrder, updated_at: saved.updated_at }, { status: 201 });
  } catch (error) {
    console.error("Failed to create sales order:", error);
    return NextResponse.json({ error: "Failed to create sales order." }, { status: 500 });
  }
}
