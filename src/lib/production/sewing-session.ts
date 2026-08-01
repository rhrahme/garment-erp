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
import { pieceProductionCodeFromSticker, pieceScanAttribution } from "@/lib/sales-orders/label-codes";
import type {
  SewingKioskArm,
  SewingKioskScanResult,
  SewingSession,
  SewingSessionsFile,
} from "@/lib/types/sewing-sessions";

export {
  expireStaleSewingState,
  SEWING_ARM_TIMEOUT_MS,
  SEWING_CLOSING_TIMEOUT_MS,
  sewingSessionsDashboard,
} from "@/lib/production/sewing-session-state";

function nowIso(at = Date.now()): string {
  return new Date(at).toISOString();
}

function result(
  ok: boolean,
  message: string,
  store: SewingSessionsFile,
  kioskId: string,
  extras?: Partial<SewingKioskScanResult>
): SewingKioskScanResult {
  const arm = store.kiosk_arms.find((row) => row.kiosk_id === kioskId) ?? null;
  const session =
    store.sessions.find(
      (row) => row.kiosk_id === kioskId && (row.status === "open" || row.status === "closing")
    ) ?? null;
  return {
    ok,
    message,
    phase: sessionPhase(session, arm),
    beep: ok ? (extras?.beep ?? "ok") : "error",
    arm,
    session,
    ...extras,
  };
}

function activeSessionForKiosk(store: SewingSessionsFile, kioskId: string): SewingSession | null {
  return (
    store.sessions.find(
      (row) => row.kiosk_id === kioskId && (row.status === "open" || row.status === "closing")
    ) ?? null
  );
}

function lookupPieceMeta(scanCode: string): {
  production_code: string;
  so_number: string | null;
  piece_mark: string | null;
  fabric_cut_code: string | null;
  client_name: string | null;
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
    fabric_cut_code: null,
    client_name: lookup.order.client_name?.trim() || null,
    work_order_id: null,
  };
}

export type ProcessSewingKioskScanInput = {
  raw: string;
  kiosk_id: string;
  workstation_id?: string | null;
  source?: "erp" | "zapier" | "api";
  /** Injected clock for tests. */
  now?: number;
};

/**
 * Single-scan kiosk handler: EMP badge arm / piece start / piece close-arm / EMP end.
 * Ending a session also runs sewing stage scan (timed session + stage advance).
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
    return result(false, "Empty scan.", store, kioskId);
  }

  let store = expireStaleSewingState(await readSewingSessionsAsync(), at);
  const active = activeSessionForKiosk(store, kioskId);

  if (isEmployeeQrPayload(raw)) {
    const badgeValue = parseEmployeeQrPayload(raw);
    if (!badgeValue) {
      return result(false, "Invalid employee badge.", store, kioskId);
    }
    const employee = findPayrollEmployeeByBadgeValue(raw);
    if (!employee) {
      return result(false, "Employee not found - scan your badge again.", store, kioskId);
    }
    if (!employee.is_active) {
      return result(false, "Employee is inactive - contact HR.", store, kioskId);
    }

    const ctx = resolveScanEmployeeContext({
      employee_id: employee.id,
      workstation_id: input.workstation_id ?? employee.assigned_workstation_id,
    });

    if (active?.status === "closing") {
      if (active.employee_id !== ctx.employee_id) {
        return result(
          false,
          `Wrong badge - expected ${active.employee_name} to close this piece.`,
          store,
          kioskId
        );
      }

      const endedAt = nowIso(at);
      const durationSec = Math.max(
        0,
        Math.round((at - new Date(active.started_at).getTime()) / 1000)
      );
      let stageAdvanced = false;
      let stageMessage = "";

      try {
        const stage = await executeStageScan({
          code: active.scan_code,
          station: "sewing",
          context: "production",
          employee_id: ctx.employee_id,
          workstation_id: ctx.workstation_id,
          require_employee: true,
          source: input.source ?? "erp",
        });
        stageAdvanced = true;
        stageMessage = stage.message;
        active.work_order_id = stage.work_order?.id ?? active.work_order_id;
        active.fabric_cut_code = stage.fabric_cut_code ?? active.fabric_cut_code;
        active.so_number = stage.so_number ?? active.so_number;
        active.piece_mark = stage.piece_mark ?? active.piece_mark;
      } catch (error) {
        stageMessage = error instanceof Error ? error.message : "Sewing stage scan failed.";
      }

      const closed: SewingSession = {
        ...active,
        status: "closed",
        ended_at: endedAt,
        duration_sec: durationSec,
        closing_armed_at: null,
        workstation_id: ctx.workstation_id ?? active.workstation_id,
      };

      store = {
        ...store,
        kiosk_arms: store.kiosk_arms.filter((arm) => arm.kiosk_id !== kioskId),
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
          ? `Done - ${closed.production_code} in ${timeLabel}. ${stageMessage}`
          : `Session closed (${timeLabel}). Stage note: ${stageMessage}`,
        store,
        kioskId,
        { beep: "ok", duration_sec: durationSec, stage_advanced: stageAdvanced, session: closed }
      );
    }

    if (active?.status === "open") {
      return result(
        false,
        "Piece is open - scan the A4 sheet first, then your badge to finish.",
        store,
        kioskId
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
      kiosk_arms: [...store.kiosk_arms.filter((row) => row.kiosk_id !== kioskId), arm],
    };
    await writeSewingSessions(store);
    return result(
      true,
      `${arm.employee_name} ready - scan the A4 piece QR within 30 seconds.`,
      store,
      kioskId,
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
      kioskId
    );
  }

  if (active?.status === "open" || active?.status === "closing") {
    if (
      !productionCodesMatch(active.production_code, meta.production_code) &&
      !productionCodesMatch(active.scan_code, raw)
    ) {
      return result(
        false,
        `Different piece - finish ${active.production_code} first (${active.employee_name}).`,
        store,
        kioskId
      );
    }
    if (active.status === "closing") {
      return result(
        true,
        `Closing ${active.production_code} - ${active.employee_name}, scan your badge.`,
        store,
        kioskId,
        { beep: "progress" }
      );
    }
    const closing: SewingSession = {
      ...active,
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
      `Closing ${closing.production_code} - ${closing.employee_name}, scan your badge within 30 seconds.`,
      store,
      kioskId,
      { beep: "progress", session: closing }
    );
  }

  const arm = store.kiosk_arms.find((row) => row.kiosk_id === kioskId) ?? null;
  if (!arm) {
    return result(false, "Scan your employee badge first.", store, kioskId);
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
  };

  store = {
    ...store,
    kiosk_arms: store.kiosk_arms.filter((row) => row.kiosk_id !== kioskId),
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
    }. Scan A4 then badge when done.`,
    store,
    kioskId,
    { beep: "ok", session }
  );
}
