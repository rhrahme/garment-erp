import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type {
  DashboardStats,
  Employee,
  InventoryItem,
  PurchaseOrder,
  QualityInspection,
  SalesOrder,
  Shipment,
  StyleCost,
  WashingBatch,
  WorkOrder,
} from "@/lib/types/database";
import type { Supplier, SupplierFabric } from "@/lib/types/fabric-sourcing";
import {
  getLocalDashboardStats,
  getLocalPurchaseOrders,
  getLocalSalesOrders,
  getLocalShipments,
  getLocalWorkOrders,
} from "@/lib/data/local-json-stores";
import {
  attachLiveSupplierContacts,
  getAllPriceListItems,
  getImportedPriceLists,
  getImportedSuppliers,
} from "@/lib/data/supplier-catalogs";
import { resolveFabricSupplierId } from "@/lib/fabric-sourcing/supplier-aliases";

const DEMO_MODE = !isSupabaseConfigured();

const demoStats: DashboardStats = {
  openSalesOrders: 0,
  activeWorkOrders: 0,
  lowStockItems: 0,
  inboundShipments: 0,
  pendingInspections: 0,
  totalEmployees: 0,
};

/** Physical warehouse stock only — empty until fabric is received from a supplier shipment. */
const demoInventory: InventoryItem[] = [];

const demoPurchaseOrders: PurchaseOrder[] = [
  { id: "1", po_number: "PO-2024-001", supplier_id: "caccioppoli", status: "confirmed", order_date: "2024-05-20", expected_date: "2024-06-10", total_amount: 1056, client_reference: "CLIENT-REF-2026-001", emailed_at: "2024-05-20T09:30:00Z", email_to: "orders@caccioppoli.it", expected_carrier: "DHL", supplier: { id: "caccioppoli", code: "CACCIOPPOLI", name: "Caccioppoli", contact_person: null, email: "orders@caccioppoli.it", country: "Italy", is_fabric_supplier: true, lead_time_days: 14 } },
  { id: "2", po_number: "PO-2024-002", supplier_id: "s2", status: "sent", order_date: "2024-05-22", expected_date: "2024-06-05", total_amount: 3200, client_reference: "URBAN-SS24-TEE", emailed_at: "2024-05-22T11:00:00Z", email_to: "sales@guangzhoutrims.com", expected_carrier: "DHL", supplier: { id: "s2", code: "FAB-002", name: "Fabric Supplier 2", contact_person: "Chen Ming", email: "sales@guangzhoutrims.com", country: "China", is_fabric_supplier: true, lead_time_days: 14 } },
  { id: "3", po_number: "PO-2024-003", supplier_id: "s3", status: "draft", order_date: "2024-05-25", expected_date: "2024-06-04", total_amount: 8900, client_reference: "MAISON-SS24-CHN", emailed_at: null, email_to: null, expected_carrier: null, supplier: { id: "s3", code: "FAB-003", name: "Fabric Supplier 3", contact_person: "Mehmet Yilmaz", email: "fabrics@istanbul.com", country: "Turkey", is_fabric_supplier: true, lead_time_days: 10 } },
];

const demoSalesOrders: SalesOrder[] = [
  { id: "1", so_number: "SO-2024-042", customer_id: "c1", status: "in_production", order_date: "2024-05-15", delivery_date: "2024-06-15", total_amount: 32500, customer: { id: "c1", code: "CUS-001", name: "Nordic Fashion AB", country: "Sweden" } },
  { id: "2", so_number: "SO-2024-043", customer_id: "c2", status: "confirmed", order_date: "2024-05-18", delivery_date: "2024-06-20", total_amount: 18750, customer: { id: "c2", code: "CUS-002", name: "Urban Threads Inc.", country: "USA" } },
  { id: "3", so_number: "SO-2024-044", customer_id: "c3", status: "draft", order_date: "2024-05-24", delivery_date: "2024-07-01", total_amount: 42000, customer: { id: "c3", code: "CUS-003", name: "Maison Parisienne", country: "France" } },
];

const demoWorkOrders: WorkOrder[] = [
  { id: "1", wo_number: "WO-2024-018", style_id: "st1", status: "sewing", quantity_planned: 2500, quantity_completed: 1200, start_date: "2024-05-18", due_date: "2024-06-01", style: { id: "st1", style_code: "STY-2401", name: "Classic Denim Jacket", season: "FW24", category: "Outerwear", target_cost: 28.5, selling_price: 65, is_active: true } },
  { id: "2", wo_number: "WO-2024-019", style_id: "st2", status: "cutting", quantity_planned: 5000, quantity_completed: 0, start_date: "2024-05-22", due_date: "2024-06-10", style: { id: "st2", style_code: "STY-2402", name: "Organic Cotton Tee", season: "SS24", category: "Tops", target_cost: 8.2, selling_price: 22, is_active: true } },
  { id: "3", wo_number: "WO-2024-020", style_id: "st3", status: "washing", quantity_planned: 1800, quantity_completed: 900, start_date: "2024-05-20", due_date: "2024-06-08", style: { id: "st3", style_code: "STY-2403", name: "Slim Chino Pants", season: "SS24", category: "Bottoms", target_cost: 15, selling_price: 38, is_active: true } },
];

const demoShipments: Shipment[] = [
  { id: "1", awb_number: "176-12345678", carrier: "DHL Express", direction: "inbound", status: "in_transit", origin: "Shanghai, CN", destination: "Factory", estimated_arrival: "2024-06-07T00:00:00Z", delivered_at: null },
  { id: "2", awb_number: "999-87654321", carrier: "FedEx", direction: "outbound", status: "in_transit", origin: "Factory", destination: "Stockholm, SE", estimated_arrival: "2024-06-12T00:00:00Z", delivered_at: null },
  { id: "3", awb_number: "020-11223344", carrier: "Lufthansa Cargo", direction: "inbound", status: "customs", origin: "Istanbul, TR", destination: "Factory", estimated_arrival: "2024-05-28T00:00:00Z", delivered_at: null },
];

const demoWashing: WashingBatch[] = [
  { id: "1", batch_number: "WASH-001", washing_type: "stone_wash", status: "completed", quantity: 500, machine_id: "WM-03", recipe: "Stone wash 60min @ 40°C", started_at: "2024-05-20T08:00:00Z", completed_at: "2024-05-20T14:30:00Z" },
  { id: "2", batch_number: "WASH-002", washing_type: "enzyme", status: "in_progress", quantity: 400, machine_id: "WM-01", recipe: "Enzyme wash 45min @ 35°C", started_at: "2024-05-25T09:00:00Z", completed_at: null },
  { id: "3", batch_number: "WASH-003", washing_type: "softener", status: "scheduled", quantity: 600, machine_id: "WM-02", recipe: "Softener finish 30min", started_at: null, completed_at: null },
];

const demoInspections: QualityInspection[] = [
  { id: "1", inspection_date: "2024-05-24T10:00:00Z", sample_size: 125, result: "pass", notes: "Within AQL 2.5", work_order_id: "1" },
  { id: "2", inspection_date: "2024-05-23T14:00:00Z", sample_size: 80, result: "rework", notes: "Stitching defects on 3 units", work_order_id: "3" },
];

const demoEmployees: Employee[] = [
  { id: "1", employee_code: "EMP-001", full_name: "Maria Santos", department: "Sewing", job_title: "Line Supervisor", hourly_rate: 12.5, is_active: true },
  { id: "2", employee_code: "EMP-002", full_name: "Ahmed Hassan", department: "Cutting", job_title: "Cutter", hourly_rate: 11, is_active: true },
  { id: "3", employee_code: "EMP-003", full_name: "Priya Sharma", department: "QC", job_title: "Inspector", hourly_rate: 10.5, is_active: true },
  { id: "4", employee_code: "EMP-004", full_name: "John Okafor", department: "Washing", job_title: "Machine Operator", hourly_rate: 11.5, is_active: true },
];

const demoCosts: StyleCost[] = [
  { id: "1", style_id: "st1", material_cost: 14.2, labor_cost: 8.5, washing_cost: 2.8, overhead_cost: 3.0, total_cost: 28.5, margin_pct: 56.2, style: { id: "st1", style_code: "STY-2401", name: "Classic Denim Jacket", season: "FW24", category: "Outerwear", target_cost: 28.5, selling_price: 65, is_active: true } },
  { id: "2", style_id: "st2", material_cost: 3.1, labor_cost: 3.2, washing_cost: 0.5, overhead_cost: 1.4, total_cost: 8.2, margin_pct: 62.7, style: { id: "st2", style_code: "STY-2402", name: "Organic Cotton Tee", season: "SS24", category: "Tops", target_cost: 8.2, selling_price: 22, is_active: true } },
  { id: "3", style_id: "st3", material_cost: 7.5, labor_cost: 4.8, washing_cost: 1.2, overhead_cost: 1.5, total_cost: 15, margin_pct: 60.5, style: { id: "st3", style_code: "STY-2403", name: "Slim Chino Pants", season: "SS24", category: "Bottoms", target_cost: 15, selling_price: 38, is_active: true } },
];


async function withLocalFallback<T>(fetchFromSupabase: () => Promise<T[]>, getLocal: () => T[]): Promise<T[]> {
  if (DEMO_MODE) {
    const local = getLocal();
    return local.length > 0 ? local : [];
  }
  const fromDb = await fetchFromSupabase();
  return fromDb.length > 0 ? fromDb : getLocal();
}

export async function getDashboardStats(): Promise<DashboardStats> {
  if (DEMO_MODE) {
    const local = getLocalDashboardStats();
    if (local.openSalesOrders > 0 || local.activeWorkOrders > 0 || local.inboundShipments > 0) {
      return local;
    }
    const inventory = demoInventory;
    const lowStock = inventory.filter(
      (i) => i.material && i.quantity_on_hand <= i.material.reorder_level
    ).length;
    return { ...demoStats, lowStockItems: lowStock };
  }
  const supabase = await createClient();
  const [so, wo, inv, ship, emp] = await Promise.all([
    supabase.from("sales_orders").select("id", { count: "exact" }).not("status", "in", '("delivered","cancelled")'),
    supabase.from("work_orders").select("id", { count: "exact" }).not("status", "in", '("completed","on_hold")'),
    supabase.from("inventory").select("*, material:materials(reorder_level, quantity_on_hand)"),
    supabase.from("shipments").select("id", { count: "exact" }).eq("direction", "inbound").eq("status", "in_transit"),
    supabase.from("employees").select("id", { count: "exact" }).eq("is_active", true),
  ]);
  const hasDbData =
    (so.count ?? 0) > 0 ||
    (wo.count ?? 0) > 0 ||
    (inv.data?.length ?? 0) > 0 ||
    (ship.count ?? 0) > 0 ||
    (emp.count ?? 0) > 0;
  if (!hasDbData) return getLocalDashboardStats();
  const lowStock = (inv.data ?? []).filter(
    (i: { quantity_on_hand: number; material: { reorder_level: number } }) =>
      i.quantity_on_hand <= (i.material?.reorder_level ?? 0)
  ).length;
  return {
    openSalesOrders: so.count ?? 0,
    activeWorkOrders: wo.count ?? 0,
    lowStockItems: lowStock,
    inboundShipments: ship.count ?? 0,
    pendingInspections: 0,
    totalEmployees: emp.count ?? 0,
  };
}

export async function getInventory() {
  if (DEMO_MODE) return demoInventory;
  const supabase = await createClient();
  const { data } = await supabase.from("inventory").select("*, material:materials(*)").order("updated_at", { ascending: false });
  return (data ?? []) as InventoryItem[];
}

export async function getPurchaseOrders() {
  return withLocalFallback(async () => {
    const supabase = await createClient();
    const { data } = await supabase.from("purchase_orders").select("*, supplier:suppliers(*)").order("order_date", { ascending: false });
    return (data ?? []) as PurchaseOrder[];
  }, getLocalPurchaseOrders);
}

export async function getSalesOrders() {
  return withLocalFallback(async () => {
    const supabase = await createClient();
    const { data } = await supabase.from("sales_orders").select("*, customer:customers(*)").order("order_date", { ascending: false });
    return (data ?? []) as SalesOrder[];
  }, getLocalSalesOrders);
}

export async function getWorkOrders() {
  return withLocalFallback(async () => {
    const supabase = await createClient();
    const { data } = await supabase.from("work_orders").select("*, style:styles(*)").order("created_at", { ascending: false });
    return (data ?? []) as WorkOrder[];
  }, getLocalWorkOrders);
}

export async function getShipments() {
  return withLocalFallback(async () => {
    const supabase = await createClient();
    const { data } = await supabase.from("shipments").select("*").order("created_at", { ascending: false });
    return (data ?? []) as Shipment[];
  }, getLocalShipments);
}

export async function getWashingBatches() {
  if (DEMO_MODE) return demoWashing;
  const supabase = await createClient();
  const { data } = await supabase.from("washing_batches").select("*").order("created_at", { ascending: false });
  return (data ?? []) as WashingBatch[];
}

export async function getQualityInspections() {
  if (DEMO_MODE) return demoInspections;
  const supabase = await createClient();
  const { data } = await supabase.from("quality_inspections").select("*").order("inspection_date", { ascending: false });
  return (data ?? []) as QualityInspection[];
}

export async function getEmployees() {
  if (DEMO_MODE) return demoEmployees;
  const supabase = await createClient();
  const { data } = await supabase.from("employees").select("*").eq("is_active", true).order("full_name");
  return (data ?? []) as Employee[];
}

export async function getStyleCosts() {
  if (DEMO_MODE) return demoCosts;
  const supabase = await createClient();
  const { data } = await supabase.from("style_costs").select("*, style:styles(*)").order("calculated_at", { ascending: false });
  if ((data ?? []).length > 0) return data as StyleCost[];
  return demoCosts;
}

function catalogItemKey(item: Pick<SupplierFabric, "supplier_id" | "fabric_number">): string {
  return `${resolveFabricSupplierId(item.supplier_id)}:${item.fabric_number.toLowerCase()}`;
}

async function mergeCatalogPriceListItems(dbItems: SupplierFabric[]): Promise<SupplierFabric[]> {
  const catalog = await attachLiveSupplierContacts(getAllPriceListItems());
  if (dbItems.length === 0) return catalog;
  const keys = new Set(dbItems.map(catalogItemKey));
  const extras = catalog.filter((item) => !keys.has(catalogItemKey(item)));
  return [...dbItems, ...extras];
}

export async function getFabricSuppliers() {
  if (DEMO_MODE) return await getImportedSuppliers();
  // Fabric search/spec UIs read JSON catalogs keyed by contact ids (canclini, zegna, …).
  // Supabase warehouse `suppliers` rows may use UUIDs that never match catalog items.
  return await getImportedSuppliers();
}

export async function getPriceListItems(supplierId?: string) {
  if (DEMO_MODE) {
    const items = await attachLiveSupplierContacts(getAllPriceListItems());
    return supplierId
      ? items.filter((f) => resolveFabricSupplierId(f.supplier_id) === resolveFabricSupplierId(supplierId))
      : items;
  }
  const supabase = await createClient();
  const canonicalId = supplierId ? resolveFabricSupplierId(supplierId) : undefined;
  let query = supabase.from("supplier_fabrics").select("*, supplier:suppliers(*)").eq("is_active", true).order("fabric_number");
  if (canonicalId) query = query.eq("supplier_id", canonicalId);
  const { data, error } = await query;
  const dbItems = error ? [] : ((data ?? []) as SupplierFabric[]);
  const merged = await mergeCatalogPriceListItems(dbItems);
  return canonicalId
    ? merged.filter((f) => resolveFabricSupplierId(f.supplier_id) === canonicalId)
    : merged;
}

/** @deprecated use getPriceListItems */
export const getSupplierFabrics = getPriceListItems;

export async function getSupplierPriceLists() {
  if (DEMO_MODE) return getImportedPriceLists();
  const supabase = await createClient();
  const { data } = await supabase.from("supplier_price_lists").select("*, supplier:suppliers(*)").order("uploaded_at", { ascending: false });
  return data?.length ? data : getImportedPriceLists();
}

export { DEMO_MODE, getImportedSuppliers };
