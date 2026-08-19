import { readClients } from "@/lib/data/clients";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { readSewingSessionsFresh, writeSewingSessions } from "@/lib/data/sewing-sessions";
import {
  employeeAllowsBadgeActivity,
  isAnyEmployeeBadgeQrPayload,
  parseEmployeeBadgeScan,
  type EmployeeBadgeActivityJobFunction,
} from "@/lib/hr/employee-qr";
import { normalizeJobFunctions } from "@/lib/hr/job-functions";
import { safeRecordPatternAlterationPendingFromSession } from "@/lib/production/record-pattern-alteration-pending";
import {
  consumePendingStopRequestForSession,
  ensureOvertimeConfirmRequest,
} from "@/lib/production/sewing-session-change-requests";
import { stampOvertimeIfNeeded } from "@/lib/production/sewing-session-workday-end";
import {
  capSessionCloseAtWorkdayEnd,
  isStitchOvertimeWindow,
} from "@/lib/production/stitch-kiosk-lunch";
import {
  findPayrollEmployeeByBadgeValue,
  findPayrollEmployeeById,
  resolveScanEmployeeContext,
} from "@/lib/hr/payroll-lookup";
import {
  ensureStitchKioskLunchGate,
  readStitchKioskSettingsFresh,
  STITCH_KIOSK_LUNCH_AUTO_PAUSE_ACTOR,
  STITCH_KIOSK_LUNCH_AUTO_RESUME_ACTOR,
} from "@/lib/data/stitch-kiosk-settings";
import { notifyIntegration } from "@/lib/integrations";
import { employeeCanSewOnStitchKiosk } from "@/lib/hr/payroll-utils";
import { notifyAdminsOfSewingSessionStarted } from "@/lib/integrations/sewing-session-started-alert";
import { executeStageScan } from "@/lib/production/execute-stage-scan";
import { recordSewingScanFailure } from "@/lib/production/record-sewing-scan-failure";
import type { BuildSewingScanFailureInput } from "@/lib/production/sewing-scan-failure-build";
import { normalizeScannerInput } from "@/lib/production/scan-input";
import {
  explainUnrecognizedStitchScan,
  fabricCutWashRejectMessage,
  isFabricCutOnlyStitchScan,
} from "@/lib/production/sewing-scan-code-explain";
import {
  applyBadgeFirstClosing,
  applyCloseSession,
  applyEmployeeArm,
  applyPieceArm,
  applyStartFromEmployeeArm,
  applyStartFromPieceArm,
  badgeDecisionRequiresSewCapability,
  decideBadgeScan,
  decidePieceStart,
  openSessionsOnKiosk,
  resolveSharedPieceScan,
} from "@/lib/production/sewing-session-recovery";
import {
  enrichSewingSessionsGarmentFields,
} from "@/lib/production/sewing-session-garment";
import {
  employeeArmsOnKiosk,
  expireStaleSewingState,
  mostRecentArm,
  pieceArmsOnKiosk,
  resolveUniqueEmployeeArm,
  sessionPhase,
  sewingSessionElapsedSecExcludingPauses,
  sewingSessionsDashboard as sewingSessionsDashboardBase,
} from "@/lib/production/sewing-session-state";
import type { SewingSessionsDashboardOptions } from "@/lib/production/sewing-session-state";
import {
  applyShortNamesToEmployeeAggregates,
  attachSewingSessionClientShortNames,
  attachSewingSessionJobFunctions,
  employeeAllowsStackedOpenPieces,
  floorActivitySessionStartedMessage,
  sewingSessionEmployeeDisplayName,
  stackedOpenFollowupMessage,
} from "@/lib/production/sewing-session-status-label";
import { resolveScanToLine } from "@/lib/production/stage-scan";
import {
  pieceProductionCodeFromSticker,
  pieceScanAttribution,
  supplierFabricProductionCode,
} from "@/lib/sales-orders/label-codes";
import type { SewingScanFailureReasonCode, SewingScanKind } from "@/lib/types/sewing-scan-failures";
import type {
  SewingKioskArm,
  SewingKioskPieceArm,
  SewingKioskScanResult,
  SewingSession,
  SewingSessionsFile,
  SewingWorkKind,
} from "@/lib/types/sewing-sessions";

export {
  expireStaleSewingState,
  normalizeSewingSessionsFile,
  parseSewingDashboardPeriod,
  mostRecentArm,
  resolveUniqueEmployeeArm,
  resolveUniquePieceArm,
  SEWING_ARM_TIMEOUT_MS,
  SEWING_CLOSING_TIMEOUT_MS,
  sewingFailedScansForPeriod,
  sewingPeriodWindow,
  listSewingKioskEmployees as listSewingKioskEmployeesBase,
  sewingEmployeeWorkLookup as sewingEmployeeWorkLookupBase,
} from "@/lib/production/sewing-session-state";
export type {
  SewingDashboardPeriod,
  SewingEmployeeAggregate,
  SewingEmployeeWorkPeriod,
  SewingEmployeeWorkSummary,
  SewingKioskEmployeeOption,
  SewingPeriodWindow,
  SewingSessionsDashboardOptions,
} from "@/lib/production/sewing-session-state";
export { sewingSessionArticleLabel } from "@/lib/production/sewing-session-article-label";
export {
  enrichSewingSessionGarmentFields,
  enrichSewingSessionsGarmentFields,
} from "@/lib/production/sewing-session-garment";
export {
  applyShortNamesToEmployeeAggregates,
  attachSewingSessionClientShortNames,
  attachSewingSessionJobFunctions,
  floorActivityInProgressLabel,
  floorActivityLabelFromJobFunctions,
  floorActivityNowLabel,
  floorActivitySessionStartedMessage,
  sewingSessionClientDisplayName,
  sewingSessionEmployeeDisplayName,
  sewingSessionScanQrLabel,
  sewingSessionStatusLabel,
} from "@/lib/production/sewing-session-status-label";

function payrollLookupForSessionUi(employeeId: string) {
  const employee = findPayrollEmployeeById(employeeId);
  if (!employee) return null;
  return {
    job_functions: employee.job_functions,
    short_name: employee.short_name,
  };
}

/** Join payroll job_functions + short_name (+ client short names) for floor / kiosk UI. */
function enrichSessionsForFloorUi(sessions: SewingSession[]): SewingSession[] {
  const withJobs = attachSewingSessionJobFunctions(sessions, payrollLookupForSessionUi);
  return attachSewingSessionClientShortNames(withJobs, readClients().clients);
}

/**
 * Dashboard payload with null garment_type backfilled from live SO sticker lookup.
 * Enrich before aggregation so Performance employee rows include article labels.
 * Also joins payroll job_functions + short_name and client short names for floor UI.
 */
export function sewingSessionsDashboard(
  store: SewingSessionsFile,
  at = Date.now(),
  options: SewingSessionsDashboardOptions = {}
) {
  const enrichedStore: SewingSessionsFile = {
    ...store,
    sessions: enrichSewingSessionsGarmentFields(store.sessions ?? []),
  };
  const dash = sewingSessionsDashboardBase(enrichedStore, at, options);
  const withJobsOpen = enrichSessionsForFloorUi(dash.open_sessions);
  const withJobsSessions = enrichSessionsForFloorUi(dash.sessions);
  return {
    ...dash,
    open_sessions: withJobsOpen,
    sessions: withJobsSessions,
    completed_by_employee: applyShortNamesToEmployeeAggregates(
      dash.completed_by_employee,
      payrollLookupForSessionUi
    ),
    today_by_employee: applyShortNamesToEmployeeAggregates(
      dash.today_by_employee,
      payrollLookupForSessionUi
    ),
  };
}

function enrichEmployeeWorkPeriod(period: {
  sessions: SewingSession[];
  open_sessions: SewingSession[];
}) {
  return {
    ...period,
    sessions: enrichSessionsForFloorUi(period.sessions),
    open_sessions: enrichSessionsForFloorUi(period.open_sessions),
  };
}

export function listSewingKioskEmployees(store: SewingSessionsFile) {
  return listSewingKioskEmployeesBase({
    ...store,
    sessions: enrichSessionsForFloorUi(store.sessions ?? []),
  });
}

export function sewingEmployeeWorkLookup(
  store: SewingSessionsFile,
  employeeKey: string,
  at = Date.now()
) {
  const enrichedStore: SewingSessionsFile = {
    ...store,
    sessions: enrichSewingSessionsGarmentFields(store.sessions ?? []),
  };
  const raw = sewingEmployeeWorkLookupBase(enrichedStore, employeeKey, at);
  if (!raw) return null;
  const [named] = applyShortNamesToEmployeeAggregates(
    [
      {
        employee_id: raw.employee_id,
        employee_name: raw.employee_name,
        count: 0,
        duration_sec: 0,
        avg_duration_sec: 0,
        articles: [],
      },
    ],
    payrollLookupForSessionUi
  );
  return {
    ...raw,
    employee_name: named?.employee_name ?? raw.employee_name,
    day: enrichEmployeeWorkPeriod(raw.day),
    week: enrichEmployeeWorkPeriod(raw.week),
    month: enrichEmployeeWorkPeriod(raw.month),
  };
}

function nowIso(at = Date.now()): string {
  return new Date(at).toISOString();
}

function openOnKiosk(store: SewingSessionsFile, kioskId: string): SewingSession[] {
  return store.sessions.filter(
    (row) => row.kiosk_id === kioskId && (row.status === "open" || row.status === "closing")
  );
}

function result(
  ok: boolean,
  message: string,
  store: SewingSessionsFile,
  kioskId: string,
  focus: {
    arm?: SewingKioskArm | null;
    piece_arm?: SewingKioskPieceArm | null;
    session?: SewingSession | null;
  },
  extras?: Partial<SewingKioskScanResult>
): SewingKioskScanResult {
  const open = enrichSessionsForFloorUi(
    enrichSewingSessionsGarmentFields(openOnKiosk(store, kioskId))
  );
  const arm =
    focus.arm !== undefined
      ? focus.arm
      : employeeArmsOnKiosk(store, kioskId).sort((a, b) =>
          b.armed_at.localeCompare(a.armed_at)
        )[0] ?? null;
  const pieceArm =
    focus.piece_arm !== undefined
      ? focus.piece_arm
      : pieceArmsOnKiosk(store, kioskId).sort((a, b) =>
          b.armed_at.localeCompare(a.armed_at)
        )[0] ?? null;
  const focusSession = focus.session
    ? enrichSessionsForFloorUi(enrichSewingSessionsGarmentFields([focus.session]))[0]!
    : null;
  const session = focusSession ?? open[0] ?? null;
  // Prefer enriched session from open_sessions / focus (extras.session may be bare).
  const { session: _ignoreExtraSession, open_sessions: _ignoreExtraOpen, ...restExtras } =
    extras ?? {};
  return {
    ok,
    message,
    phase: sessionPhase(session, arm, pieceArm),
    beep: ok ? (restExtras.beep ?? "ok") : "error",
    arm,
    piece_arm: pieceArm,
    session,
    open_sessions: open,
    ...restExtras,
    // Successful path already wrote sewing_sessions before returning.
    durable: restExtras.durable ?? (ok ? true : undefined),
  };
}

async function failResult(
  message: string,
  reasonCode: SewingScanFailureReasonCode,
  scanKind: SewingScanKind,
  store: SewingSessionsFile,
  kioskId: string,
  focus: {
    arm?: SewingKioskArm | null;
    piece_arm?: SewingKioskPieceArm | null;
    session?: SewingSession | null;
  },
  meta: {
    raw: string;
    workstation_id?: string | null;
    source?: "erp" | "zapier" | "api";
    now?: number;
    employee_id?: string | null;
    employee_name?: string | null;
    employee_id_number?: string | null;
    related_production_code?: string | null;
    related_session_id?: string | null;
  }
): Promise<SewingKioskScanResult> {
  const scanResult = result(false, message, store, kioskId, focus);
  const arm = scanResult.arm;
  const session = focus.session ?? scanResult.session;
  const payload: BuildSewingScanFailureInput = {
    raw_code: meta.raw,
    reason: message,
    reason_code: reasonCode,
    scan_kind: scanKind,
    kiosk_id: kioskId,
    workstation_id: meta.workstation_id ?? arm?.workstation_id ?? null,
    employee_id: meta.employee_id ?? arm?.employee_id ?? null,
    employee_name: meta.employee_name ?? arm?.employee_name ?? null,
    employee_id_number: meta.employee_id_number ?? arm?.employee_id_number ?? null,
    related_production_code:
      meta.related_production_code ?? session?.production_code ?? null,
    related_session_id: meta.related_session_id ?? session?.id ?? null,
    arm_employee_id: arm?.employee_id ?? null,
    arm_employee_name: arm?.employee_name ?? null,
    phase: scanResult.phase,
    source: meta.source ?? "erp",
    now: meta.now,
  };
  let failureRecorded = false;
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await recordSewingScanFailure(payload);
      failureRecorded = true;
      break;
    } catch (error) {
      lastError = error;
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 40 * (attempt + 1)));
      }
    }
  }
  if (!failureRecorded) {
    console.error(
      "[sewing_scan_failures] Failed to persist reject after retries:",
      lastError instanceof Error ? lastError.message : lastError
    );
  }
  return {
    ...scanResult,
    failure_recorded: failureRecorded,
    durable: failureRecorded,
  };
}

function lookupPieceMeta(scanCode: string): {
  production_code: string;
  so_number: string | null;
  piece_mark: string | null;
  fabric_cut_code: string | null;
  client_name: string | null;
  garment_type: string | null;
  fabric_number: string | null;
  supplier_id: string | null;
  work_order_id: null;
} {
  const lookup = resolveScanToLine(scanCode);
  if (!lookup) {
    throw new Error(explainUnrecognizedStitchScan(scanCode));
  }
  const siblings = lookup.line.label_stickers ?? [lookup.sticker];
  const fabric_cut_code = supplierFabricProductionCode(
    lookup.sticker.code,
    lookup.order.client_code
  );
  if (
    isFabricCutOnlyStitchScan(scanCode, {
      fabric_cut_code,
      client_code: lookup.order.client_code,
      stickers: siblings,
    })
  ) {
    throw new Error(fabricCutWashRejectMessage(scanCode, fabric_cut_code));
  }
  const production_code = pieceProductionCodeFromSticker(
    lookup.sticker,
    lookup.order.client_code,
    siblings
  );
  const attribution = pieceScanAttribution(lookup.sticker, lookup.order.client_code, siblings);
  const lineType = lookup.line.garment_type?.trim() || null;
  return {
    production_code,
    so_number: lookup.order.so_number,
    piece_mark: attribution.piece_mark,
    fabric_cut_code,
    client_name: lookup.order.client_name?.trim() || null,
    // Persist SO line garment type; fall back to sticker piece name when line type is blank.
    garment_type: lineType || attribution.piece_name?.trim() || null,
    fabric_number: lookup.line.fabric_number?.trim() || null,
    supplier_id: lookup.line.supplier_id?.trim() || null,
    work_order_id: null,
  };
}

function buildSessionFromArmAndMeta(
  arm: SewingKioskArm,
  meta: ReturnType<typeof lookupPieceMeta>,
  raw: string,
  kioskId: string,
  at: number
): SewingSession {
  return stampOvertimeIfNeeded(
    {
      id: `sew-${at}-${Math.random().toString(36).slice(2, 8)}`,
      kiosk_id: kioskId,
      employee_id: arm.employee_id,
      employee_name: arm.employee_name,
      employee_id_number: arm.employee_id_number,
      production_code: meta.production_code,
      scan_code: raw.trim().toUpperCase(),
      workstation_id: arm.workstation_id,
      started_at: nowIso(at),
      ended_at: null,
      duration_sec: null,
      status: "open",
      closing_armed_at: null,
      closing_confirm: null,
      work_order_id: meta.work_order_id,
      so_number: meta.so_number,
      piece_mark: meta.piece_mark,
      fabric_cut_code: meta.fabric_cut_code,
      client_name: meta.client_name,
      garment_type: meta.garment_type,
      fabric_number: meta.fabric_number,
      supplier_id: meta.supplier_id,
      work_kind: arm.work_kind === "alteration" ? "alteration" : "first_make",
      activity_job_function: arm.activity_job_function ?? null,
    },
    at
  );
}

function buildSessionFromPieceArm(
  pieceArm: SewingKioskPieceArm,
  employee: {
    employee_id: string;
    employee_name: string;
    employee_id_number: string;
    workstation_id: string | null;
  },
  kioskId: string,
  at: number,
  workKind: SewingWorkKind = "first_make",
  activityJobFunction: EmployeeBadgeActivityJobFunction | null = null
): SewingSession {
  return stampOvertimeIfNeeded(
    {
      id: `sew-${at}-${Math.random().toString(36).slice(2, 8)}`,
      kiosk_id: kioskId,
      employee_id: employee.employee_id,
      employee_name: employee.employee_name,
      employee_id_number: employee.employee_id_number,
      production_code: pieceArm.production_code,
      scan_code: pieceArm.scan_code,
      workstation_id: employee.workstation_id,
      started_at: nowIso(at),
      ended_at: null,
      duration_sec: null,
      status: "open",
      closing_armed_at: null,
      closing_confirm: null,
      work_order_id: pieceArm.work_order_id,
      so_number: pieceArm.so_number,
      piece_mark: pieceArm.piece_mark,
      fabric_cut_code: pieceArm.fabric_cut_code,
      client_name: pieceArm.client_name,
      garment_type: pieceArm.garment_type,
      fabric_number: pieceArm.fabric_number,
      supplier_id: pieceArm.supplier_id,
      work_kind: workKind,
      activity_job_function: activityJobFunction,
    },
    at
  );
}

async function closeSessionWithBadgeOrPiece(input: {
  store: SewingSessionsFile;
  session: SewingSession;
  kioskId: string;
  at: number;
  employee_id: string;
  employee_name: string;
  employee_id_number: string;
  workstation_id: string | null;
  source?: "erp" | "zapier" | "api";
}): Promise<SewingKioskScanResult> {
  const {
    session: closingForEmployee,
    kioskId,
    at,
    employee_id,
    employee_name,
    employee_id_number,
    workstation_id,
    source,
  } = input;
  let store = input.store;

  // A pending admin "stop" request means the floor already asked to stop this
  // session earlier - closing at the kiosk now must not inflate elapsed time,
  // so honor the requested stop time and auto-resolve the stale request.
  let closeAt = at;
  try {
    const pendingStop = await consumePendingStopRequestForSession(
      closingForEmployee.id,
      `${employee_name} (kiosk scan)`
    );
    const requestedMs = Date.parse(pendingStop?.requested_at ?? "");
    const startedMs = Date.parse(closingForEmployee.started_at);
    if (
      Number.isFinite(requestedMs) &&
      Number.isFinite(startedMs) &&
      requestedMs >= startedMs &&
      requestedMs <= at
    ) {
      closeAt = requestedMs;
    }
  } catch (error) {
    console.error("Failed to check pending stop request:", closingForEmployee.id, error);
  }

  // Forgotten overnight sessions cap at 22:00. Overtime closes keep the real
  // scan time so the logged hours match what the floor did.
  if (!isStitchOvertimeWindow(closeAt) && closingForEmployee.overtime_status !== "pending") {
    closeAt = capSessionCloseAtWorkdayEnd(Date.parse(closingForEmployee.started_at), closeAt);
  }

  const endedAt = nowIso(closeAt);
  const kioskSettingsForDuration = await readStitchKioskSettingsFresh();
  const durationSec = sewingSessionElapsedSecExcludingPauses(
    closingForEmployee.started_at,
    closeAt,
    kioskSettingsForDuration.pause_intervals ?? []
  );
  let stageAdvanced = false;
  let stageMessage = "";

  try {
    const stage = await executeStageScan({
      code: closingForEmployee.scan_code,
      station: "sewing",
      context: "production",
      employee_id,
      workstation_id,
      require_employee: true,
      source: source ?? "erp",
    });
    stageAdvanced = true;
    stageMessage = stage.message;
    closingForEmployee.work_order_id = stage.work_order?.id ?? closingForEmployee.work_order_id;
    closingForEmployee.fabric_cut_code =
      stage.fabric_cut_code ?? closingForEmployee.fabric_cut_code;
    closingForEmployee.so_number = stage.so_number ?? closingForEmployee.so_number;
    closingForEmployee.piece_mark = stage.piece_mark ?? closingForEmployee.piece_mark;
  } catch (error) {
    stageMessage = error instanceof Error ? error.message : "Sewing stage scan failed.";
  }

  const closed: SewingSession = stampOvertimeIfNeeded(
    {
      ...closingForEmployee,
      status: "closed",
      ended_at: endedAt,
      duration_sec: durationSec,
      closing_armed_at: null,
      closing_confirm: null,
      workstation_id: workstation_id ?? closingForEmployee.workstation_id,
      employee_id,
      employee_name,
      employee_id_number,
    },
    closeAt
  );

  store = applyCloseSession(store, closingForEmployee, closed);
  await writeSewingSessions(store);
  if (closed.overtime_status === "pending") {
    try {
      await ensureOvertimeConfirmRequest(closed, `${closed.employee_name} (kiosk overtime)`);
    } catch (error) {
      console.error("Failed to queue overtime confirm:", closed.id, error);
    }
  }

  try {
    await notifyIntegration(
      "production.sewing_session_ended",
      {
        session_id: closed.id,
        kiosk_id: closed.kiosk_id,
        employee_id: closed.employee_id,
        employee_name: closed.employee_name,
        production_code: closed.production_code,
        scan_code: closed.scan_code,
        workstation_id: closed.workstation_id,
        started_at: closed.started_at,
        ended_at: closed.ended_at,
        duration_sec: closed.duration_sec,
        so_number: closed.so_number,
        piece_mark: closed.piece_mark,
        work_order_id: closed.work_order_id,
        work_kind: closed.work_kind ?? "first_make",
        stage_advanced: stageAdvanced,
        stage_message: stageMessage,
      },
      source ?? "erp"
    );
  } catch (error) {
    console.error("Failed to notify sewing_session_ended:", closed.id, error);
  }

  const mins = Math.floor(durationSec / 60);
  const secs = durationSec % 60;
  const timeLabel = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  return result(
    true,
    stageAdvanced
      ? `Done - ${closed.employee_name} / ${closed.production_code} in ${timeLabel}. ${stageMessage}`
      : `Session closed (${timeLabel}). Stage note: ${stageMessage}`,
    store,
    kioskId,
    { session: closed },
    { beep: "ok", duration_sec: durationSec, stage_advanced: stageAdvanced, session: closed }
  );
}

export type ProcessSewingKioskScanInput = {
  raw: string;
  kiosk_id: string;
  workstation_id?: string | null;
  source?: "erp" | "zapier" | "api";
  now?: number;
};

/**
 * Multi-stitcher kiosk scan: many employees can be armed / sewing on one laptop.
 * Sessions are keyed by employee + piece; ending still advances sewing stage.
 *
 * Shared kiosk: next A4 start goes to the most recently badge-armed employee
 * (original mostRecentArm queue). Matching open/closing A4 scans close first.
 */
export async function processSewingKioskScan(
  input: ProcessSewingKioskScanInput
): Promise<SewingKioskScanResult> {
  await ensureDocumentsLoaded([
    "payroll_employees",
    "sewing_sessions",
    "sewing_scan_failures",
    "sales_orders",
    "production_work_orders",
    "stitch_kiosk_settings",
  ]);

  const at = input.now ?? Date.now();
  const kioskId = input.kiosk_id.trim() || "default";
  const failMeta = {
    raw: normalizeScannerInput(input.raw) || String(input.raw ?? "").trim(),
    workstation_id: input.workstation_id,
    source: input.source,
    now: at,
  };

  // Lunch 14:00-16:00 Asia/Riyadh: close the scan gate, then reopen at 16:00.
  const lunchGate = await ensureStitchKioskLunchGate({ nowMs: at });
  if (lunchGate.paused) {
    void notifyIntegration("production.stitch_kiosk_pause_updated", {
      paused: lunchGate.settings.paused,
      paused_at: lunchGate.settings.paused_at,
      paused_by: lunchGate.settings.paused_by,
      resumed_at: lunchGate.settings.resumed_at,
      resumed_by: lunchGate.settings.resumed_by,
      auto_resume_at: lunchGate.settings.auto_resume_at ?? null,
      updated_at: lunchGate.settings.updated_at,
      updated_by: STITCH_KIOSK_LUNCH_AUTO_PAUSE_ACTOR,
      reason: "lunch_auto_pause",
    });
  }
  if (lunchGate.resumed) {
    void notifyIntegration("production.stitch_kiosk_pause_updated", {
      paused: lunchGate.settings.paused,
      paused_at: lunchGate.settings.paused_at,
      paused_by: lunchGate.settings.paused_by,
      resumed_at: lunchGate.settings.resumed_at,
      resumed_by: lunchGate.settings.resumed_by,
      auto_resume_at: lunchGate.settings.auto_resume_at ?? null,
      updated_at: lunchGate.settings.updated_at,
      updated_by: STITCH_KIOSK_LUNCH_AUTO_RESUME_ACTOR,
      reason: "lunch_auto_resume",
    });
  }

  // Admin pause: block all badge/A4 work without spamming sewing_scan_failures.
  const kioskSettings = await readStitchKioskSettingsFresh();
  if (kioskSettings.paused) {
    const store = expireStaleSewingState(await readSewingSessionsFresh(), at);
    return result(
      false,
      "Stitch kiosk is paused by admin. Scans are blocked until resume.",
      store,
      kioskId,
      {},
      {
        reason_code: "kiosk_paused",
        kiosk_paused: true,
        kiosk_paused_at: kioskSettings.paused_at,
        failure_recorded: false,
        // Dequeue so the USB queue does not retry-spam while paused.
        durable: true,
        beep: "error",
      }
    );
  }

  const raw = normalizeScannerInput(input.raw);
  if (!raw) {
    const store = expireStaleSewingState(await readSewingSessionsFresh(), at);
    return failResult("Empty scan.", "empty_scan", "unknown", store, kioskId, {}, failMeta);
  }

  let store = expireStaleSewingState(await readSewingSessionsFresh(), at);
  failMeta.raw = raw;

  if (isAnyEmployeeBadgeQrPayload(raw)) {
    const badgeScan = parseEmployeeBadgeScan(raw);
    if (!badgeScan) {
      return failResult(
        "Invalid employee badge.",
        "invalid_badge",
        "badge",
        store,
        kioskId,
        {},
        failMeta
      );
    }
    const workKind = badgeScan.work_kind;
    const activityJobFunction = badgeScan.activity_job_function ?? null;
    const employee = findPayrollEmployeeByBadgeValue(raw);
    if (!employee) {
      return failResult(
        "Employee not found - scan your badge again.",
        "employee_not_found",
        "badge",
        store,
        kioskId,
        {},
        failMeta
      );
    }
    if (!employee.is_active) {
      return failResult(
        "Employee is inactive - contact HR.",
        "employee_inactive",
        "badge",
        store,
        kioskId,
        {},
        {
          ...failMeta,
          employee_id: employee.id,
          employee_name: employee.full_name,
          employee_id_number: employee.employee_id_number,
        }
      );
    }
    if (activityJobFunction && !employeeAllowsBadgeActivity(employee.job_functions, activityJobFunction)) {
      const needed =
        activityJobFunction === "washing"
          ? "Washing"
          : activityJobFunction === "wash_iron"
            ? "Ironing"
            : "Buttons";
      return failResult(
        `Badge role ${needed} is not assigned on this employee - contact HR.`,
        "invalid_badge",
        "badge",
        store,
        kioskId,
        {},
        {
          ...failMeta,
          employee_id: employee.id,
          employee_name: employee.full_name,
          employee_id_number: employee.employee_id_number,
        }
      );
    }

    const ctx = resolveScanEmployeeContext({
      employee_id: employee.id,
      workstation_id: input.workstation_id ?? employee.assigned_workstation_id,
    });

    const allowStackedOpen = employeeAllowsStackedOpenPieces(employee.job_functions);
    const badgeDecision = decideBadgeScan(store, kioskId, ctx.employee_id, {
      allowStackedOpen,
    });

    if (badgeDecision.type === "close") {
      return closeSessionWithBadgeOrPiece({
        store,
        session: badgeDecision.session,
        kioskId,
        at,
        employee_id: ctx.employee_id,
        employee_name: ctx.employee_name,
        employee_id_number: ctx.employee_id_number,
        workstation_id: ctx.workstation_id,
        source: input.source,
      });
    }

    if (badgeDecision.type === "reject_multi_open") {
      return failResult(
        `${ctx.employee_name} has multiple open pieces - scan the A4 for the piece to close.`,
        "badge_while_sewing",
        "badge",
        store,
        kioskId,
        { session: badgeDecision.sessions[0] },
        {
          ...failMeta,
          employee_id: ctx.employee_id,
          employee_name: ctx.employee_name,
          employee_id_number: ctx.employee_id_number,
          related_production_code: badgeDecision.sessions[0]?.production_code ?? null,
          related_session_id: badgeDecision.sessions[0]?.id ?? null,
        }
      );
    }

    if (badgeDecision.type === "enter_closing_badge_first") {
      store = applyBadgeFirstClosing(store, badgeDecision.session, nowIso(at));
      const closing =
        store.sessions.find((row) => row.id === badgeDecision.session.id) ?? badgeDecision.session;
      await writeSewingSessions(store);
      return result(
        true,
        `Closing ${closing.production_code} - ${closing.employee_name}, scan that A4 within 30 seconds.`,
        store,
        kioskId,
        { session: closing },
        {
          beep: "progress",
          session: closing,
          recovered: true,
          recovery: "badge_first_close",
        }
      );
    }

    // After close paths: only Expats ID-badge list may arm / start (any job on that list).
    if (
      badgeDecisionRequiresSewCapability(badgeDecision.type) &&
      !employeeCanSewOnStitchKiosk(employee)
    ) {
      return failResult(
        "Not on the Expats ID list - only expat badge holders can use this kiosk.",
        "not_expat_badge",
        "badge",
        store,
        kioskId,
        {},
        {
          ...failMeta,
          employee_id: ctx.employee_id,
          employee_name: ctx.employee_name,
          employee_id_number: ctx.employee_id_number,
        }
      );
    }

    if (badgeDecision.type === "reject_ambiguous_piece_arms") {
      return failResult(
        "Multiple pieces waiting - scan one A4 again, then badge.",
        "ambiguous_piece_arms",
        "badge",
        store,
        kioskId,
        {},
        {
          ...failMeta,
          employee_id: ctx.employee_id,
          employee_name: ctx.employee_name,
          employee_id_number: ctx.employee_id_number,
        }
      );
    }

    if (badgeDecision.type === "start_with_piece_arm") {
      const pieceArm = badgeDecision.piece_arm;
      const session = buildSessionFromPieceArm(
        pieceArm,
        {
          employee_id: ctx.employee_id,
          employee_name: ctx.employee_name,
          employee_id_number: ctx.employee_id_number,
          workstation_id: ctx.workstation_id,
        },
        kioskId,
        at,
        workKind,
        activityJobFunction
      );
      store = applyStartFromPieceArm(store, kioskId, pieceArm, session);
      if (allowStackedOpen) {
        store = applyEmployeeArm(store, {
          kiosk_id: kioskId,
          employee_id: ctx.employee_id,
          employee_name: ctx.employee_name,
          employee_id_number: ctx.employee_id_number,
          workstation_id: ctx.workstation_id,
          armed_at: nowIso(at),
          work_kind: workKind,
          activity_job_function: activityJobFunction,
        });
      }
      await writeSewingSessions(store);

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
            activity_job_function: session.activity_job_function ?? null,
            recovered: true,
            recovery: "piece_first_start",
          },
          input.source ?? "erp"
        );
      } catch (error) {
        console.error("Failed to notify sewing_session_started:", session.id, error);
      }
      try {
        await notifyAdminsOfSewingSessionStarted(session);
      } catch (error) {
        console.error("Failed to email admins sewing_session_started:", session.id, error);
      }
      if (session.overtime_status === "pending") {
        try {
          await ensureOvertimeConfirmRequest(session, `${session.employee_name} (kiosk overtime)`);
        } catch (error) {
          console.error("Failed to queue overtime confirm:", session.id, error);
        }
      }
      await safeRecordPatternAlterationPendingFromSession(session, input.source ?? "erp");

      const started = enrichSessionsForFloorUi([session])[0]!;
      const openCount = openSessionsOnKiosk(store, kioskId).filter(
        (row) => row.employee_id === ctx.employee_id && row.status === "open"
      ).length;
      const startMsg = floorActivitySessionStartedMessage(
        sewingSessionEmployeeDisplayName(started),
        started.job_functions,
        started.production_code,
        started.piece_mark,
        started.work_kind,
        started.activity_job_function
      );
      return result(
        true,
        allowStackedOpen && openCount > 1
          ? `${startMsg} ${stackedOpenFollowupMessage(started.job_functions, openCount)}`
          : startMsg,
        store,
        kioskId,
        { session: started },
        {
          beep: "ok",
          recovered: true,
          recovery: "piece_first_start",
        }
      );
    }

    const arm: SewingKioskArm = {
      kiosk_id: kioskId,
      employee_id: ctx.employee_id,
      employee_name: ctx.employee_name,
      employee_id_number: ctx.employee_id_number,
      workstation_id: ctx.workstation_id,
      armed_at: nowIso(at),
      work_kind: workKind,
      activity_job_function: activityJobFunction,
    };
    store = applyEmployeeArm(store, arm);
    await writeSewingSessions(store);
    const openAlready = openSessionsOnKiosk(store, kioskId).filter(
      (row) => row.employee_id === arm.employee_id && row.status === "open"
    ).length;
    const readyHint =
      workKind === "alteration"
        ? `${arm.employee_name} ready for ALTERATION - scan A4 piece QR within 30 seconds.`
        : activityJobFunction === "washing"
          ? `${arm.employee_name} ready for WASHING - scan A4 piece QR within 30 seconds.`
          : activityJobFunction === "wash_iron"
          ? `${arm.employee_name} ready for IRONING - scan A4 piece QR within 30 seconds.`
          : activityJobFunction === "buttons"
            ? `${arm.employee_name} ready for BUTTONS - scan A4 piece QR within 30 seconds.`
            : allowStackedOpen && openAlready > 0
              ? `${arm.employee_name} ready - scan next A4 to open (${openAlready} already open), or scan an open A4 to finish.`
              : `${arm.employee_name} ready - scan A4 piece QR within 30 seconds.`;
    return result(true, readyHint, store, kioskId, { arm }, { beep: "progress" });
  }

  let meta: ReturnType<typeof lookupPieceMeta>;
  try {
    meta = lookupPieceMeta(raw);
  } catch (error) {
    const armHint = resolveUniqueEmployeeArm(store, kioskId);
    return failResult(
      error instanceof Error ? error.message : explainUnrecognizedStitchScan(raw),
      "piece_not_recognized",
      "piece",
      store,
      kioskId,
      { arm: armHint.status === "one" ? armHint.arm : null },
      failMeta
    );
  }

  const armedForShared = mostRecentArm(store, kioskId);
  const sharedPiece = resolveSharedPieceScan(store, kioskId, meta.production_code, raw, {
    armedEmployeeId: armedForShared?.employee_id ?? null,
  });
  if (sharedPiece.type === "reject_ambiguous_shared_piece") {
    const names = sharedPiece.sessions
      .map((row) => row.employee_name)
      .filter(Boolean)
      .slice(0, 4)
      .join(", ");
    return failResult(
      names
        ? `Several stitchers are on this piece (${names}) - scan the finishing stitcher's badge, then this A4.`
        : "Several stitchers are on this piece - scan the finishing stitcher's badge, then this A4.",
      "ambiguous_shared_piece",
      "piece",
      store,
      kioskId,
      {},
      {
        ...failMeta,
        related_production_code: meta.production_code,
        related_session_id: sharedPiece.sessions[0]?.id ?? null,
      }
    );
  }
  if (sharedPiece.type === "close_session") {
    const pieceSession = sharedPiece.session;
    if (pieceSession.status === "closing") {
      const confirm = pieceSession.closing_confirm ?? "badge";
      if (confirm === "piece") {
        return closeSessionWithBadgeOrPiece({
          store,
          session: pieceSession,
          kioskId,
          at,
          employee_id: pieceSession.employee_id,
          employee_name: pieceSession.employee_name,
          employee_id_number: pieceSession.employee_id_number,
          workstation_id: pieceSession.workstation_id,
          source: input.source,
        });
      }
      return result(
        true,
        `Closing ${pieceSession.production_code} - ${pieceSession.employee_name}, scan badge.`,
        store,
        kioskId,
        { session: pieceSession },
        { beep: "progress" }
      );
    }
    const closing: SewingSession = {
      ...pieceSession,
      status: "closing",
      closing_armed_at: nowIso(at),
      closing_confirm: "badge",
    };
    store = {
      ...store,
      sessions: store.sessions.map((row) => (row.id === closing.id ? closing : row)),
    };
    await writeSewingSessions(store);
    return result(
      true,
      `Closing ${closing.production_code} - ${closing.employee_name}, scan badge within 30 seconds.`,
      store,
      kioskId,
      { session: closing },
      { beep: "progress", session: closing }
    );
  }

  const armedForStart = mostRecentArm(store, kioskId);
  const armedEmployeeForStart = armedForStart
    ? findPayrollEmployeeById(armedForStart.employee_id)
    : null;
  const allowConcurrentOpen = armedEmployeeForStart
    ? employeeAllowsStackedOpenPieces(armedEmployeeForStart.job_functions)
    : false;
  const pieceDecision = decidePieceStart(store, kioskId, { allowConcurrentOpen });

  if (pieceDecision.type === "reject_wrong_piece_for_close") {
    const waiting = pieceDecision.session;
    if (waiting) {
      return failResult(
        `Wrong piece - scan ${waiting.production_code} to finish ${waiting.employee_name}.`,
        "wrong_piece_for_close",
        "piece",
        store,
        kioskId,
        { session: waiting },
        {
          ...failMeta,
          employee_id: waiting.employee_id,
          employee_name: waiting.employee_name,
          employee_id_number: waiting.employee_id_number,
          related_production_code: waiting.production_code,
          related_session_id: waiting.id,
        }
      );
    }
    return failResult(
      "Ambiguous close - scan the exact A4 for the piece being finished.",
      "wrong_piece_for_close",
      "piece",
      store,
      kioskId,
      {},
      {
        ...failMeta,
        related_production_code: meta.production_code,
      }
    );
  }

  if (pieceDecision.type === "reject_ambiguous_employee_arms") {
    // Should not fire: decidePieceStart uses mostRecentArm. Kept for exhaustiveness.
    const newest = mostRecentArm(store, kioskId);
    return failResult(
      newest
        ? `Could not start piece - rescan A4 for ${newest.employee_name} (most recent badge).`
        : "Could not start piece - scan badge, then A4.",
      "ambiguous_employee_arms",
      "piece",
      store,
      kioskId,
      { arm: newest },
      {
        ...failMeta,
        related_production_code: meta.production_code,
      }
    );
  }

  if (pieceDecision.type === "reject_employee_has_open_piece") {
    const { arm, session: openForArmed } = pieceDecision;
    return failResult(
      `${arm.employee_name} already has an open piece - close it before starting another.`,
      "employee_has_open_piece",
      "piece",
      store,
      kioskId,
      { arm, session: openForArmed },
      {
        ...failMeta,
        employee_id: arm.employee_id,
        employee_name: arm.employee_name,
        employee_id_number: arm.employee_id_number,
        related_production_code: openForArmed.production_code,
        related_session_id: openForArmed.id,
      }
    );
  }

  if (pieceDecision.type === "start_with_employee_arm") {
    const arm = pieceDecision.arm;
    const armedEmployee = findPayrollEmployeeById(arm.employee_id);
    if (armedEmployee && !employeeCanSewOnStitchKiosk(armedEmployee)) {
      return failResult(
        "Not on the Expats ID list - only expat badge holders can use this kiosk.",
        "not_expat_badge",
        "piece",
        store,
        kioskId,
        { arm },
        {
          ...failMeta,
          employee_id: arm.employee_id,
          employee_name: arm.employee_name,
          employee_id_number: arm.employee_id_number,
          related_production_code: meta.production_code,
        }
      );
    }
    const session = buildSessionFromArmAndMeta(arm, meta, raw, kioskId, at);
    store = applyStartFromEmployeeArm(store, kioskId, arm, session);
    const stackedOpen = employeeAllowsStackedOpenPieces(armedEmployee?.job_functions);
    if (stackedOpen) {
      // Keep the cutter / chain-stitcher ready for the next article without
      // fighting close logic (close stays A4-first per piece).
      store = applyEmployeeArm(store, {
        ...arm,
        armed_at: nowIso(at),
      });
    }
    await writeSewingSessions(store);

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
          activity_job_function: session.activity_job_function ?? null,
        },
        input.source ?? "erp"
      );
    } catch (error) {
      console.error("Failed to notify sewing_session_started:", session.id, error);
    }
    try {
      await notifyAdminsOfSewingSessionStarted(session);
    } catch (error) {
      console.error("Failed to email admins sewing_session_started:", session.id, error);
    }
    if (session.overtime_status === "pending") {
      try {
        await ensureOvertimeConfirmRequest(session, `${session.employee_name} (kiosk overtime)`);
      } catch (error) {
        console.error("Failed to queue overtime confirm:", session.id, error);
      }
    }
    await safeRecordPatternAlterationPendingFromSession(session, input.source ?? "erp");

    const started = enrichSessionsForFloorUi([session])[0]!;
    const openCount = openSessionsOnKiosk(store, kioskId).filter(
      (row) => row.employee_id === arm.employee_id && row.status === "open"
    ).length;
    const startMsg = floorActivitySessionStartedMessage(
      sewingSessionEmployeeDisplayName(started),
      started.job_functions,
      started.production_code,
      started.piece_mark,
      started.work_kind,
      started.activity_job_function
    );
    return result(
      true,
      stackedOpen && openCount > 1
        ? `${startMsg} ${stackedOpenFollowupMessage(started.job_functions, openCount)}`
        : startMsg,
      store,
      kioskId,
      { session: started },
      { beep: "ok" }
    );
  }

  // No employee arm: piece-first recovery - arm the piece for 30s.
  const pieceArm: SewingKioskPieceArm = {
    kiosk_id: kioskId,
    production_code: meta.production_code,
    scan_code: raw.trim().toUpperCase(),
    so_number: meta.so_number,
    piece_mark: meta.piece_mark,
    fabric_cut_code: meta.fabric_cut_code,
    client_name: meta.client_name,
    garment_type: meta.garment_type,
    fabric_number: meta.fabric_number,
    supplier_id: meta.supplier_id,
    work_order_id: meta.work_order_id,
    armed_at: nowIso(at),
  };
  store = applyPieceArm(store, pieceArm);
  await writeSewingSessions(store);
  return result(
    true,
    `Piece ${pieceArm.production_code} ready - scan EMP or Alteration badge within 30 seconds.`,
    store,
    kioskId,
    { piece_arm: pieceArm },
    {
      beep: "progress",
      piece_arm: pieceArm,
      recovered: true,
      recovery: "piece_first_start",
    }
  );
}
