import { NextResponse } from "next/server";
import { requireAuthenticated } from "@/lib/auth/session";
import { ensureErpBootstrap } from "@/lib/data/document-persistence";
import { readClients } from "@/lib/data/clients";
import { listFabricOrderDraftSummaries } from "@/lib/autosave/server-fabric-order-draft";
import { readSupplierContacts } from "@/lib/data/supplier-contacts";
import {
  getMissingRequiredFabricSuppliers,
  REQUIRED_FABRIC_SUPPLIER_IDS,
} from "@/lib/data/required-fabric-suppliers";

export async function GET() {
  try {
    const session = await requireAuthenticated();
    if (!session?.isAdmin) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    await ensureErpBootstrap();
    const contacts = await readSupplierContacts();
    const missing = getMissingRequiredFabricSuppliers(contacts);
    const fabricOrderDrafts = await listFabricOrderDraftSummaries(readClients().clients);

    return NextResponse.json({
      ok: missing.length === 0,
      required_fabric_suppliers: [...REQUIRED_FABRIC_SUPPLIER_IDS],
      present: contacts.suppliers.map((s) => s.id),
      missing,
      fabric_order_drafts: {
        count: fabricOrderDrafts.length,
        drafts: fabricOrderDrafts,
      },
    });
  } catch (error) {
    console.error("Health documents check failed:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to verify ERP documents" },
      { status: 500 }
    );
  }
}
