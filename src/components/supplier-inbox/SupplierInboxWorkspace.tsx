"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Inbox, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/PageHeader";
import type { SupplierReplyRecord, SupplierLineUpdate } from "@/lib/integrations/supplier-reply-store";
import type { SupplierAvailabilityAlert } from "@/lib/integrations/supplier-availability-store";
import { formatDate } from "@/lib/utils";

function lineUpdateLabel(status: SupplierLineUpdate["status"]): string {
  switch (status) {
    case "temp_unavailable":
      return "Temporarily unavailable";
    case "permanently_unavailable":
      return "Out of stock";
    case "substituted":
      return "Substitution suggested";
    default:
      return status;
  }
}

function AvailabilityAlertCard({
  alert,
  onResolved,
}: {
  alert: SupplierAvailabilityAlert;
  onResolved: () => void;
}) {
  const [busy, setBusy] = useState<"wait" | "replace" | "dismissed" | null>(null);

  async function resolveAlert(resolution: "wait" | "replace" | "dismissed") {
    setBusy(resolution);
    try {
      const res = await fetch(`/api/supplier-availability-alerts/${alert.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolution }),
      });
      if (!res.ok) throw new Error("Failed to update alert");
      onResolved();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-base font-semibold text-amber-950">{alert.fabric_number}</p>
          <p className="mt-1 text-sm text-amber-900">
            {alert.supplier_name ?? alert.supplier_id ?? "Supplier"} · {lineUpdateLabel(alert.status)}
          </p>
          {alert.restock_date && (
            <p className="mt-1 text-sm text-amber-800">Expected available from {formatDate(alert.restock_date)}</p>
          )}
          {alert.substitute_fabric_number && (
            <p className="mt-1 text-sm text-amber-800">
              Suggested replacement: <span className="font-mono">{alert.substitute_fabric_number}</span>
            </p>
          )}
          {(alert.client_name || alert.sales_order_number) && (
            <p className="mt-2 text-sm text-amber-900">
              {alert.client_name}
              {alert.sales_order_number ? (
                <>
                  {" "}
                  ·{" "}
                  <Link href={`/orders/${alert.sales_order_id}`} className="font-medium underline">
                    {alert.sales_order_number}
                  </Link>
                </>
              ) : null}
            </p>
          )}
          {alert.po_number && (
            <p className="mt-1 text-xs text-amber-800">
              Fabric PO: <span className="font-mono">{alert.po_number}</span>
            </p>
          )}
          {alert.note && <p className="mt-2 text-xs text-amber-800">{alert.note}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={!!busy} onClick={() => void resolveAlert("wait")}>
            {busy === "wait" ? "Saving…" : "Wait for fabric"}
          </Button>
          <Button size="sm" variant="secondary" disabled={!!busy} onClick={() => void resolveAlert("replace")}>
            {busy === "replace" ? "Saving…" : "Replace fabric"}
          </Button>
          <Button size="sm" variant="secondary" disabled={!!busy} onClick={() => void resolveAlert("dismissed")}>
            Dismiss
          </Button>
        </div>
      </div>
    </div>
  );
}

export function SupplierInboxWorkspace() {
  const [replies, setReplies] = useState<SupplierReplyRecord[]>([]);
  const [alerts, setAlerts] = useState<SupplierAvailabilityAlert[]>([]);
  const [pendingAlertCount, setPendingAlertCount] = useState(0);
  const [scanMailbox, setScanMailbox] = useState<string | null>(null);
  const [sendMailbox, setSendMailbox] = useState<string | null>(null);
  const [configured, setConfigured] = useState(false);
  const [imapPassword, setImapPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [repliesRes, alertsRes, statusRes] = await Promise.all([
        fetch("/api/supplier-replies"),
        fetch("/api/supplier-availability-alerts?pending=1"),
        fetch("/api/email/scan-inbox"),
      ]);

      if (!repliesRes.ok) throw new Error("Failed to load supplier replies");
      const repliesData = (await repliesRes.json()) as { replies: SupplierReplyRecord[] };
      setReplies(repliesData.replies);

      if (alertsRes.ok) {
        const alertsData = (await alertsRes.json()) as {
          alerts: SupplierAvailabilityAlert[];
          pending_count: number;
        };
        setAlerts(alertsData.alerts);
        setPendingAlertCount(alertsData.pending_count);
      }

      if (statusRes.ok) {
        const statusData = await statusRes.json();
        setConfigured(Boolean(statusData.configured));
        setScanMailbox(statusData.scan_mailbox ?? null);
        setSendMailbox(statusData.send_mailbox ?? null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load supplier inbox");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function scanInbox() {
    setScanning(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/email/scan-inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(imapPassword ? { password: imapPassword } : {}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to scan inbox");

      setImapPassword("");
      setMessage(
        `Scanned ${data.scanned} emails (last ${data.scan_days ?? 180} days) — ${data.processed} new replies, ${data.shipments_created} tracking number${data.shipments_created === 1 ? "" : "s"}, ${data.invoices_saved ?? 0} supplier invoice PDF${(data.invoices_saved ?? 0) === 1 ? "" : "s"}, ${data.availability_alerts_created ?? 0} fabric availability alert${(data.availability_alerts_created ?? 0) === 1 ? "" : "s"}, ${data.transporter_invoices_saved ?? 0} transporter/customs document${(data.transporter_invoices_saved ?? 0) === 1 ? "" : "s"} saved.`
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to scan inbox");
    } finally {
      setScanning(false);
    }
  }

  const withTracking = replies.filter((reply) => (reply.awb_numbers?.length ?? 0) > 0);
  const withInvoices = replies.filter((reply) => (reply.invoice_numbers?.length ?? 0) > 0);
  const withAvailability = replies.filter((reply) => (reply.line_updates?.length ?? 0) > 0);

  return (
    <div className="space-y-8">
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-indigo-50 p-2 text-indigo-600">
              <Inbox className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Scan supplier replies</h2>
              <p className="mt-1 max-w-2xl text-sm text-slate-500">
                Fabric orders are <strong>sent from</strong>{" "}
                <span className="font-mono text-slate-700">{sendMailbox ?? "—"}</span>. This scans{" "}
                <span className="font-mono text-slate-700">{scanMailbox ?? "—"}</span> for supplier replies.
                Only imports replies from known supplier domains (
                <span className="font-mono text-slate-600">@loropiana.com</span>,{" "}
                <span className="font-mono text-slate-600">@zegna.com</span>,{" "}
                <span className="font-mono text-slate-600">@stylbiella.it</span>,{" "}
                <span className="font-mono text-slate-600">@drapersitaly.it</span>,{" "}
                <span className="font-mono text-slate-600">@caccioppolinapoli.it</span>,{" "}
                <span className="font-mono text-slate-600">@comoluxuryfabrics.com</span>) or exact emails
                listed under Purchasing → Suppliers — any colleague at the mill counts, not only the order
                contact. DHL, customs, and other transporter emails are handled separately. From allowed
                senders, matches PO numbers, invoices, tracking, and fabric availability (out of stock /
                restock dates). When a supplier says an article is unavailable, you&apos;ll get an email alert
                and can choose to wait or replace the fabric here.
              </p>
              {!scanMailbox && (
                <p className="mt-2 text-sm text-amber-800">
                  No inbox configured yet — set one under{" "}
                  <Link href="/purchasing/suppliers" className="font-medium text-indigo-600 hover:text-indigo-700">
                    Purchasing → Suppliers
                  </Link>
                  .
                </p>
              )}
              {scanMailbox && (
                <div className="mt-4 max-w-md">
                  <label className="block text-sm font-medium text-slate-700">
                    Google App Password for {scanMailbox}
                  </label>
                  <input
                    type="password"
                    value={imapPassword}
                    onChange={(e) => setImapPassword(e.target.value)}
                    placeholder={configured ? "Saved — enter only to update" : "16-character app password"}
                    className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    Create at{" "}
                    <a
                      href="https://myaccount.google.com/apppasswords"
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-indigo-600 hover:text-indigo-700"
                    >
                      myaccount.google.com/apppasswords
                    </a>
                    . Change the scan inbox anytime under{" "}
                    <Link href="/purchasing/suppliers" className="font-medium text-indigo-600 hover:text-indigo-700">
                      Purchasing → Suppliers
                    </Link>
                    .
                  </p>
                </div>
              )}
            </div>
          </div>
          <Button
            onClick={() => void scanInbox()}
            disabled={scanning || !scanMailbox || (!configured && !imapPassword.trim())}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${scanning ? "animate-spin" : ""}`} />
            {scanning ? "Scanning…" : "Scan inbox"}
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      )}
      {message && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {message}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 text-center">
          <p className="text-2xl font-bold text-slate-900">{replies.length}</p>
          <p className="text-xs font-medium text-slate-600">Supplier replies</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 text-center">
          <p className="text-2xl font-bold text-slate-900">{withTracking.length}</p>
          <p className="text-xs font-medium text-slate-600">With tracking</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 text-center">
          <p className="text-2xl font-bold text-slate-900">{withInvoices.length}</p>
          <p className="text-xs font-medium text-slate-600">With invoices</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 text-center">
          <p className="text-2xl font-bold text-slate-900">{withAvailability.length}</p>
          <p className="text-xs font-medium text-slate-600">With availability notes</p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-center">
          <p className="text-2xl font-bold text-amber-900">{pendingAlertCount}</p>
          <p className="text-xs font-medium text-amber-800">Needs decision</p>
        </div>
      </div>

      {alerts.length > 0 && (
        <div className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Fabric availability — action needed</h2>
            <p className="mt-1 text-sm text-slate-500">
              Choose whether to wait for restock or replace the fabric on the sales order.
            </p>
          </div>
          {alerts.map((alert) => (
            <AvailabilityAlertCard key={alert.id} alert={alert} onResolved={() => void load()} />
          ))}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">Loading supplier replies…</p>
      ) : replies.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 bg-white px-6 py-10 text-center text-sm text-slate-500">
          No supplier replies yet — send fabric orders from Supplier Emails, then scan the inbox here.
        </p>
      ) : (
        <div className="space-y-3">
          {replies.map((reply) => (
            <div key={reply.id} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
              <div className="md:flex md:items-start md:justify-between md:gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900">{reply.subject}</p>
                  <p className="mt-1 text-sm text-slate-700">{reply.from_address}</p>
                  <p className="mt-0.5 text-xs text-slate-500">Received {formatDate(reply.received_at.slice(0, 10))}</p>
                  {reply.po_number && (
                    <p className="mt-2 text-sm text-indigo-800">
                      Matched PO: <span className="font-mono font-semibold">{reply.po_number}</span>
                    </p>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap gap-2 md:mt-0 md:justify-end">
                  {(reply.line_updates?.length ?? 0) > 0 && <StatusBadge status="on_hold" />}
                  {(reply.awb_numbers?.length ?? 0) > 0 && <StatusBadge status="in_transit" />}
                  {(reply.invoice_numbers?.length ?? 0) > 0 && <StatusBadge status="confirmed" />}
                </div>
              </div>

              {(reply.line_updates?.length ?? 0) > 0 && (
                <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-sm">
                  <p className="font-medium text-amber-950">Fabric availability</p>
                  <ul className="mt-2 space-y-2">
                    {reply.line_updates!.map((update) => (
                      <li key={`${reply.id}-${update.fabric_number}`} className="rounded border border-amber-100 bg-white px-3 py-2">
                        <p className="font-mono font-semibold text-amber-950">{update.fabric_number}</p>
                        <p className="text-xs text-amber-900">{lineUpdateLabel(update.status)}</p>
                        {update.restock_date && (
                          <p className="text-xs text-amber-800">Available from {formatDate(update.restock_date)}</p>
                        )}
                        {update.substitute_fabric_number && (
                          <p className="text-xs text-amber-800">
                            Suggested replacement: {update.substitute_fabric_number}
                          </p>
                        )}
                        {update.note && <p className="mt-1 text-xs text-slate-600">{update.note}</p>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {(reply.awb_numbers?.length ?? 0) > 0 && (
                <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm">
                  <p className="font-medium text-slate-800">Tracking numbers</p>
                  <ul className="mt-1 space-y-1 font-mono text-indigo-800">
                    {reply.awb_numbers!.map((awb) => (
                      <li key={awb}>{awb}</li>
                    ))}
                  </ul>
                  <Link href="/shipments" className="mt-2 inline-block text-xs font-medium text-indigo-600 hover:text-indigo-700">
                    View on AWB Tracking →
                  </Link>
                </div>
              )}

              {(reply.invoice_numbers?.length ?? 0) > 0 && (
                <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm">
                  <p className="font-medium text-slate-800">Invoices</p>
                  <ul className="mt-1 space-y-1 font-mono text-slate-700">
                    {reply.invoice_numbers!.map((invoice) => (
                      <li key={invoice}>{invoice}</li>
                    ))}
                  </ul>
                </div>
              )}

              {(reply.attachment_names?.length ?? 0) > 0 && (
                <p className="text-xs text-slate-500">Attachments: {reply.attachment_names!.join(", ")}</p>
              )}

              {reply.body && (
                <details className="text-sm text-slate-600">
                  <summary className="cursor-pointer font-medium text-slate-700">Email body</summary>
                  <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs">
                    {reply.body}
                  </pre>
                </details>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
