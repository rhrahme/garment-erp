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
  "sales_order.fabric_line_delete_requested",
  "sales_order.fabric_line_delete_approved",
  "sales_order.fabric_line_delete_rejected",
  "sales_order.garment_type_changed",
  "sales_order.garment_type_change_acknowledged",
  "sales_order.fabric_changed",
  "sales_order.fabric_change_acknowledged",
  "sales_order.fabric_order_requested",
  "sales_order.client_fields_healed",
  "fabric_receiving.testing_reset",
  "fabric_receiving.settled",
  "fabric_receiving.defect_reported",
  "fabric_receiving.defect_acknowledged",
  "fabric_receiving.defect_resolved",
  "thread_button.match_updated",
  "thread_button.photo_uploaded",
  "thread_button.photo_deleted",
  "thread_button.photo_acknowledged",
  "fabric.transferred",
  "pattern_job.created",
  "pattern_job.updated",
  "pattern_fitting.completed",
  "pattern_revision.created",
  "pattern_job.ready_for_cutting",
  "pattern.auto_consolidated",
  "pattern.scan",
  "base_pattern.created",
  "base_pattern.updated",
  "base_pattern.client_column_saved",
  "base_pattern.client_column_removed",
  "client_pattern.created",
  "client_pattern.updated",
  "client_pattern.trial_added",
  "client_pattern.finalized",
  "client_pattern.fabric_lines_assigned",
  "client_pattern.fabric_lines_unassigned",
  "client_pattern.measurements_copied",
  "pattern_library.file_uploaded",
  "production.scan",
  "production.sewing_session_started",
  "production.sewing_session_ended",
  "production.sewing_scan_failed",
  "production.sewing_testing_reset",
  "production.sewing_session_change_requested",
  "production.sewing_session_change_approved",
  "production.sewing_session_change_rejected",
  "production.stitch_kiosk_pause_updated",
  "production.alteration_started",
  "production.stage_advanced",
  "production.handed_to_driver",
  "pattern.alteration_chart_pending",
  "pattern.alteration_chart_acknowledged",
  "pattern.alteration_chart_updated",
  "pattern.alteration_stitcher_comment",
  "pattern.operator_notice_created",
  "pattern.operator_notice_acknowledged",
  "invoice.sent",
  "invoice.created",
  "invoice.updated",
  "invoice.payment_recorded",
  "sales_client_details.updated",
  "sales_client_photo.uploaded",
  "sales_client_photo.deleted",
  "sales_client_photo.assigned",
  "sales_client_photo.unassigned",
  "client_pattern.tud_version_uploaded",
  "client_pattern.marker_uploaded",
  "client_pattern.marker_setup_updated",
  "client_pattern.marker_layout_saved",
  "sales_fitting.created",
  "sales_fitting.updated",
  "sales_order.milestone_updated",
  "quality_inspection.created",
  "custom_fabric.created",
  "employee.created",
  "employee.updated",
  "employee.job_functions_updated",
  "inventory.item_created",
  "inventory.item_updated",
  "inventory.stock_adjusted",
  "inventory.recipe_updated",
  "inventory.garment_deducted",
  "inventory.low_stock",
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
          <p className="font-medium text-slate-900">Zapier to ERP (use Webhooks by Zapier)</p>
          <p className="mt-1 text-xs text-slate-500">Header: Authorization: Bearer YOUR_ERP_API_KEY</p>
          <ul className="mt-2 space-y-1 font-mono text-xs">
            <li>GET/POST {baseUrl}/api/v1/clients</li>
            <li>POST {baseUrl}/api/v1/hr/employees</li>
            <li>PATCH {baseUrl}/api/v1/hr/employees/[id]</li>
            <li>GET {baseUrl}/api/v1/brands</li>
            <li>GET {baseUrl}/api/v1/suppliers</li>
            <li>GET {baseUrl}/api/v1/price-list-items</li>
            <li>GET/POST {baseUrl}/api/v1/custom-fabrics</li>
            <li className="pl-4 text-slate-500">
              POST: JSON or multipart; optional photo/image/swatch file, or image_url (http/https)
            </li>
            <li>GET/POST {baseUrl}/api/v1/fabric-orders</li>
            <li>POST {baseUrl}/api/v1/fabric-orders/cancel</li>
            <li>POST {baseUrl}/api/v1/fabric-orders/[id]/send</li>
            <li>POST {baseUrl}/api/v1/supplier-replies</li>
            <li>POST {baseUrl}/api/v1/shipments</li>
            <li>GET/POST {baseUrl}/api/v1/follow-ups</li>
            <li>POST/PATCH/DELETE {baseUrl}/api/v1/sales-orders/[id]/fabric-lines</li>
            <li>GET/POST {baseUrl}/api/v1/garment-type-changes</li>
            <li>POST {baseUrl}/api/v1/sales-orders/[id]/fabric-lines/transfer</li>
            <li className="pl-4 text-slate-500">
              body: source_line_id, destination_sales_order_id, meters, reason;
              optional acknowledge_receiving_stage, admin_override
            </li>
            <li>POST {baseUrl}/api/v1/sales-orders/[id]/fabric-order-request</li>
            <li>POST {baseUrl}/api/v1/sales-orders/[id]/fabric-pos</li>
            <li>GET/PATCH {baseUrl}/api/v1/pattern/jobs/[id]</li>
            <li>POST {baseUrl}/api/v1/pattern/jobs/link-client-pattern</li>
            <li className="pl-4 text-slate-500">
              body: job_ids[], client_pattern_id - batch-link jobs to one sheet
            </li>
            <li>POST {baseUrl}/api/v1/pattern/jobs/[id]/fittings</li>
            <li>POST {baseUrl}/api/v1/pattern/jobs/[id]/revisions</li>
            <li>POST {baseUrl}/api/v1/pattern/auto-consolidate</li>
            <li>GET {baseUrl}/api/v1/pattern/alterations/pending</li>
            <li>
              PATCH {baseUrl}/api/v1/pattern/alterations/pending/[id] (action:
              acknowledge | chart_updated | stitcher_comments)
            </li>
            <li>GET/POST {baseUrl}/api/v1/pattern/notices</li>
            <li>
              PATCH {baseUrl}/api/v1/pattern/notices/[id] (action: acknowledge)
            </li>
            <li>POST {baseUrl}/api/v1/production/sewing-session/scan</li>
            <li>GET/POST {baseUrl}/api/v1/production/sewing-session/change-request</li>
            <li className="pl-4 text-slate-500">
              body optional: sales_order_id, client_id, dry_run, acted_by - groups jobs by
              garment + composition + gsm per client and links/creates ClientPatterns
            </li>
            <li>GET/PATCH {baseUrl}/api/v1/production/stitch-kiosk-pause</li>
            <li className="pl-4 text-slate-500">
              admin pause for floor stitch kiosk; PATCH body paused + optional
              reason / acted_by; lunch auto-resume at 16:00 Riyadh; event
              production.stitch_kiosk_pause_updated
            </li>
            <li>POST {baseUrl}/api/v1/pattern/library/client-patterns/[patternId]/tud-fill</li>
            <li className="pl-4 text-slate-500">
              body: size, optional base_pattern_id / version_id / applied_by - sets
              base size from a .tud size and fills empty measurement cells (extends
              client_pattern.updated with action tud_size_fill)
            </li>
            <li>
              GET/POST {baseUrl}/api/v1/pattern/library/client-patterns/[patternId]/copy-measurements
            </li>
            <li className="pl-4 text-slate-500">
              POST body: target_pattern_ids[], optional mode overwrite|fill_empty_only,
              optional acted_by - copies sizes onto same-client same-garment
              consolidations; piece_scope all|Overshirt|Trouser|...; event
              client_pattern.measurements_copied
            </li>
            <li>POST {baseUrl}/api/v1/pattern/library/client-patterns/[patternId]/files</li>
            <li className="pl-4 text-slate-500">
              multipart: file, optional piece_name (Jacket/Trouser/...), optional
              slot=marker (optional archive only), optional uploaded_by; ?version=
              for trial (.TUD / .DXF cut outlines preferred; marker upload is not a
              completion gate). Webhook pattern_library.file_uploaded includes
              kind plus tud_* / dxf_* / tum_* / rul_* summary fields when parsed.
            </li>
            <li>POST {baseUrl}/api/v1/pattern/library/client-patterns</li>
            <li className="pl-4 text-slate-500">
              create sheet; optional measurement_template_mode=entire|reduced
              (trousers default reduced = 17 stitcher points)
            </li>
            <li>PATCH {baseUrl}/api/v1/pattern/library/client-patterns/[patternId]</li>
            <li className="pl-4 text-slate-500">
              body may include garment_type, unit (in|cm; converts all trial
              measurement numbers - Pattern UI also has a site-wide Units
              preference for display/print), rebuild_template,
              measurement_template_mode (entire|reduced with rebuild_template),
              active_tud_file_id, active_tud_by_piece, marker_fabric_width_cm,
              marker_double_fold (nest estimate inputs), measurement header
              fields, or trial_sheet_versions (atomic Sample/Trials/Final sheet
              save)
            </li>
            <li>PATCH {baseUrl}/api/v1/pattern/library/client-patterns/[patternId]/versions/[versionId]</li>
            <li className="pl-4 text-slate-500">
              single-trial updates; prefer trial_sheet_versions on the pattern
              PATCH for full sheet saves
            </li>
            <li>GET/PUT/DELETE {baseUrl}/api/v1/pattern/library/bases/[baseId]/client-columns</li>
            <li className="pl-4 text-slate-500">
              PUT body: client_id, client_name, base_size, values (point_id to
              number), optional client_code / saved_by - upserts the client fit
              column next to its base size; DELETE body/query: client_id
            </li>
            <li>POST {baseUrl}/api/v1/sales-orders/[id]/fabric-lines/print</li>
            <li>POST {baseUrl}/api/v1/fabric-receiving/reset-testing</li>
            <li>POST {baseUrl}/api/v1/production/sewing-session/reset-testing</li>
            <li>POST {baseUrl}/api/v1/fabric-receiving/defects</li>
            <li>GET/POST {baseUrl}/api/v1/thread-button-matching</li>
            <li>POST {baseUrl}/api/v1/thread-button-matching/photos</li>
            <li>DELETE {baseUrl}/api/v1/thread-button-matching/photos/[photoId]</li>
            <li>POST {baseUrl}/api/v1/customer-invoices/[id]/mark-sent</li>
            <li>POST {baseUrl}/api/v1/customer-invoices/from-sales-order</li>
            <li>PATCH {baseUrl}/api/v1/customer-invoices/[id]</li>
            <li>POST {baseUrl}/api/v1/customer-invoices/[id]/payments</li>
            <li>POST {baseUrl}/api/v1/sales/client-details</li>
            <li>POST/PATCH {baseUrl}/api/v1/sales/fittings</li>
            <li>PATCH {baseUrl}/api/v1/sales/milestones</li>
            <li>POST {baseUrl}/api/v1/sales/client-photos</li>
            <li>DELETE {baseUrl}/api/v1/sales/client-photos/[photoId]</li>
            <li>POST {baseUrl}/api/v1/sales/client-photos/[photoId]/assign</li>
            <li className="pl-4 text-slate-500">
              body: fabric_line_id (null to unassign), optional article_number /
              client_pattern_id / assigned_by - Pattern links wearing photo to
              fabric line / article
            </li>
            <li>GET {baseUrl}/api/v1/events</li>
          </ul>
        </div>
        <div className="text-sm text-slate-700">
          <p className="font-medium text-slate-900">ERP to Zapier (Catch Hook)</p>
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
