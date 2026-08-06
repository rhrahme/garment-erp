import {
  badgeDisplayName,
  badgeJobFunctionsLine,
  badgePrintDateLabel,
} from "@/lib/hr/badge-print";
import { employeeAlterationQrPayload, employeeQrPayload } from "@/lib/hr/employee-qr";
import type { IdBadgeGroup } from "@/lib/hr/payroll-utils";
import { qrImageUrl } from "@/lib/production/qr-labels";
import type { PayrollEmployee } from "@/lib/types/hr-payroll";

/** Pixel size for QR image generation (display size is mm below). */
const QR_SIZE = 120;

/** Saudi badges keep a group label; expat cards show no EIB/Expat chrome. */
function groupLabel(group: IdBadgeGroup): string | null {
  return group === "saudi" ? "Saudi" : null;
}

const COMPANY_NAME = "HAGAN INDUSTRIAL COMPANY";

/** L-shaped cut guides just outside each card corner. */
function CropMarks() {
  const arm = "absolute bg-slate-800 print:bg-black";
  return (
    <>
      {/* top-left */}
      <span aria-hidden className={`${arm} -left-[3mm] top-0 h-[0.25mm] w-[2.5mm]`} />
      <span aria-hidden className={`${arm} left-0 -top-[3mm] h-[2.5mm] w-[0.25mm]`} />
      {/* top-right */}
      <span aria-hidden className={`${arm} -right-[3mm] top-0 h-[0.25mm] w-[2.5mm]`} />
      <span aria-hidden className={`${arm} right-0 -top-[3mm] h-[2.5mm] w-[0.25mm]`} />
      {/* bottom-left */}
      <span aria-hidden className={`${arm} -left-[3mm] bottom-0 h-[0.25mm] w-[2.5mm]`} />
      <span aria-hidden className={`${arm} left-0 -bottom-[3mm] h-[2.5mm] w-[0.25mm]`} />
      {/* bottom-right */}
      <span aria-hidden className={`${arm} -right-[3mm] bottom-0 h-[0.25mm] w-[2.5mm]`} />
      <span aria-hidden className={`${arm} right-0 -bottom-[3mm] h-[2.5mm] w-[0.25mm]`} />
    </>
  );
}

export function EmployeeBadgeCard({
  employee,
  group,
}: {
  employee: PayrollEmployee;
  group: IdBadgeGroup;
}) {
  const payload = employeeQrPayload(employee);
  const altPayload = employeeAlterationQrPayload(employee);
  const qrSrc = qrImageUrl(payload, QR_SIZE);
  const altQrSrc = qrImageUrl(altPayload, QR_SIZE);
  const label = groupLabel(group);
  const displayName = badgeDisplayName(employee);
  const jobsLine = badgeJobFunctionsLine(employee);
  const printedLabel = badgePrintDateLabel();

  return (
    <div className="badge-print-slot relative">
      <CropMarks />

      <article className="badge-card flex h-full w-full flex-col overflow-hidden rounded-lg border-2 border-[#0B2C5A] bg-white shadow-sm print:rounded-none">
        {/* Full-width company band - reserved height, never clipped by QR/body.
            Use <div> (not <header>): print CSS hides bare header/nav/aside chrome. */}
        <div className="badge-company-band flex h-[7mm] shrink-0 items-center justify-center border-b-2 border-[#0B2C5A] bg-[#0B2C5A] px-1.5">
          <p className="badge-company-name whitespace-nowrap text-center text-[9px] font-bold uppercase leading-none tracking-[0.1em] text-white">
            {COMPANY_NAME}
          </p>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* Wide gap between Sew / Alt so the USB wedge cannot grab the wrong QR. */}
          <div className="flex w-[52%] items-center justify-center gap-[6.5mm] border-r border-slate-200 bg-slate-50 px-1 py-1">
            <div className="flex shrink-0 flex-col items-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrSrc}
                alt=""
                width={QR_SIZE}
                height={QR_SIZE}
                className="h-[12mm] w-[12mm] shrink-0 rounded-sm border border-slate-200 bg-white"
              />
              <p className="mt-0.5 text-[5px] font-semibold uppercase leading-none tracking-wide text-slate-600">
                Sew
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={altQrSrc}
                alt=""
                width={QR_SIZE}
                height={QR_SIZE}
                className="h-[12mm] w-[12mm] shrink-0 rounded-sm border-2 border-amber-600 bg-white"
              />
              <p className="mt-0.5 text-[5px] font-bold uppercase leading-none tracking-wide text-amber-800">
                Alt
              </p>
            </div>
          </div>
          <div className="flex min-w-0 flex-1 flex-col justify-between px-2 py-1.5 text-left">
            <div className="min-w-0">
              {label ? (
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#0B2C5A]">
                  {label}
                </p>
              ) : null}
              <h2
                className={`${
                  jobsLine ? "line-clamp-2" : "line-clamp-3"
                } text-[12px] font-semibold leading-snug text-slate-900 ${label ? "mt-0.5" : ""}`}
              >
                {displayName}
              </h2>
              {jobsLine ? (
                <p className="badge-job-functions mt-0.5 line-clamp-2 text-[11px] font-semibold leading-snug text-slate-700">
                  {jobsLine}
                </p>
              ) : null}
            </div>
            {/* Footer reserved so print date is never clipped by overflow / name length */}
            <div className="badge-card-footer mt-1 min-w-0 shrink-0">
              <p className="text-[7px] uppercase tracking-wide text-slate-500">Employee ID</p>
              <p className="truncate font-mono text-[11px] font-semibold text-[#0B2C5A]">
                {employee.employee_id_number}
              </p>
              <p className="badge-print-date mt-0.5 truncate text-[7px] font-medium leading-tight text-slate-900">
                {printedLabel}
              </p>
            </div>
          </div>
        </div>
      </article>
    </div>
  );
}
