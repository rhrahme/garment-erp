"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Scissors } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/PageHeader";
import type { TodaysFabricSummary } from "@/lib/sales-orders/todays-fabric";

type TodaysFabricPanelProps = {
  initialSummary: TodaysFabricSummary;
};

function dateScopeLabel(scope: TodaysFabricSummary["date_scope"]): string {
  return scope === "today" ? "today" : "the last 7 days";
}

export function TodaysFabricPanel({ initialSummary }: TodaysFabricPanelProps) {
  const router = useRouter();
  const [summary, setSummary] = useState(initialSummary);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"prepare" | "pos_only" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const creatableOrderIds = summary.orders.filter((order) => order.can_create_pos).map((order) => order.id);
  const blockedOrders = summary.orders.filter(
    (order) => order.status === "open" && !order.can_create_pos && !order.has_pos
  );

  async function refreshSummary() {
    const res = await fetch("/api/fabric-orders/todays-fabric");
    if (!res.ok) return;
    const data = (await res.json()) as TodaysFabricSummary;
    setSummary(data);
  }

  async function handlePrepare(redirectToEmails: boolean) {
    setError(null);
    setMessage(null);

    if (redirectToEmails && creatableOrderIds.length === 0) {
      router.push("/supplier-emails");
      return;
    }

    setLoading(true);
    setMode(redirectToEmails ? "prepare" : "pos_only");

    try {
      const res = await fetch("/api/fabric-orders/prepare-supplier-emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderIds: creatableOrderIds.length > 0 ? creatableOrderIds : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to prepare supplier emails");
      }

      const createdCount = (data.created ?? []).length;
      const pendingSuppliers = data.pending_supplier_count ?? summary.pending_supplier_count;

      if (redirectToEmails) {
        const parts: string[] = [];
        if (createdCount > 0) {
          parts.push(`Created POs for ${createdCount} order${createdCount === 1 ? "" : "s"}`);
        }
        parts.push(`${pendingSuppliers} supplier email${pendingSuppliers === 1 ? "" : "s"} ready`);
        sessionStorage.setItem("todays_fabric_flash", parts.join(". ") + ".");
        router.push("/supplier-emails");
        return;
      }

      const skipped = (data.skipped ?? []) as Array<{ so_number: string; reason: string }>;
      let resultMessage = "";
      if (createdCount > 0) {
        resultMessage = `Created POs for ${createdCount} order${createdCount === 1 ? "" : "s"}.`;
      } else {
        resultMessage = "No new POs were created.";
      }
      if (skipped.length > 0) {
        resultMessage += ` Skipped ${skipped.length}: ${skipped.map((item) => item.so_number).join(", ")}.`;
      }
      setMessage(resultMessage);
      await refreshSummary();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to prepare supplier emails");
    } finally {
      setLoading(false);
      setMode(null);
    }
  }

  if (summary.order_count === 0) {
    return null;
  }

  const summaryLine = `${summary.order_count} order${summary.order_count === 1 ? "" : "s"} · ${summary.pending_supplier_count} supplier${summary.pending_supplier_count === 1 ? "" : "s"} to email`;

  return (
    <Card className="mb-8 border-indigo-200 bg-gradient-to-br from-indigo-50/80 to-white">
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-indigo-100 p-2 text-indigo-600">
            <Scissors className="h-5 w-5" />
          </div>
          <div>
            <CardTitle>Today&apos;s fabric</CardTitle>
            <p className="mt-1 text-sm text-slate-600">
              Orders from {dateScopeLabel(summary.date_scope)} needing fabric POs or supplier emails.
            </p>
            <p className="mt-1 text-sm font-medium text-indigo-900">{summaryLine}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => void handlePrepare(true)}
            disabled={loading}
          >
            {loading && mode === "prepare" ? "Preparing…" : "Prepare & review supplier emails"}
          </Button>
          {creatableOrderIds.length > 0 && (
            <Button
              variant="secondary"
              onClick={() => void handlePrepare(false)}
              disabled={loading}
            >
              {loading && mode === "pos_only" ? "Creating POs…" : "Create POs only"}
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4 p-0">
        {error && (
          <div className="mx-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}
        {message && (
          <div className="mx-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            {message}
          </div>
        )}
        {blockedOrders.length > 0 && (
          <div className="mx-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p className="font-medium">Some orders need fixes before POs can be created:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {blockedOrders.map((order) => (
                <li key={order.id}>
                  <Link href={`/orders/${order.id}`} className="font-medium underline">
                    {order.so_number}
                  </Link>
                  {" — "}
                  {order.block_reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-indigo-100 bg-indigo-50/50">
                <th className="px-4 py-3 text-left font-medium text-slate-600">Order</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Client</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Fabrics</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Status</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">POs</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Emails</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {summary.orders.map((order) => (
                <tr key={order.id} className="hover:bg-slate-50/50">
                  <td className="px-4 py-3">
                    <Link href={`/orders/${order.id}`} className="font-medium text-indigo-700 hover:underline">
                      {order.so_number}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-medium text-slate-900">{order.client_name}</span>
                    <span className="ml-2 font-mono text-xs text-slate-500">{order.client_code}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{order.fabric_line_count}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={order.status} />
                  </td>
                  <td className="px-4 py-3 text-slate-700">{order.has_pos ? "Yes" : "No"}</td>
                  <td className="px-4 py-3 text-slate-700">
                    {order.has_pos
                      ? order.supplier_emails_pending
                        ? "Pending"
                        : "Sent"
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
