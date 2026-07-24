import { employeeQrPayload } from "@/lib/hr/employee-qr";
import type { IdBadgeGroup } from "@/lib/hr/payroll-utils";
import { qrImageUrl } from "@/lib/production/qr-labels";
import type { PayrollEmployee } from "@/lib/types/hr-payroll";

const QR_SIZE = 96;

const GROUP_LABEL: Record<IdBadgeGroup, string> = {
  saudi: "Saudi",
  expat: "Expat",
};

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

      <article className="badge-card flex h-full w-full overflow-hidden rounded-lg border border-slate-800 bg-white shadow-sm print:rounded-none">
        <div className="flex w-[38%] flex-col items-center justify-center border-r border-slate-200 bg-slate-50 px-2 py-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrSrc}
            alt=""
            width={QR_SIZE}
            height={QR_SIZE}
            className="h-[22mm] w-[22mm] rounded-sm border border-slate-200 bg-white"
          />
          <p className="mt-1 max-w-full truncate font-mono text-[7px] leading-tight text-slate-500">
            {payload}
          </p>
        </div>
        <div className="flex flex-1 flex-col justify-between px-3 py-2.5 text-left">
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
              {GROUP_LABEL[group]} ID badge
            </p>
            <h2 className="mt-1 text-[13px] font-semibold leading-snug text-slate-900">
              {employee.full_name}
            </h2>
          </div>
          <div>
            <p className="text-[8px] uppercase tracking-wide text-slate-500">Employee ID</p>
            <p className="font-mono text-[12px] font-semibold text-slate-800">
              {employee.employee_id_number}
            </p>
          </div>
        </div>
      </article>
    </div>
  );
}
