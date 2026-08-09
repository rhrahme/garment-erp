import {
  BADGE_QR_ALT_LABEL,
  BADGE_QR_BUTTONS_LABEL,
  BADGE_QR_DISPLAY_MM,
  BADGE_QR_FETCH_PX,
  BADGE_QR_GAP_MM,
  BADGE_QR_IRON_LABEL,
  BADGE_QR_PAIR_WIDTH_MM,
  BADGE_QR_SEW_LABEL,
  badgeDisplayName,
  badgeJobFunctionsLine,
  badgePrintDateLabel,
  badgeQrPairKind,
} from "@/lib/hr/badge-print";
import {
  employeeAlterationQrPayload,
  employeeButtonsQrPayload,
  employeeIroningQrPayload,
  employeeQrPayload,
} from "@/lib/hr/employee-qr";
import type { IdBadgeGroup } from "@/lib/hr/payroll-utils";
import { qrImageUrl } from "@/lib/production/qr-labels";
import type { PayrollEmployee } from "@/lib/types/hr-payroll";

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
  const pairKind = badgeQrPairKind(employee);
  const leftPayload =
    pairKind === "iron_buttons"
      ? employeeIroningQrPayload(employee)
      : employeeQrPayload(employee);
  const rightPayload =
    pairKind === "iron_buttons"
      ? employeeButtonsQrPayload(employee)
      : employeeAlterationQrPayload(employee);
  const leftLabel = pairKind === "iron_buttons" ? BADGE_QR_IRON_LABEL : BADGE_QR_SEW_LABEL;
  const rightLabel = pairKind === "iron_buttons" ? BADGE_QR_BUTTONS_LABEL : BADGE_QR_ALT_LABEL;
  const qrSrc = qrImageUrl(leftPayload, BADGE_QR_FETCH_PX);
  const altQrSrc = qrImageUrl(rightPayload, BADGE_QR_FETCH_PX);
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

        <div className="flex min-h-0 flex-1 flex-col px-2 py-1">
          <div className="min-w-0 shrink-0 text-left">
            {label ? (
              <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#0B2C5A]">
                {label}
              </p>
            ) : null}
            <h2
              className={`${
                jobsLine ? "line-clamp-1" : "line-clamp-2"
              } text-[12px] font-semibold leading-snug text-slate-900 ${label ? "mt-0.5" : ""}`}
            >
              {displayName}
            </h2>
            {jobsLine ? (
              <p className="badge-job-functions mt-0.5 line-clamp-1 text-[10px] font-semibold leading-snug text-slate-700">
                {jobsLine}
              </p>
            ) : null}
          </div>

          {/* Fixed 3cm clear gap between QR edges; pair centered. Labels are full words. */}
          <div className="flex min-h-0 flex-1 items-center justify-center">
            <div
              className="badge-qr-pair flex shrink-0 items-start"
              style={{ width: `${BADGE_QR_PAIR_WIDTH_MM}mm` }}
            >
              <div
                className="flex shrink-0 flex-col items-center"
                style={{ width: `${BADGE_QR_DISPLAY_MM}mm` }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrSrc}
                  alt=""
                  width={BADGE_QR_FETCH_PX}
                  height={BADGE_QR_FETCH_PX}
                  className="badge-qr-img shrink-0 rounded-sm border border-slate-200 bg-white"
                  style={{
                    width: `${BADGE_QR_DISPLAY_MM}mm`,
                    height: `${BADGE_QR_DISPLAY_MM}mm`,
                  }}
                />
                <p className="badge-qr-label mt-0.5 whitespace-nowrap text-center text-[6.5px] font-bold uppercase leading-none tracking-wide text-slate-700">
                  {leftLabel}
                </p>
              </div>
              <div
                className="badge-qr-gap shrink-0"
                style={{ width: `${BADGE_QR_GAP_MM}mm` }}
                aria-hidden
              />
              <div
                className="flex shrink-0 flex-col items-center"
                style={{ width: `${BADGE_QR_DISPLAY_MM}mm` }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={altQrSrc}
                  alt=""
                  width={BADGE_QR_FETCH_PX}
                  height={BADGE_QR_FETCH_PX}
                  className="badge-qr-img shrink-0 rounded-sm border-2 border-amber-600 bg-white"
                  style={{
                    width: `${BADGE_QR_DISPLAY_MM}mm`,
                    height: `${BADGE_QR_DISPLAY_MM}mm`,
                  }}
                />
                <p className="badge-qr-label badge-qr-label-alt mt-0.5 whitespace-nowrap text-center text-[6.5px] font-bold uppercase leading-none tracking-wide text-amber-800">
                  {rightLabel}
                </p>
              </div>
            </div>
          </div>

          <div className="badge-card-footer min-w-0 shrink-0 text-left">
            <p className="text-[7px] uppercase tracking-wide text-slate-500">Employee ID</p>
            <p className="truncate font-mono text-[11px] font-semibold text-[#0B2C5A]">
              {employee.employee_id_number}
            </p>
            <p className="badge-print-date mt-0.5 truncate text-[7px] font-medium leading-tight text-slate-900">
              {printedLabel}
            </p>
          </div>
        </div>
      </article>
    </div>
  );
}
