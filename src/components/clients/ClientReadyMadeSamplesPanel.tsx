"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Package, Plus, Trash2, Undo2 } from "lucide-react";
import {
  CLIENT_SAMPLE_PURPOSE_LABELS,
  samplePurposeLabel,
  sampleReturnViaLabel,
  type ClientSamplePurpose,
} from "@/lib/clients/ready-made-sample-fields";
import { GARMENT_STITCH_TYPES } from "@/lib/sales-orders/garment-types";
import type { ClientReadyMadeSample } from "@/lib/types/clients";
import { GarmentDeliveryForm, type DeliveryChoice } from "@/components/production/GarmentDeliveryForm";
import { uploadHandoverProofFile } from "@/components/production/upload-handover-proof";
import { handoverProofSrc } from "@/lib/production/garment-handover";

async function uploadSampleImage(
  sampleId: string,
  file: File
): Promise<{ ok: true; sample: ClientReadyMadeSample } | { ok: false; error: string }> {
  try {
    const prepareResponse = await fetch("/api/client-samples/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sample_id: sampleId,
        filename: file.name,
        content_type: file.type,
        size_bytes: file.size,
      }),
    });
    const prepared = (await prepareResponse.json().catch(() => ({}))) as {
      mode?: string;
      image_id?: string;
      stored_filename?: string;
      content_type?: string;
      upload_url?: string;
      error?: string;
    };
    if (!prepareResponse.ok) {
      return { ok: false, error: prepared.error ?? "Upload failed." };
    }

    if (prepared.mode === "signed" && prepared.upload_url) {
      const put = await fetch(prepared.upload_url, {
        method: "PUT",
        headers: { "Content-Type": prepared.content_type ?? file.type },
        body: file,
      });
      if (!put.ok) return { ok: false, error: "Upload to storage failed. Try again." };
      const registerResponse = await fetch("/api/client-samples/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sample_id: sampleId,
          image_id: prepared.image_id,
          stored_filename: prepared.stored_filename,
          filename: file.name,
          content_type: prepared.content_type ?? file.type,
        }),
      });
      const registered = (await registerResponse.json().catch(() => ({}))) as {
        sample?: ClientReadyMadeSample;
        error?: string;
      };
      if (!registerResponse.ok || !registered.sample) {
        return { ok: false, error: registered.error ?? "Could not register the upload." };
      }
      return { ok: true, sample: registered.sample };
    }

    const form = new FormData();
    form.set("sample_id", sampleId);
    form.set("file", file);
    const response = await fetch("/api/client-samples/upload", { method: "POST", body: form });
    const payload = (await response.json().catch(() => ({}))) as {
      sample?: ClientReadyMadeSample;
      error?: string;
    };
    if (!response.ok || !payload.sample) {
      return { ok: false, error: payload.error ?? "Upload failed." };
    }
    return { ok: true, sample: payload.sample };
  } catch {
    return { ok: false, error: "Network error during upload. Try again." };
  }
}

function resetAddForm(
  setProductType: (value: string) => void,
  setPurpose: (value: ClientSamplePurpose | "") => void,
  setBrand: (value: string) => void,
  setColor: (value: string) => void,
  setSize: (value: string) => void,
  setNotes: (value: string) => void,
  setBadge: (value: string) => void,
  setPendingPhotos: (value: File[]) => void,
  addPhotoInput: { current: HTMLInputElement | null }
) {
  setProductType("");
  setPurpose("");
  setBrand("");
  setColor("");
  setSize("");
  setNotes("");
  setBadge("");
  setPendingPhotos([]);
  if (addPhotoInput.current) addPhotoInput.current.value = "";
}

/**
 * Ready-made samples the client handed us. Photos confirm we received the
 * garment. The receiver scans their ID badge. Later mark that we gave it back.
 */
export function ClientReadyMadeSamplesPanel({
  clientId,
  clientReady,
}: {
  clientId: string;
  clientReady: boolean;
}) {
  const [samples, setSamples] = useState<ClientReadyMadeSample[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [productType, setProductType] = useState("");
  const [purpose, setPurpose] = useState<ClientSamplePurpose | "">("");
  const [brand, setBrand] = useState("");
  const [color, setColor] = useState("");
  const [size, setSize] = useState("");
  const [notes, setNotes] = useState("");
  const [badge, setBadge] = useState("");
  const [pendingPhotos, setPendingPhotos] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [busySampleId, setBusySampleId] = useState<string | null>(null);
  const [uploadingSampleId, setUploadingSampleId] = useState<string | null>(null);
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});
  const addPhotoInput = useRef<HTMLInputElement | null>(null);
  const loadSeq = useRef(0);

  const load = useCallback(async () => {
    if (!clientReady || !clientId) return;
    const seq = ++loadSeq.current;
    setLoading(true);
    try {
      const response = await fetch(
        `/api/client-samples?client_id=${encodeURIComponent(clientId)}`,
        { cache: "no-store" }
      );
      const payload = (await response.json().catch(() => ({}))) as {
        samples?: ClientReadyMadeSample[];
        error?: string;
      };
      if (seq !== loadSeq.current) return;
      if (!response.ok) {
        setError(payload.error ?? "Could not load samples.");
        return;
      }
      setSamples(payload.samples ?? []);
      setError(null);
    } catch {
      if (seq === loadSeq.current) setError("Could not load samples.");
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [clientId, clientReady]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submitSample() {
    if (saving) return;
    if (!productType) {
      setFormError("Pick the garment type from the list.");
      return;
    }
    if (!purpose) {
      setFormError("Say if we are copying the garment or fixing it.");
      return;
    }
    if (pendingPhotos.length < 1) {
      setFormError("Add at least one photo. Photos confirm we received the garment.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const response = await fetch("/api/client-samples", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          product_type: productType,
          purpose,
          brand,
          color,
          size,
          notes,
          received_by_badge: badge,
          photo_count: pendingPhotos.length,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        sample?: ClientReadyMadeSample;
        error?: string;
      };
      if (!response.ok || !payload.sample) {
        setFormError(payload.error ?? "Could not save the sample.");
        return;
      }

      let latest = payload.sample;
      const uploadErrors: string[] = [];
      for (const file of pendingPhotos) {
        const uploaded = await uploadSampleImage(latest.id, file);
        if (!uploaded.ok) {
          uploadErrors.push(uploaded.error);
          continue;
        }
        latest = uploaded.sample;
      }
      setSamples((previous) => [latest, ...previous.filter((row) => row.id !== latest.id)]);
      resetAddForm(
        setProductType,
        setPurpose,
        setBrand,
        setColor,
        setSize,
        setNotes,
        setBadge,
        setPendingPhotos,
        addPhotoInput
      );
      setFormOpen(false);
      if (uploadErrors.length > 0) {
        setError(
          `Sample saved, but a photo did not upload: ${uploadErrors[0]}. Add the photo on the card.`
        );
      }
    } catch {
      setFormError("Network error. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function sendSample(sampleId: string, via: DeliveryChoice, proof: File | null) {
    setBusySampleId(sampleId);
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
        body: JSON.stringify({ returned: true, returned_via: via }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        sample?: ClientReadyMadeSample;
        error?: string;
      };
      if (!response.ok || !payload.sample) {
        const message = payload.error ?? "Could not update the sample.";
        setError(message);
        throw new Error(message);
      }
      setSamples((previous) =>
        previous.map((row) => (row.id === sampleId ? payload.sample! : row))
      );
      setError(null);
    } catch (error) {
      if (error instanceof Error) throw error;
      setError("Network error. Try again.");
      throw new Error("Network error. Try again.");
    } finally {
      setBusySampleId(null);
    }
  }

  async function patchSample(sampleId: string, body: Record<string, unknown>) {
    setBusySampleId(sampleId);
    try {
      const response = await fetch(`/api/client-samples/${encodeURIComponent(sampleId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        sample?: ClientReadyMadeSample;
        error?: string;
      };
      if (!response.ok || !payload.sample) {
        setError(payload.error ?? "Could not update the sample.");
        return;
      }
      setSamples((previous) =>
        previous.map((row) => (row.id === sampleId ? payload.sample! : row))
      );
      setError(null);
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusySampleId(null);
    }
  }

  async function deleteSample(sampleId: string) {
    if (!window.confirm("Delete this sample and its images?")) return;
    setBusySampleId(sampleId);
    try {
      const response = await fetch(`/api/client-samples/${encodeURIComponent(sampleId)}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        setError(payload.error ?? "Could not delete the sample.");
        return;
      }
      setSamples((previous) => previous.filter((row) => row.id !== sampleId));
      setError(null);
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusySampleId(null);
    }
  }

  async function handleFiles(sampleId: string, files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploadingSampleId(sampleId);
    try {
      for (const file of Array.from(files)) {
        const result = await uploadSampleImage(sampleId, file);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setSamples((previous) =>
          previous.map((row) => (row.id === sampleId ? result.sample : row))
        );
      }
      setError(null);
    } finally {
      setUploadingSampleId(null);
      const input = fileInputs.current[sampleId];
      if (input) input.value = "";
    }
  }

  async function deleteImage(sampleId: string, imageId: string) {
    setBusySampleId(sampleId);
    try {
      const response = await fetch(
        `/api/client-samples/${encodeURIComponent(sampleId)}/images/${encodeURIComponent(imageId)}`,
        { method: "DELETE" }
      );
      const payload = (await response.json().catch(() => ({}))) as {
        sample?: ClientReadyMadeSample;
        error?: string;
      };
      if (!response.ok || !payload.sample) {
        setError(payload.error ?? "Could not delete the image.");
        return;
      }
      setSamples((previous) =>
        previous.map((row) => (row.id === sampleId ? payload.sample! : row))
      );
      setError(null);
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusySampleId(null);
    }
  }

  const inputClass =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none";

  return (
    <div id={`client-samples-${clientId}`} className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Package className="h-4 w-4 text-indigo-500" />
            Client garments
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            Client dropped off a garment to copy or fix. Photos confirm we received
            it. Scan your badge when you take it in. Later mark that we gave it
            back to the client.
          </p>
        </div>
        {clientReady ? (
          <button
            type="button"
            onClick={() => setFormOpen((open) => !open)}
            className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
          >
            <Plus className="h-3.5 w-3.5" />
            {formOpen ? "Close" : "Add garment"}
          </button>
        ) : (
          <p className="text-xs text-slate-400">Save the client first.</p>
        )}
      </div>

      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}

      {formOpen && clientReady ? (
        <div className="mt-3 rounded-lg border border-indigo-200 bg-indigo-50/50 p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block text-sm sm:col-span-2">
              <span className="text-xs font-medium text-slate-600">Garment type</span>
              <select
                className={`${inputClass} mt-1 bg-white`}
                value={productType}
                onChange={(event) => setProductType(event.target.value)}
              >
                <option value="">Select garment type...</option>
                {GARMENT_STITCH_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>
            <div className="sm:col-span-2">
              <p className="text-xs font-medium text-slate-600">Why we have it</p>
              <div className="mt-1 flex flex-wrap gap-2">
                {(["copy", "fix"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setPurpose(value)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                      purpose === value
                        ? "bg-indigo-600 text-white"
                        : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {CLIENT_SAMPLE_PURPOSE_LABELS[value]}
                  </button>
                ))}
              </div>
            </div>
            <input
              className={inputClass}
              placeholder="Brand"
              value={brand}
              onChange={(event) => setBrand(event.target.value)}
            />
            <input
              className={inputClass}
              placeholder="Color"
              value={color}
              onChange={(event) => setColor(event.target.value)}
            />
            <input
              className={inputClass}
              placeholder="Size"
              value={size}
              onChange={(event) => setSize(event.target.value)}
            />
          </div>
          <textarea
            className={`${inputClass} mt-2`}
            rows={2}
            placeholder="Notes (condition, what to copy or fix...)"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
          <div className="mt-2 rounded-lg border border-indigo-300 bg-white p-2">
            <p className="text-xs font-medium text-indigo-900">
              Photos confirm we received the garment
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              At least one photo is required before you can save.
            </p>
            <input
              ref={addPhotoInput}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(event) => {
                const files = event.target.files;
                setPendingPhotos(files ? Array.from(files) : []);
              }}
            />
            <button
              type="button"
              onClick={() => addPhotoInput.current?.click()}
              className="mt-2 inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
            >
              <Plus className="h-3.5 w-3.5" />
              Add photos
            </button>
            {pendingPhotos.length > 0 ? (
              <p className="mt-1 text-xs text-slate-600">
                {pendingPhotos.length} photo{pendingPhotos.length === 1 ? "" : "s"} selected
              </p>
            ) : (
              <p className="mt-1 text-xs text-slate-500">No photos selected yet.</p>
            )}
          </div>
          <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-2">
            <p className="text-xs font-medium text-amber-800">
              Receiver: scan your employee ID badge here
            </p>
            <input
              className={`${inputClass} mt-1`}
              placeholder="Scan badge (required)"
              value={badge}
              onChange={(event) => setBadge(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void submitSample();
                }
              }}
            />
          </div>
          {formError ? <p className="mt-2 text-xs text-red-600">{formError}</p> : null}
          <button
            type="button"
            disabled={saving}
            onClick={() => void submitSample()}
            className="mt-2 inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Save sample
          </button>
        </div>
      ) : null}

      {loading && samples.length === 0 ? (
        <p className="mt-3 text-xs text-slate-400">Loading samples...</p>
      ) : null}
      {!loading && clientReady && samples.length === 0 ? (
        <p className="mt-3 text-xs text-slate-400">No samples recorded.</p>
      ) : null}

      <div className="mt-3 space-y-3">
        {samples.map((sample) => {
          const busy = busySampleId === sample.id;
          const uploading = uploadingSampleId === sample.id;
          const purposeLabel = samplePurposeLabel(sample.purpose);
          const garmentLabel =
            [sample.product_type, sample.brand, sample.color, sample.size]
              .filter(Boolean)
              .join(" - ") || "Sample";
          return (
            <div key={sample.id} className="rounded-lg border border-slate-200 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-slate-800">
                    {garmentLabel}
                    {purposeLabel ? (
                      <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                        {purposeLabel}
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Received by {sample.received_by_employee_name ?? "?"} -{" "}
                    {new Date(sample.added_at).toLocaleDateString()}
                    {sample.added_by ? ` - logged by ${sample.added_by}` : ""}
                  </p>
                  {sample.notes ? (
                    <p className="mt-1 text-xs text-slate-600">{sample.notes}</p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  {sample.returned_at ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                      {sampleReturnViaLabel(sample.returned_via) ?? "Gave it back"}{" "}
                      {new Date(sample.returned_at).toLocaleDateString()}
                    </span>
                  ) : (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                      Still with us - give it back to the client
                    </span>
                  )}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void deleteSample(sample.id)}
                    className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    title="Delete sample"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {sample.handover_proof ? (
                <div className="mt-2">
                  <p className="mb-1 text-[11px] font-medium text-slate-500">Handover proof</p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={handoverProofSrc("sample", sample.id, sample.handover_proof)}
                    alt={sample.handover_proof.filename}
                    className="h-24 w-24 rounded-lg border border-indigo-200 object-cover"
                  />
                </div>
              ) : null}

              {sample.images.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {sample.images.map((image) => (
                    <div key={image.id} className="group relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/client-samples/${encodeURIComponent(sample.id)}/images/${encodeURIComponent(image.id)}?v=${encodeURIComponent(image.uploaded_at)}`}
                        alt={image.filename}
                        className="h-24 w-24 rounded-lg border border-slate-200 object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => void deleteImage(sample.id, image.id)}
                        className="absolute -right-1.5 -top-1.5 hidden rounded-full bg-red-600 p-0.5 text-white group-hover:block"
                        title="Delete image"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-xs text-amber-700">No receipt photo yet.</p>
              )}

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input
                  ref={(node) => {
                    fileInputs.current[sample.id] = node;
                  }}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(event) => void handleFiles(sample.id, event.target.files)}
                />
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => fileInputs.current[sample.id]?.click()}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                  {uploading ? "Uploading..." : "Add photos"}
                </button>
                {sample.returned_at ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void patchSample(sample.id, { returned: false })}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                  >
                    <Undo2 className="h-3 w-3" />
                    Undo - still with us
                  </button>
                ) : (
                  <div className="w-full max-w-sm">
                    <GarmentDeliveryForm
                      includeInPerson
                      disabled={busy}
                      onSubmit={(via, proof) => sendSample(sample.id, via, proof)}
                    />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
