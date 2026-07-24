import { employeeQrPayload } from "@/lib/hr/employee-qr";
import type { IdBadgeGroup } from "@/lib/hr/payroll-utils";
import { qrImageUrl } from "@/lib/production/qr-labels";
import type { PayrollEmployee } from "@/lib/types/hr-payroll";

/** Pixel size for QR image generation (display size is mm below). */
const QR_SIZE = 144;

const GROUP_LABEL: Record<IdBadgeGroup, string> = {
  saudi: "Saudi",
  expat: "EIB",
};

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
  const qrSrc = qrImageUrl(payload, QR_SIZE);

  return (
    <div className="badge-print-slot relative">
      <CropMarks />

      <article className="badge-card flex h-full w-full flex-col overflow-hidden rounded-lg border border-slate-800 bg-white shadow-sm print:rounded-none">
        {/* Full-width company band — reserved height, never clipped by QR/body.
            Use <div> (not <header>): print CSS hides bare header/nav/aside chrome. */}
        <div className="badge-company-band flex h-[7mm] shrink-0 items-center justify-center border-b-2 border-slate-900 bg-slate-100 px-1.5">
          <p className="badge-company-name whitespace-nowrap text-center text-[9px] font-bold uppercase leading-none tracking-[0.1em] text-slate-900">
            {COMPANY_NAME}
          </p>
        </div>

        <div className="flex min-h-0 flex-1">
          <div className="flex w-[44%] flex-col items-center justify-center border-r border-slate-200 bg-slate-50 px-1.5 py-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrSrc}
              alt=""
              width={QR_SIZE}
              height={QR_SIZE}
              className="h-[30mm] w-[30mm] shrink-0 rounded-sm border border-slate-200 bg-white"
            />
            <p className="mt-0.5 max-w-full truncate font-mono text-[6px] leading-tight text-slate-500">
              {payload}
            </p>
          </div>
          <div className="flex min-w-0 flex-1 flex-col justify-between px-2.5 py-1.5 text-left">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
                {GROUP_LABEL[group]}
              </p>
              <h2 className="mt-0.5 line-clamp-3 text-[12px] font-semibold leading-snug text-slate-900">
                {employee.full_name}
              </h2>
            </div>
            <div className="min-w-0 shrink-0">
              <p className="text-[7px] uppercase tracking-wide text-slate-500">Employee ID</p>
              <p className="truncate font-mono text-[11px] font-semibold text-slate-800">
                {employee.employee_id_number}
              </p>
            </div>
          </div>
        </div>
      </article>
    </div>
  );
}
