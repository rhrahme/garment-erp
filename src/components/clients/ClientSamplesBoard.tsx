"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Package } from "lucide-react";
import { samplePurposeLabel } from "@/lib/clients/ready-made-sample-fields";
import type { ClientReadyMadeSample } from "@/lib/types/clients";
import { GarmentDeliveryForm, type DeliveryChoice } from "@/components/production/GarmentDeliveryForm";
import { uploadHandoverProofFile } from "@/components/production/upload-handover-proof";

type SampleRow = {
  client_id: string;
  client_code: string;
  client_name: string;
  brand_ids: string[];
  sample: ClientReadyMadeSample;
};

export function ClientSamplesBoard({
  searchQuery,
  brandFilter,
  onOpenClient,
}: {
  searchQuery: string;
  brandFilter: string | null;
  onOpenClient: (clientId: string) => void;
}) {
  const [rows, setRows] = useState<SampleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/client-samples", { cache: "no-store" });
      const payload = (await response.json().catch(() => ({}))) as {
        rows?: SampleRow[];
        samples?: SampleRow[];
        error?: string;
      };
      if (!response.ok) {
        setError(payload.error ?? "Could not load garments.");
        return;
      }
      setRows(payload.rows ?? payload.samples ?? []);
      setError(null);
    } catch {
      setError("Could not load garments.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return rows.filter((row) => {
      if (brandFilter && !row.brand_ids.includes(brandFilter)) return false;
      if (!query) return true;
      const purpose = samplePurposeLabel(row.sample.purpose) ?? "";
      const haystack = [
        row.client_name,
        row.client_code,
        row.sample.product_type,
        purpose,
        row.sample.brand,
        row.sample.color,
        row.sample.size,
        row.sample.notes,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [brandFilter, rows, searchQuery]);

  async function markReturned(sampleId: string, returnedVia: DeliveryChoice, proof: File | null) {
    setBusyId(sampleId);
    try {
      if (proof) {
        const uploaded = await uploadHandoverProofFile("sample", sampleId, proof);
        if (!uploaded.ok) {
          setError(uploaded.error);
          throw new Error(uploaded.error);
        }
      }
      const response = await fetch(`/api/client-samples/${encodeURIComponent(sampleId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ returned: true, returned_via: returnedVia }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        const message = payload.error ?? "Could not mark the garment as given back.";
        setError(message);
        throw new Error(message);
      }
      setRows((previous) => previous.filter((row) => row.sample.id !== sampleId));
      setError(null);
    } catch (error) {
      if (error instanceof Error) throw error;
      setError("Network error. Try again.");
      throw new Error("Network error. Try again.");
    } finally {
      setBusyId(null);
    }
  }

  if (loading && rows.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">
        Loading garments still in the factory...
      </div>
    );
  }

  if (visible.length === 0 && !error) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">
        No client garments waiting to be given back.
        <p className="mt-1 text-xs text-slate-400">
          Open a client and press Add garment when they drop one off.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}
    <ul className="space-y-3">
      {visible.map((row) => {
        const purpose = samplePurposeLabel(row.sample.purpose);
        const busy = busyId === row.sample.id;
        return (
          <li key={row.sample.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Package className="h-4 w-4 text-indigo-500" />
                  {row.sample.product_type || "Garment"}
                  {purpose ? ` - ${purpose}` : ""}
                </p>
                <p className="mt-0.5 text-sm text-slate-600">
                  {row.client_name || "Unnamed client"}{" "}
                  <span className="font-mono text-xs text-slate-400">{row.client_code}</span>
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  Received by {row.sample.received_by_employee_name ?? "?"} on{" "}
                  {new Date(row.sample.added_at).toLocaleDateString()}
                  {row.sample.brand ? ` - ${row.sample.brand}` : ""}
                  {row.sample.size ? ` - ${row.sample.size}` : ""}
                </p>
                {row.sample.notes ? (
                  <p className="mt-1 text-xs text-slate-600">{row.sample.notes}</p>
                ) : null}
              </div>
              <div className="flex w-full max-w-sm flex-col items-stretch gap-2 sm:w-auto">
                <button
                  type="button"
                  onClick={() => onOpenClient(row.client_id)}
                  className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Open client
                </button>
                <GarmentDeliveryForm
                  includeInPerson
                  disabled={busy}
                  onSubmit={(via, proof) => markReturned(row.sample.id, via, proof)}
                />
              </div>
            </div>
            {row.sample.images.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {row.sample.images.map((image) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={image.id}
                    src={`/api/client-samples/${encodeURIComponent(row.sample.id)}/images/${encodeURIComponent(image.id)}?v=${encodeURIComponent(image.uploaded_at)}`}
                    alt={image.filename}
                    className="h-16 w-16 rounded-lg border border-slate-200 object-cover"
                  />
                ))}
              </div>
            ) : (
              <p className="mt-2 text-xs font-medium text-amber-700">
                No photos - add them on the client card.
              </p>
            )}
          </li>
        );
      })}
    </ul>
    </div>
  );
}
