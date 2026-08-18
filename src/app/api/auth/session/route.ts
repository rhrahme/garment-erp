import { NextResponse } from "next/server";
import {
  canRevealFabricPrices,
  canViewFabricStock,
} from "@/lib/auth/fabric-price-access";
import { resolveFabricPriceAccess } from "@/lib/auth/fabric-price-access.server";
import {
  canAccessClientMedia,
  canHardDeleteClientMedia,
} from "@/lib/auth/permissions";
import { getSessionContext } from "@/lib/auth/session";
import { getAllowedSalesBrandIds } from "@/lib/sales/access";
import { canChangeGarmentType } from "@/lib/sales-orders/change-garment-type";

export async function GET() {
  try {
    const session = await getSessionContext();
    const canViewFabricPrices = await resolveFabricPriceAccess(session);
    return NextResponse.json({
      email: session.email,
      actor_label: session.actorLabel,
      role: session.role,
      is_super_admin: session.isSuperAdmin,
      is_admin: session.isAdmin,
      is_client_manager: session.isClientManager,
      is_task_operator: session.isTaskOperator,
      is_stitch_operator: session.isStitchOperator,
      is_production_operator: session.isProductionOperator,
      is_pattern_operator: session.isPatternOperator,
      is_sales_operator: session.isSalesOperator,
      is_accounting_operator: session.isAccountingOperator,
      can_view_client_contact: session.canViewClientContact,
      can_view_fabric_list_prices: session.canViewFabricListPrices,
      can_view_invoice_amounts: session.canViewInvoiceAmounts,
      can_toggle_invoice_amounts: session.canToggleInvoiceAmounts,
      can_reveal_invoice_amounts_without_password: session.canRevealInvoiceAmountsWithoutPassword,
      invoice_amounts_visible_by_default: session.invoiceAmountsVisibleByDefault,
      can_send_supplier_emails: session.canSendSupplierEmails,
      can_view_shipments: session.canViewShipments,
      can_manage_shipments: session.canManageShipments,
      can_access_client_media: canAccessClientMedia(session),
      can_hard_delete_client_media: canHardDeleteClientMedia(session),
      can_reveal_fabric_prices: canRevealFabricPrices(session),
      can_view_fabric_prices: canViewFabricPrices,
      can_view_fabric_stock: canViewFabricStock(session),
      can_access_pattern: session.canAccessPattern,
      can_change_garment_type: canChangeGarmentType(session),
      allowed_sales_brand_ids: getAllowedSalesBrandIds(session),
    });
  } catch (error) {
    console.error("Failed to read session:", error);
    return NextResponse.json({ error: "Failed to load session." }, { status: 500 });
  }
}
