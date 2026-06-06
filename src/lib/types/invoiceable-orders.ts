export type InvoiceableSalesOrder = {
  id: string;
  so_number: string;
  client_name: string;
  client_code: string;
  order_date: string;
  status: string;
  piece_count: number;
  fabric_line_count: number;
  estimated_cost_sar: number | null;
};
