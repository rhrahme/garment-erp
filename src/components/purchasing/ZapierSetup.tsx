"use client";

import { useEffect, useState } from "react";
import { Zap } from "lucide-react";

const OUTBOUND_EVENTS = [
  "fabric_order.created",
  "fabric_order.sent",
  "fabric_order.cancelled",
  "fabric_order.email_failed",
  "supplier.contacts_updated",
  "supplier.reply_logged",
  "follow_up.due",
  "awb.received",
  "email.test_sent",
  "price_list.imported",
  "client.created",
  "client.updated",
  "sales_order.created",
  "sales_order.deleted",
  "sales_order.fabric_lines_added",
  "sales_order.fabric_lines_updated",
  "sales_order.fabric_lines_removed",
  "sales_order.fabric_lines_printed",
  "sales_order.fabric_lines_print_cleared",
  "sales_order.fabric_order_requested",
  "sales_order.client_fields_healed",
  "fabric_receiving.testing_reset",
  "fabric_receiving.settled",
  "fabric_receiving.defect_reported",
  "fabric_receiving.defect_acknowledged",
  "fabric_receiving.defect_resolved",
  "pattern_job.created",
  "pattern_job.updated",
  "pattern_fitting.completed",
  "pattern_revision.created",
  "pattern_job.ready_for_cutting",
  "production.scan",
  "invoice.sent",
  "custom_fabric.created",
];

export function ZapierSetup() {
  const [status, setStatus] = useState<{
    api_key: boolean;
    zapier_webhook: boolean;
  } | null>(null);

  useEffect(() => {
    fetch("/api/v1/health")
      .then((res) => res.json())
      .then((data) =>
        setStatus({
          api_key: Boolean(data.integrations?.api_key),
          zapier_webhook: Boolean(data.integrations?.zapier_webhook),
        })
      )
      .catch(() => setStatus({ api_key: false, zapier_webhook: false }));
  }, []);

  const baseUrl =
    typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";

  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50 p-6">
      <div className="flex items-center gap-2">
        <Zap className="h-5 w-5 text-violet-600" />
        <h2 className="text-lg font-semibold text-slate-900">Zapier integration</h2>
      </div>
      <p className="mt-2 text-sm text-slate-600">
        Every save, email, supplier reply, and AWB in the ERP can trigger or receive Zapier automations.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-white bg-white/80 p-3 text-sm">
          <p className="font-medium text-slate-900">API key</p>
          <p className={status?.api_key ? "text-emerald-700" : "text-amber-700"}>
            {status?.api_key ? "Ready" : "Add ERP_API_KEY to .env.local"}
          </p>
        </div>
        <div className="rounded-lg border border-white bg-white/80 p-3 text-sm">
          <p className="font-medium text-slate-900">Outbound webhook</p>
          <p className={status?.zapier_webhook ? "text-emerald-700" : "text-amber-700"}>
            {status?.zapier_webhook ? "Ready" : "Add ZAPIER_WEBHOOK_URL to .env.local"}
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div className="text-sm text-slate-700">
          <p className="font-medium text-slate-900">Zapier → ERP (use Webhooks by Zapier)</p>
          <p className="mt-1 text-xs text-slate-500">Header: Authorization: Bearer YOUR_ERP_API_KEY</p>
          <ul className="mt-2 space-y-1 font-mono text-xs">
            <li>GET/POST {baseUrl}/api/v1/clients</li>
            <li>GET {baseUrl}/api/v1/brands</li>
            <li>GET {baseUrl}/api/v1/suppliers</li>
            <li>GET {baseUrl}/api/v1/price-list-items</li>
            <li>GET/POST {baseUrl}/api/v1/custom-fabrics</li>
            <li>GET/POST {baseUrl}/api/v1/fabric-orders</li>
            <li>POST {baseUrl}/api/v1/fabric-orders/cancel</li>
            <li>POST {baseUrl}/api/v1/fabric-orders/[id]/send</li>
            <li>POST {baseUrl}/api/v1/supplier-replies</li>
            <li>POST {baseUrl}/api/v1/shipments</li>
            <li>GET/POST {baseUrl}/api/v1/follow-ups</li>
            <li>POST/PATCH/DELETE {baseUrl}/api/v1/sales-orders/[id]/fabric-lines</li>
            <li>GET/PATCH {baseUrl}/api/v1/pattern/jobs/[id]</li>
            <li>POST {baseUrl}/api/v1/pattern/jobs/[id]/fittings</li>
            <li>POST {baseUrl}/api/v1/pattern/jobs/[id]/revisions</li>
            <li>POST {baseUrl}/api/v1/sales-orders/[id]/fabric-lines/print</li>
            <li>POST {baseUrl}/api/v1/fabric-receiving/reset-testing</li>
            <li>POST {baseUrl}/api/v1/fabric-receiving/defects</li>
            <li>POST {baseUrl}/api/v1/customer-invoices/[id]/mark-sent</li>
            <li>GET {baseUrl}/api/v1/events</li>
          </ul>
        </div>
        <div className="text-sm text-slate-700">
          <p className="font-medium text-slate-900">ERP → Zapier (Catch Hook)</p>
          <ul className="mt-2 space-y-1">
            {OUTBOUND_EVENTS.map((event) => (
              <li key={event}>
                <code className="rounded bg-white/80 px-1">{event}</code>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
