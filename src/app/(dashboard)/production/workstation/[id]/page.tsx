import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import {
  getWorkstationById,
  hasMachineInfo,
  normalizeWorkstationId,
  parseWorkstationId,
  workstationLabel,
  workstationScanUrl,
} from "@/lib/production/factory-workstations";
import { qrImageUrl } from "@/lib/production/qr-labels";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function WorkstationPage({ params }: PageProps) {
  const { id: rawId } = await params;
  if (!parseWorkstationId(rawId)) notFound();

  const canonicalId = normalizeWorkstationId(rawId);
  if (!canonicalId) notFound();
  if (rawId.trim().toUpperCase() !== canonicalId.toUpperCase()) {
    redirect(`/production/workstation/${encodeURIComponent(canonicalId)}`);
  }

  const workstation = getWorkstationById(canonicalId);
  if (!workstation) notFound();

  const scanUrl = workstationScanUrl(workstation.id);
  const qrSrc = qrImageUrl(scanUrl, 200);

  return (
    <div>
      <PageHeader
        title={workstation.id}
        description={workstationLabel(workstation.line_number, workstation.station_number)}
        action={
          <Link href="/production/floor-map" className="text-sm font-medium text-indigo-700 hover:text-indigo-900">
            ← Floor map
          </Link>
        }
      />

      <div className="mx-auto max-w-md space-y-6 rounded-xl border border-slate-200 bg-white p-6">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Production workstation</p>
          <p className="mt-1 text-3xl font-bold text-slate-900">{workstation.id}</p>
          <p className="mt-1 text-sm text-slate-600">{workstation.label}</p>
        </div>

        {hasMachineInfo(workstation) ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-center">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Machine</p>
            {workstation.machine_use ? (
              <p className="mt-1 text-base font-semibold text-slate-900">{workstation.machine_use}</p>
            ) : null}
            {workstation.machine_reference ? (
              <p className="mt-1 font-mono text-sm text-slate-600">{workstation.machine_reference}</p>
            ) : null}
          </div>
        ) : null}

        <div className="flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrSrc} alt={`QR code for ${workstation.id}`} width={200} height={200} className="rounded-lg border border-slate-200" />
        </div>

        <p className="break-all text-center font-mono text-xs text-slate-500">{scanUrl}</p>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Link href="/production" className="flex-1">
            <Button type="button" variant="primary" className="w-full">
              Open Production scan
            </Button>
          </Link>
          <a href="/api/factory/workstations?format=pdf" target="_blank" rel="noreferrer" className="flex-1">
            <Button type="button" variant="secondary" className="w-full">
              Download all QR placards
            </Button>
          </a>
        </div>
      </div>
    </div>
  );
}
