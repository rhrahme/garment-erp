export type IntegrationEventType =
  | "fabric_order.created"
  | "fabric_order.sent"
  | "fabric_order.email_failed"
  | "supplier.contacts_updated"
  | "supplier.reply_logged"
  | "supplier.availability_detected"
  | "follow_up.due"
  | "awb.received"
  | "email.test_sent"
  | "price_list.imported"
  | "client.created"
  | "client.updated"
  | "client.deleted"
  | "sales_order.created";

export interface IntegrationEvent<T = Record<string, unknown>> {
  event: IntegrationEventType;
  timestamp: string;
  source: "erp" | "zapier" | "api";
  data: T;
}
