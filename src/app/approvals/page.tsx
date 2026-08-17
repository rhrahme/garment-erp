import { verifyAdminApprovalsToken } from "@/lib/auth/admin-approvals-token";
import { listPendingClientNameChangeRequests } from "@/lib/clients/name-change-requests";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import {
  listPendingSewingSessionChangeRequests,
  readSewingSessionChangeRequestsFresh,
} from "@/lib/data/sewing-session-change-requests";
import { ensureFabricOrdersLoaded } from "@/lib/integrations/fabric-order-store";
import { summarizeSewingSessionChangeRequest } from "@/lib/production/sewing-session-change-requests";
import { listPendingFabricLineDeleteRequests } from "@/lib/sales-orders/fabric-line-delete-requests";
import { AdminApprovalsClient } from "@/components/admin/AdminApprovalsClient";

export const dynamic = "force-dynamic";

/**
 * Phone-friendly approvals page linked from admin notification emails.
 * Access is authorized by the signed token in the URL (no login) - see
 * admin-approvals-token.ts. Lists every pending admin request stacked with
 * Approve/Reject per row plus select-all / approve-all.
 */

function MessageCard({ title, detail }: { title: string; detail: string }) {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-md rounded-xl border border-slate-200 bg-white p-6">
        <h1 className="text-lg font-semibold text-amber-700">{title}</h1>
        <p className="mt-2 text-sm text-slate-600">{detail}</p>
        <p className="mt-4 text-xs text-slate-400">Garment ERP - admin approvals</p>
      </div>
    </main>
  );
}

export default async function AdminApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const verified = verifyAdminApprovalsToken(token ?? "");
  if (!verified.ok) {
    return (
      <MessageCard
        title={verified.reason === "expired" ? "Link expired" : "Invalid link"}
        detail={
          verified.reason === "expired"
            ? "This approvals link is older than 7 days. Open the ERP dashboard or use the link from a newer email."
            : "This approvals link is not valid. Use the link from an admin notification email."
        }
      />
    );
  }

  await ensureDocumentsLoaded(["clients", "sales_orders", "sewing_session_change_requests"]);
  await ensureFabricOrdersLoaded();

  const nameChanges = listPendingClientNameChangeRequests();
  const sewingStore = await readSewingSessionChangeRequestsFresh();
  const sewingRequests = listPendingSewingSessionChangeRequests(sewingStore).map(
    summarizeSewingSessionChangeRequest
  );
  const fabricLineDeletes = listPendingFabricLineDeleteRequests();

  return (
    <AdminApprovalsClient
      token={token ?? ""}
      adminEmail={verified.payload.admin_email}
      nameChanges={nameChanges.map((row) => ({
        client_id: row.client_id,
        client_code: row.client_code,
        current_name: row.current_name,
        proposed_name: row.proposed_name,
        requested_by: row.requested_by,
        requested_at: row.requested_at,
      }))}
      sewingRequests={sewingRequests.map((row) => ({
        id: row.id,
        label: row.label,
        production_code: row.production_code,
        employee_name: row.employee_name,
        so_number: row.so_number,
        requested_by: row.requested_by,
        requested_at: row.requested_at,
        reason: row.reason,
      }))}
      fabricLineDeletes={fabricLineDeletes.map((row) => ({
        order_id: row.sales_order_id,
        line_id: row.line_id,
        so_number: row.so_number,
        article_label: row.article_label,
        fabric_number: row.fabric_number,
        garment_type: row.garment_type,
        client_name: row.client_name,
        requested_by: row.delete_requested_by,
        requested_at: row.delete_requested_at,
        reason: row.delete_request_reason,
      }))}
    />
  );
}
