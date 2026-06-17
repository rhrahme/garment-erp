export type UserRole =
  | "super_admin"
  | "admin"
  | "client_manager"
  | "production_manager"
  | "pattern_maker"
  | "inventory_clerk"
  | "purchasing"
  | "qc_inspector"
  | "hr_manager"
  | "viewer";

export interface Profile {
  id: string;
  full_name: string;
  role: UserRole;
  department: string | null;
  phone: string | null;
  is_active: boolean;
}

export interface Supplier {
  id: string;
  code: string;
  name: string;
  contact_person: string | null;
  email: string | null;
  country: string | null;
  is_fabric_supplier: boolean;
  lead_time_days: number | null;
}

export interface Customer {
  id: string;
  code: string;
  name: string;
  country: string | null;
}

export interface Style {
  id: string;
  style_code: string;
  name: string;
  season: string | null;
  category: string | null;
  target_cost: number | null;
  selling_price: number | null;
  is_active: boolean;
}

export interface Material {
  id: string;
  code: string;
  name: string;
  material_type: string;
  unit: string;
  color: string | null;
  unit_cost: number;
  reorder_level: number;
}

export interface InventoryItem {
  id: string;
  material_id: string;
  quantity_on_hand: number;
  quantity_reserved: number;
  location: string | null;
  material?: Material;
}

export interface PurchaseOrder {
  id: string;
  po_number: string;
  supplier_id: string;
  status: string;
  order_date: string;
  expected_date: string | null;
  total_amount: number;
  client_reference: string | null;
  emailed_at: string | null;
  email_to: string | null;
  expected_carrier: string | null;
  supplier?: Supplier;
}

export interface SalesOrder {
  id: string;
  so_number: string;
  customer_id: string;
  status: string;
  order_date: string;
  delivery_date: string | null;
  total_amount: number;
  customer?: Customer;
}

export interface WorkOrder {
  id: string;
  wo_number: string;
  style_id: string;
  status: string;
  quantity_planned: number;
  quantity_completed: number;
  start_date: string | null;
  due_date: string | null;
  style?: Style;
}

export interface Shipment {
  id: string;
  awb_number: string;
  carrier: string | null;
  direction: string;
  status: string;
  origin: string | null;
  destination: string | null;
  estimated_arrival: string | null;
  delivered_at: string | null;
}

export interface WashingBatch {
  id: string;
  batch_number: string;
  washing_type: string;
  status: string;
  quantity: number;
  machine_id: string | null;
  recipe: string | null;
  started_at: string | null;
  completed_at: string | null;
}

export interface QualityInspection {
  id: string;
  inspection_date: string;
  sample_size: number;
  result: string;
  notes: string | null;
  work_order_id: string | null;
}

export interface Employee {
  id: string;
  employee_code: string;
  full_name: string;
  department: string;
  job_title: string | null;
  hourly_rate: number | null;
  is_active: boolean;
}

export interface StyleCost {
  id: string;
  style_id: string;
  material_cost: number;
  labor_cost: number;
  washing_cost: number;
  overhead_cost: number;
  total_cost: number;
  margin_pct: number | null;
  style?: Style;
}

export interface DashboardStats {
  openSalesOrders: number;
  activeWorkOrders: number;
  lowStockItems: number;
  inboundShipments: number;
  pendingInspections: number;
  totalEmployees: number;
}
