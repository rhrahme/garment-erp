import {
  resolveUniqueEmployeeArm,
  resolveUniquePieceArm,
} from "@/lib/production/sewing-session-state";
import type {
  SewingKioskArm,
  SewingKioskPieceArm,
  SewingSession,
  SewingSessionsFile,
} from "@/lib/types/sewing-sessions";

export {
  resolveUniqueEmployeeArm,
  resolveUniquePieceArm,
} from "@/lib/production/sewing-session-state";

export function openSessionsOnKiosk(
  store: SewingSessionsFile,
  kioskId: string
): SewingSession[] {
  return store.sessions.filter(
    (row) => row.kiosk_id === kioskId && (row.status === "open" || row.status === "closing")
  );
}

export type PieceStartDecision =
  | { type: "start_with_employee_arm"; arm: SewingKioskArm }
  | { type: "arm_piece" }
  | { type: "reject_ambiguous_employee_arms"; arms: SewingKioskArm[] }
  | { type: "reject_employee_has_open_piece"; arm: SewingKioskArm; session: SewingSession }
  | {
      type: "reject_wrong_piece_for_close";
      session: SewingSession | null;
      waiting: SewingSession[];
    };

export type BadgeDecision =
  | { type: "close"; session: SewingSession }
  | { type: "enter_closing_badge_first"; session: SewingSession }
  | { type: "reject_multi_open"; sessions: SewingSession[] }
  | { type: "start_with_piece_arm"; piece_arm: SewingKioskPieceArm }
  | { type: "reject_ambiguous_piece_arms"; arms: SewingKioskPieceArm[] }
  | { type: "arm_employee" };

/**
 * Close / finish badge paths must not be blocked by the stitch kiosk gate.
 * Arm / start / piece-arm ambiguity still require an Expats ID-badge employee.
 */
export function badgeDecisionRequiresSewCapability(type: BadgeDecision["type"]): boolean {
  return (
    type === "arm_employee" ||
    type === "start_with_piece_arm" ||
    type === "reject_ambiguous_piece_arms"
  );
}

/**
 * Pure decision for an A4 that does not match an already-open/closing piece on the kiosk.
 */
export function decidePieceStart(
  store: SewingSessionsFile,
  kioskId: string
): PieceStartDecision {
  const pieceConfirmClosing = openSessionsOnKiosk(store, kioskId).filter(
    (row) => row.status === "closing" && (row.closing_confirm ?? "badge") === "piece"
  );
  if (pieceConfirmClosing.length >= 1) {
    return {
      type: "reject_wrong_piece_for_close",
      session: pieceConfirmClosing.length === 1 ? pieceConfirmClosing[0]! : null,
      waiting: pieceConfirmClosing,
    };
  }

  const armPick = resolveUniqueEmployeeArm(store, kioskId);
  if (armPick.status === "many") {
    return { type: "reject_ambiguous_employee_arms", arms: armPick.arms };
  }
  if (armPick.status === "one") {
    const arm = armPick.arm;
    const openForArmed = openSessionsOnKiosk(store, kioskId).find(
      (row) => row.employee_id === arm.employee_id && row.status !== "closed"
    );
    if (openForArmed) {
      return { type: "reject_employee_has_open_piece", arm, session: openForArmed };
    }
    return { type: "start_with_employee_arm", arm };
  }
  return { type: "arm_piece" };
}

/**
 * Pure decision for a valid active employee badge (after invalid/inactive checks).
 */
export function decideBadgeScan(
  store: SewingSessionsFile,
  kioskId: string,
  employeeId: string
): BadgeDecision {
  const closingForEmployee = openSessionsOnKiosk(store, kioskId).find(
    (row) => row.status === "closing" && row.employee_id === employeeId
  );
  if (closingForEmployee) {
    return { type: "close", session: closingForEmployee };
  }

  const openForEmployee = openSessionsOnKiosk(store, kioskId).filter(
    (row) => row.status === "open" && row.employee_id === employeeId
  );
  if (openForEmployee.length > 1) {
    return { type: "reject_multi_open", sessions: openForEmployee };
  }
  if (openForEmployee.length === 1) {
    return { type: "enter_closing_badge_first", session: openForEmployee[0]! };
  }

  const pieceArmPick = resolveUniquePieceArm(store, kioskId);
  if (pieceArmPick.status === "many") {
    return { type: "reject_ambiguous_piece_arms", arms: pieceArmPick.arms };
  }
  if (pieceArmPick.status === "one") {
    return { type: "start_with_piece_arm", piece_arm: pieceArmPick.arm };
  }
  return { type: "arm_employee" };
}

/** Apply badge-first close transition (pure). */
export function applyBadgeFirstClosing(
  store: SewingSessionsFile,
  session: SewingSession,
  atIso: string
): SewingSessionsFile {
  const closing: SewingSession = {
    ...session,
    status: "closing",
    closing_armed_at: atIso,
    closing_confirm: "piece",
  };
  return {
    ...store,
    sessions: store.sessions.map((row) => (row.id === closing.id ? closing : row)),
  };
}

/** Apply piece-first arm (one pending piece per kiosk). */
export function applyPieceArm(
  store: SewingSessionsFile,
  pieceArm: SewingKioskPieceArm
): SewingSessionsFile {
  return {
    ...store,
    kiosk_piece_arms: [
      ...(store.kiosk_piece_arms ?? []).filter((row) => row.kiosk_id !== pieceArm.kiosk_id),
      pieceArm,
    ],
  };
}

/** Start session from employee arm + clear that arm (pure). */
export function applyStartFromEmployeeArm(
  store: SewingSessionsFile,
  kioskId: string,
  arm: SewingKioskArm,
  session: SewingSession
): SewingSessionsFile {
  return {
    ...store,
    kiosk_arms: store.kiosk_arms.filter(
      (row) => !(row.kiosk_id === kioskId && row.employee_id === arm.employee_id)
    ),
    kiosk_piece_arms: (store.kiosk_piece_arms ?? []).filter((row) => row.kiosk_id !== kioskId),
    sessions: [session, ...store.sessions],
  };
}

/** Start session from piece arm + clear that piece arm (pure). */
export function applyStartFromPieceArm(
  store: SewingSessionsFile,
  kioskId: string,
  pieceArm: SewingKioskPieceArm,
  session: SewingSession
): SewingSessionsFile {
  return {
    ...store,
    kiosk_arms: store.kiosk_arms.filter(
      (row) => !(row.kiosk_id === kioskId && row.employee_id === session.employee_id)
    ),
    kiosk_piece_arms: (store.kiosk_piece_arms ?? []).filter(
      (row) =>
        !(row.kiosk_id === kioskId && row.production_code === pieceArm.production_code)
    ),
    sessions: [session, ...store.sessions],
  };
}

/** Close a closing session (pure store update; stage scan is side-effect elsewhere). */
export function applyCloseSession(
  store: SewingSessionsFile,
  session: SewingSession,
  closed: SewingSession
): SewingSessionsFile {
  return {
    ...store,
    kiosk_arms: store.kiosk_arms.filter(
      (arm) => !(arm.kiosk_id === session.kiosk_id && arm.employee_id === session.employee_id)
    ),
    kiosk_piece_arms: (store.kiosk_piece_arms ?? []).filter(
      (arm) => arm.kiosk_id !== session.kiosk_id
    ),
    sessions: store.sessions.map((row) => (row.id === closed.id ? closed : row)),
  };
}
