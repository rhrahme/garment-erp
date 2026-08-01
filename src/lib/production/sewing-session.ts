import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { readSewingSessionsAsync, writeSewingSessions } from "@/lib/data/sewing-sessions";
import { isEmployeeQrPayload, parseEmployeeQrPayload } from "@/lib/hr/employee-qr";
import { findPayrollEmployeeByBadgeValue, resolveScanEmployeeContext } from "@/lib/hr/payroll-lookup";
import { notifyIntegration } from "@/lib/integrations";
import { executeStageScan } from "@/lib/production/execute-stage-scan";
import { normalizeScannerInput } from "@/lib/production/scan-input";
import {
  expireStaleSewingState,
  productionCodesMatch,
  sessionPhase,
} from "@/lib/production/sewing-session-state";
import { resolveScanToLine } from "@/lib/production/stage-scan";
import {
  pieceProductionCodeFromSticker,
  pieceScanAttribution,
  supplierFabricProductionCode,
} from "@/lib/sales-orders/label-codes";
import type {
  SewingKioskArm,
  SewingKioskScanResult,
  SewingSession,
  SewingSessionsFile,
} from "@/lib/types/sewing-sessions";

export {
  expireStaleSewingState,
  parseSewingDashboardPeriod,
  SEWING_ARM_TIMEOUT_MS,
  SEWING_CLOSING_TIMEOUT_MS,
  sewingPeriodWindow,
  sewingSessionsDashboard,
} from "@/lib/production/sewing-session-state";
export type {
  SewingDashboardPeriod,
  SewingEmployeeAggregate,
  SewingPeriodWindow,
  SewingSessionsDashboardOptions,
} from "@/lib/production/sewing-session-state";

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
  focus: { arm?: SewingKioskArm | null; session?: SewingSession | null },
  extras?: Partial<SewingKioskScanResult>
): SewingKioskScanResult {
  const open = openOnKiosk(store, kioskId);
  const arm =
    focus.arm ??
    store.kiosk_arms
      .filter((row) => row.kiosk_id === kioskId)
      .sort((a, b) => b.armed_at.localeCompare(a.armed_at))[0] ??
    null;
  const session = focus.session ?? open[0] ?? null;
  return {
    ok,
    message,
    phase: sessionPhase(session, arm),
    beep: ok ? (extras?.beep ?? "ok") : "error",
    arm,
    session,
    open_sessions: open,
    ...extras,
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
  work_order_id: null;
} {
  const lookup = resolveScanToLine(scanCode);
  if (!lookup) {
    throw new Error("Piece / A4 code not recognized - check the production sheet QR.");
  }
  const siblings = lookup.line.label_stickers ?? [lookup.sticker];
  const production_code = pieceProductionCodeFromSticker(
    lookup.sticker,
    lookup.order.client_code,
    siblings
  );
  const attribution = pieceScanAttribution(lookup.sticker, lookup.order.client_code, siblings);
  return {
    production_code,
    so_number: lookup.order.so_number,
    piece_mark: attribution.piece_mark,
    fabric_cut_code: supplierFabricProductionCode(lookup.sticker.code, lookup.order.client_code),
    client_name: lookup.order.client_name?.trim() || null,
    garment_type: lookup.line.garment_type?.trim() || null,
    fabric_number: lookup.line.fabric_number?.trim() || null,
    work_order_id: null,
  };
}

function findSessionForPiece(
  store: SewingSessionsFile,
  kioskId: string,
  productionCode: string,
  scanCode: string
): SewingSession | null {
  return (
    openOnKiosk(store, kioskId).find(
      (row) =>
        productionCodesMatch(row.production_code, productionCode) ||
        productionCodesMatch(row.scan_code, scanCode)
    ) ?? null
  );
}

function mostRecentArm(store: SewingSessionsFile, kioskId: string): SewingKioskArm | null {
  return (
    store.kiosk_arms
      .filter((row) => row.kiosk_id === kioskId)
      .sort((a, b) => b.armed_at.localeCompare(a.armed_at))[0] ?? null
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
 */
export async function processSewingKioskScan(
  input: ProcessSewingKioskScanInput
): Promise<SewingKioskScanResult> {
  await ensureDocumentsLoaded([
    "payroll_employees",
    "sewing_sessions",
    "sales_orders",
    "production_work_orders",
  ]);

  const at = input.now ?? Date.now();
  const kioskId = input.kiosk_id.trim() || "default";
  const raw = normalizeScannerInput(input.raw);
  if (!raw) {
    const store = expireStaleSewingState(await readSewingSessionsAsync(), at);
    return result(false, "Empty scan.", store, kioskId, {});
  }

  let store = expireStaleSewingState(await readSewingSessionsAsync(), at);

  if (isEmployeeQrPayload(raw)) {
    const badgeValue = parseEmployeeQrPayload(raw);
    if (!badgeValue) {
      return result(false, "Invalid employee badge.", store, kioskId, {});
    }
    const employee = findPayrollEmployeeByBadgeValue(raw);
    if (!employee) {
      return result(false, "Employee not found - scan your badge again.", store, kioskId, {});
    }
    if (!employee.is_active) {
      return result(false, "Employee is inactive - contact HR.", store, kioskId, {});
    }

    const ctx = resolveScanEmployeeContext({
      employee_id: employee.id,
      workstation_id: input.workstation_id ?? employee.assigned_workstation_id,
    });

    const closingForEmployee = openOnKiosk(store, kioskId).find(
      (row) => row.status === "closing" && row.employee_id === ctx.employee_id
    );

    if (closingForEmployee) {
      const endedAt = nowIso(at);
      const durationSec = Math.max(
        0,
        Math.round((at - new Date(closingForEmployee.started_at).getTime()) / 1000)
      );
      let stageAdvanced = false;
      let stageMessage = "";

      try {
        const stage = await executeStageScan({
          code: closingForEmployee.scan_code,
          station: "sewing",
          context: "production",
          employee_id: ctx.employee_id,
          workstation_id: ctx.workstation_id,
          require_employee: true,
          source: input.source ?? "erp",
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

      const closed: SewingSession = {
        ...closingForEmployee,
        status: "closed",
        ended_at: endedAt,
        duration_sec: durationSec,
        closing_armed_at: null,
        workstation_id: ctx.workstation_id ?? closingForEmployee.workstation_id,
      };

      store = {
        ...store,
        kiosk_arms: store.kiosk_arms.filter(
          (arm) => !(arm.kiosk_id === kioskId && arm.employee_id === ctx.employee_id)
        ),
        sessions: store.sessions.map((row) => (row.id === closed.id ? closed : row)),
      };
      await writeSewingSessions(store);

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
          stage_advanced: stageAdvanced,
          stage_message: stageMessage,
        },
        input.source ?? "erp"
      );

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

    const openForEmployee = openOnKiosk(store, kioskId).find(
      (row) => row.status === "open" && row.employee_id === ctx.employee_id
    );
    if (openForEmployee) {
      return result(
        false,
        `${ctx.employee_name} already sewing ${openForEmployee.production_code} - scan that A4 first to close.`,
        store,
        kioskId,
        { session: openForEmployee }
      );
    }

    const arm: SewingKioskArm = {
      kiosk_id: kioskId,
      employee_id: ctx.employee_id,
      employee_name: ctx.employee_name,
      employee_id_number: ctx.employee_id_number,
      workstation_id: ctx.workstation_id,
      armed_at: nowIso(at),
    };
    store = {
      ...store,
      kiosk_arms: [
        ...store.kiosk_arms.filter(
          (row) => !(row.kiosk_id === kioskId && row.employee_id === arm.employee_id)
        ),
        arm,
      ],
    };
    await writeSewingSessions(store);
    return result(
      true,
      `${arm.employee_name} ready - scan A4 piece QR within 30 seconds.`,
      store,
      kioskId,
      { arm },
      { beep: "progress" }
    );
  }

  let meta: ReturnType<typeof lookupPieceMeta>;
  try {
    meta = lookupPieceMeta(raw);
  } catch (error) {
    return result(
      false,
      error instanceof Error ? error.message : "Piece code not recognized.",
      store,
      kioskId,
      {}
    );
  }

  const pieceSession = findSessionForPiece(store, kioskId, meta.production_code, raw);
  if (pieceSession) {
    if (pieceSession.status === "closing") {
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

  const arm = mostRecentArm(store, kioskId);
  if (!arm) {
    return result(false, "Scan employee badge first (then A4).", store, kioskId, {});
  }

  if (
    openOnKiosk(store, kioskId).some(
      (row) => row.employee_id === arm.employee_id && row.status !== "closed"
    )
  ) {
    return result(
      false,
      `${arm.employee_name} already has an open piece - close it before starting another.`,
      store,
      kioskId,
      { arm }
    );
  }

  const session: SewingSession = {
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
    work_order_id: meta.work_order_id,
    so_number: meta.so_number,
    piece_mark: meta.piece_mark,
    fabric_cut_code: meta.fabric_cut_code,
    client_name: meta.client_name,
    garment_type: meta.garment_type,
    fabric_number: meta.fabric_number,
  };

  store = {
    ...store,
    kiosk_arms: store.kiosk_arms.filter(
      (row) => !(row.kiosk_id === kioskId && row.employee_id === arm.employee_id)
    ),
    sessions: [session, ...store.sessions],
  };
  await writeSewingSessions(store);

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
    },
    input.source ?? "erp"
  );

  return result(
    true,
    `${session.employee_name} sewing ${session.production_code}${
      session.piece_mark ? ` (${session.piece_mark})` : ""
    }.`,
    store,
    kioskId,
    { session },
    { beep: "ok", session }
  );
}
