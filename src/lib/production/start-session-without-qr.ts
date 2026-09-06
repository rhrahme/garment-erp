import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { readPayrollEmployees } from "@/lib/data/payroll-employees";
import { readSalesOrders } from "@/lib/data/sales-orders";
import { readSewingSessionsFresh, writeSewingSessions } from "@/lib/data/sewing-sessions";
import { badgeDisplayName } from "@/lib/hr/badge-print";
import {
  findPayrollEmployeeById,
  resolveScanEmployeeContext,
} from "@/lib/hr/payroll-lookup";
import {
  employeeCanSewOnStitchKiosk,
  sortPayrollEmployees,
} from "@/lib/hr/payroll-utils";
import { notifyIntegration } from "@/lib/integrations";
import { isSalesOrderArchived } from "@/lib/sales-orders/archive";
import { matchesNormalizedSearch } from "@/lib/search/normalize";
import { createSewingSessionChangeRequest } from "@/lib/production/sewing-session-change-requests";
import {
  applyStartFromEmployeeArm,
  openSessionsOnKiosk,
} from "@/lib/production/sewing-session-recovery";
import {
  employeeAllowsStackedOpenPieces,
} from "@/lib/production/sewing-session-status-label";
import { readStitchKioskSettingsFresh } from "@/lib/data/stitch-kiosk-settings";
import { expireStaleSewingState, mostRecentArm } from "@/lib/production/sewing-session-state";
import { stampOvertimeIfNeeded } from "@/lib/production/sewing-session-workday-end";
import { resolveScanToLine } from "@/lib/production/stage-scan";
import {
  currentStitchWorkdayStartMs,
  riyadhDateTimeLocalToUtcMs,
} from "@/lib/production/stitch-kiosk-lunch";
import {
  pieceProductionCodeFromSticker,
  pieceScanAttribution,
  supplierFabricProductionCode,
} from "@/lib/sales-orders/label-codes";
import type { PayrollEmployee } from "@/lib/types/hr-payroll";
import type { SalesOrder } from "@/lib/types/sales-orders";
import type { SewingSession, SewingWorkKind } from "@/lib/types/sewing-sessions";

const INACTIVE_SO_STATUSES = new Set(["complete", "cancelled", "delivered"]);

export type StartWithoutQrPieceOption = {
  production_code: string;
  so_number: string;
  client_name: string;
  fabric_number: string;
  garment_type: string;
  piece_mark: string | null;
};

export type StartWithoutQrEmployeeOption = {
  id: string;
  employee_id_number: string;
  full_name: string;
};

/** Active Expats ID-badge holders -- same people who may scan the stitch kiosk. */
export function listStitchEmployeesForManualStart(
  employees: PayrollEmployee[] = readPayrollEmployees().employees
): StartWithoutQrEmployeeOption[] {
  return sortPayrollEmployees(
    employees.filter(
      (employee) => employee.is_active && employeeCanSewOnStitchKiosk(employee)
    )
  ).map((employee) => ({
    id: employee.id,
    employee_id_number: employee.employee_id_number,
    full_name: badgeDisplayName(employee),
  }));
}

export type StartSewingSessionWithoutQrInput = {
  kiosk_id?: string | null;
  workstation_id?: string | null;
  employee_id?: string | null;
  production_code: string;
  started_at?: string | null;
  reason?: string | null;
  requested_by: string;
  work_kind?: SewingWorkKind | null;
  now?: number;
  source?: "erp" | "api";
};

type ResultOk<T> = { ok: true } & T;
type ResultErr = { ok: false; status: number; error: string };

export function validateManualStartAt(
  startedAt: string,
  nowMs: number = Date.now()
): { ok: true; atMs: number } | { ok: false; error: string } {
  const fromLocal = riyadhDateTimeLocalToUtcMs(startedAt);
  const fromIso = Date.parse(startedAt);
  const atMs = fromLocal ?? (Number.isFinite(fromIso) ? fromIso : NaN);
  if (!Number.isFinite(atMs)) {
    return { ok: false, error: "Enter a valid start time." };
  }
  if (atMs > nowMs + 2 * 60_000) {
    return { ok: false, error: "Start time cannot be in the future." };
  }
  const workdayStart = currentStitchWorkdayStartMs(nowMs);
  if (atMs < workdayStart) {
    return { ok: false, error: "Start time must be during today's workday (from 08:00 Riyadh)." };
  }
  return { ok: true, atMs };
}

export function listPiecesForManualStart(
  query: string,
  orders: SalesOrder[] = readSalesOrders().orders
): StartWithoutQrPieceOption[] {
  const matches: StartWithoutQrPieceOption[] = [];
  for (const order of orders) {
    if (INACTIVE_SO_STATUSES.has(order.status) || isSalesOrderArchived(order)) continue;
    order.fabric_lines.forEach((line) => {
      const stickers = line.label_stickers ?? [];
      for (const sticker of stickers) {
        const production_code = pieceProductionCodeFromSticker(
          sticker,
          order.client_code,
          stickers
        );
        const attribution = pieceScanAttribution(sticker, order.client_code, stickers);
        const option: StartWithoutQrPieceOption = {
          production_code,
          so_number: order.so_number,
          client_name: order.client_name,
          fabric_number: line.fabric_number,
          garment_type: line.garment_type,
          piece_mark: attribution.piece_mark,
        };
        if (
          !query.trim() ||
          matchesNormalizedSearch(
            [
              option.production_code,
              option.so_number,
              option.client_name,
              option.fabric_number,
              option.garment_type,
              option.piece_mark,
              sticker.code,
            ],
            query
          )
        ) {
          matches.push(option);
        }
      }
    });
  }
  return matches.slice(0, 40);
}

function nowIso(at: number): string {
  return new Date(at).toISOString();
}

export async function startSewingSessionWithoutQr(
  input: StartSewingSessionWithoutQrInput
): Promise<
  ResultOk<{ session: SewingSession; request_id: string | null }> | ResultErr
> {
  await ensureDocumentsLoaded([
    "payroll_employees",
    "sewing_sessions",
    "sales_orders",
    "sewing_session_change_requests",
    "stitch_kiosk_settings",
  ]);

  const nowMs = input.now ?? Date.now();
  const kioskSettings = await readStitchKioskSettingsFresh();
  if (kioskSettings.paused) {
    return {
      ok: false,
      status: 409,
      error: "Stitch kiosk is paused by admin. Resume before starting.",
    };
  }
  const kioskId = input.kiosk_id?.trim() || "default";
  const productionCode = input.production_code.trim();
  if (!productionCode) {
    return { ok: false, status: 400, error: "Choose the garment / piece that has no printed QR." };
  }

  const startedCheck = validateManualStartAt(input.started_at?.trim() || nowIso(nowMs), nowMs);
  if (!startedCheck.ok) {
    return { ok: false, status: 400, error: startedCheck.error };
  }
  const startedAtMs = startedCheck.atMs;

  let store = expireStaleSewingState(await readSewingSessionsFresh(), nowMs);
  const armed = mostRecentArm(store, kioskId);
  const employeeId = input.employee_id?.trim() || armed?.employee_id || "";
  if (!employeeId) {
    return {
      ok: false,
      status: 400,
      error: "Scan the stitcher badge first, or pick the employee.",
    };
  }

  const employee = findPayrollEmployeeById(employeeId);
  if (!employee || !employee.is_active) {
    return { ok: false, status: 404, error: "Employee not found." };
  }
  if (!employeeCanSewOnStitchKiosk(employee)) {
    return {
      ok: false,
      status: 400,
      error: "Not on the Expats ID list - only expat badge holders can use this kiosk.",
    };
  }

  const ctx = resolveScanEmployeeContext({
    employee_id: employee.id,
    workstation_id: input.workstation_id ?? employee.assigned_workstation_id,
  });

  let lookup;
  try {
    lookup = resolveScanToLine(productionCode);
  } catch (error) {
    return {
      ok: false,
      status: 404,
      error: error instanceof Error ? error.message : "Piece not found.",
    };
  }
  if (!lookup) {
    return { ok: false, status: 404, error: "Piece not found on an open sales order." };
  }

  const stickers = lookup.line.label_stickers ?? [lookup.sticker];
  const resolvedCode = pieceProductionCodeFromSticker(
    lookup.sticker,
    lookup.order.client_code,
    stickers
  );
  const attribution = pieceScanAttribution(lookup.sticker, lookup.order.client_code, stickers);
  const alreadyOpen = store.sessions.some(
    (row) =>
      row.employee_id === employee.id &&
      (row.status === "open" || row.status === "closing") &&
      row.production_code === resolvedCode
  );
  if (alreadyOpen) {
    return {
      ok: false,
      status: 409,
      error: `${badgeDisplayName(employee)} already has this piece open.`,
    };
  }

  const stacked = employeeAllowsStackedOpenPieces(employee.job_functions);
  const openForEmployee = openSessionsOnKiosk(store, kioskId).filter(
    (row) => row.employee_id === employee.id && row.status === "open"
  );
  if (!stacked && openForEmployee.length > 0) {
    return {
      ok: false,
      status: 409,
      error: `${badgeDisplayName(employee)} already has an open piece - close it before starting another.`,
    };
  }

  const workKind: SewingWorkKind =
    input.work_kind === "alteration" || armed?.work_kind === "alteration"
      ? "alteration"
      : "first_make";

  const session = stampOvertimeIfNeeded(
    {
      id: `sew-${startedAtMs}-${Math.random().toString(36).slice(2, 8)}`,
      kiosk_id: kioskId,
      employee_id: ctx.employee_id,
      employee_name: ctx.employee_name,
      employee_short_name: employee.short_name?.trim() || null,
      employee_id_number: ctx.employee_id_number,
      production_code: resolvedCode,
      scan_code: resolvedCode,
      workstation_id: ctx.workstation_id,
      started_at: nowIso(startedAtMs),
      ended_at: null,
      duration_sec: null,
      status: "open",
      closing_armed_at: null,
      closing_confirm: null,
      work_order_id: null,
      so_number: lookup.order.so_number,
      piece_mark: attribution.piece_mark,
      fabric_cut_code: supplierFabricProductionCode(lookup.sticker.code, lookup.order.client_code),
      client_name: lookup.order.client_name,
      garment_type: lookup.line.garment_type,
      fabric_number: lookup.line.fabric_number,
      supplier_id: lookup.line.supplier_id,
      work_kind: workKind,
      activity_job_function: armed?.activity_job_function ?? null,
      started_without_qr: true,
    },
    startedAtMs
  );

  const matchingArm = store.kiosk_arms.find(
    (row) => row.kiosk_id === kioskId && row.employee_id === employee.id
  );
  if (matchingArm) {
    store = applyStartFromEmployeeArm(store, kioskId, matchingArm, session);
  } else {
    store = { ...store, sessions: [session, ...store.sessions] };
  }
  await writeSewingSessions(store);

  const source = input.source ?? "erp";
  try {
    await notifyIntegration(
      "production.sewing_session_started",
      {
        session_id: session.id,
        kiosk_id: session.kiosk_id,
        employee_id: session.employee_id,
        employee_name: session.employee_name,
        production_code: session.production_code,
        scan_code: session.scan_code,
        workstation_id: session.workstation_id,
        started_at: session.started_at,
        so_number: session.so_number,
        piece_mark: session.piece_mark,
        client_name: session.client_name,
        work_kind: session.work_kind ?? "first_make",
        started_without_qr: true,
      },
      source
    );
  } catch (error) {
    console.error("Failed to notify sewing_session_started (no QR):", session.id, error);
  }

  const reason =
    input.reason?.trim() ||
    `QR was not printed. Started ${session.started_at}. Session is already running.`;

  let requestId: string | null = null;
  try {
    const request = await createSewingSessionChangeRequest(
      {
        action: "started_without_qr",
        session_id: session.id,
        reason,
        requested_by: input.requested_by.trim() || `${session.employee_name} (kiosk)`,
      },
      source
    );
    requestId = request.ok ? request.request.id : null;
    if (!request.ok) {
      console.error(
        "started_without_qr request failed after session start:",
        session.id,
        request.error
      );
    }
  } catch (error) {
    console.error("started_without_qr request failed after session start:", session.id, error);
  }

  return {
    ok: true,
    session,
    request_id: requestId,
  };
}
