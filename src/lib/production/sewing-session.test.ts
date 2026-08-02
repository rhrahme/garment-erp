import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildSewingScanFailure,
  pruneSewingScanFailures,
  SEWING_SCAN_FAILURE_MAX_ROWS,
  SEWING_SCAN_FAILURE_RETENTION_DAYS,
} from "@/lib/production/sewing-scan-failure-build";
import {
  applyBadgeFirstClosing,
  applyCloseSession,
  applyPieceArm,
  applyStartFromEmployeeArm,
  applyStartFromPieceArm,
  decideBadgeScan,
  decidePieceStart,
  openSessionsOnKiosk,
} from "@/lib/production/sewing-session-recovery";
import { sewingSessionArticleLabel } from "@/lib/production/sewing-session-article-label";
import {
  enrichSewingSessionGarmentFields,
  enrichSewingSessionsGarmentFields,
} from "@/lib/production/sewing-session-garment";
import {
  expireStaleSewingState,
  mostRecentArm,
  productionCodesMatch,
  SEWING_ARM_TIMEOUT_MS,
  sewingFailedScansForPeriod,
  sewingPeriodWindow,
  sewingSessionsDashboard,
} from "@/lib/production/sewing-session-state";
import { pieceNameFromPieceMark } from "@/lib/sales-orders/label-codes";
import type { SewingScanFailure } from "@/lib/types/sewing-scan-failures";
import type {
  SewingKioskArm,
  SewingKioskPieceArm,
  SewingSession,
  SewingSessionsFile,
} from "@/lib/types/sewing-sessions";

function failure(
  partial: Partial<SewingScanFailure> & Pick<SewingScanFailure, "id" | "scanned_at" | "reason">
): SewingScanFailure {
  return {
    kiosk_id: "k1",
    workstation_id: null,
    raw_code: "BAD-CODE",
    reason_code: "piece_not_recognized",
    scan_kind: "piece",
    employee_id: null,
    employee_name: null,
    employee_id_number: null,
    related_production_code: null,
    related_session_id: null,
    arm_employee_id: null,
    arm_employee_name: null,
    phase: "idle",
    source: "erp",
    ...partial,
  };
}

function session(
  partial: Partial<SewingSession> & Pick<SewingSession, "id" | "employee_id" | "employee_name" | "status">
): SewingSession {
  return {
    kiosk_id: "k1",
    employee_id_number: "100",
    production_code: "FR-A",
    scan_code: "FR-A",
    workstation_id: null,
    started_at: new Date().toISOString(),
    ended_at: null,
    duration_sec: null,
    closing_armed_at: null,
    work_order_id: null,
    so_number: null,
    piece_mark: null,
    fabric_cut_code: null,
    client_name: null,
    ...partial,
  };
}

describe("sewingSessionArticleLabel", () => {
  it("maps OS-1/2 piece mark to Overshirt without stored garment_type", () => {
    assert.equal(pieceNameFromPieceMark("OS-1/2"), "Overshirt");
    assert.equal(
      sewingSessionArticleLabel({ garment_type: null, piece_mark: "OS-1/2" }),
      "Overshirt"
    );
  });

  it("prefers piece name for multi-piece SO line types", () => {
    assert.equal(
      sewingSessionArticleLabel({
        garment_type: "Overshirt+Trouser",
        piece_mark: "OS-1/2",
      }),
      "Overshirt"
    );
    assert.equal(
      sewingSessionArticleLabel({
        garment_type: "Overshirt+Trouser",
        piece_mark: "TR-2/2",
      }),
      "Trouser"
    );
  });

  it("keeps single-piece garment type as the article label", () => {
    assert.equal(
      sewingSessionArticleLabel({ garment_type: "Jacket", piece_mark: "JKT" }),
      "Jacket"
    );
  });
});

describe("enrichSewingSessionGarmentFields", () => {
  it("backfills garment_type from SO-2026-0131 Overshirt+Trouser sticker", () => {
    const open = session({
      id: "legacy-os",
      employee_id: "e1",
      employee_name: "Ali",
      status: "open",
      production_code: "FR-0131-L04-OS-1/2",
      scan_code: "FR-0626-0037-SO-2026-0131-L04-OS",
      piece_mark: "OS-1/2",
      so_number: "SO-2026-0131",
      garment_type: null,
      fabric_number: null,
    });
    const enriched = enrichSewingSessionGarmentFields(open);
    assert.equal(enriched.garment_type, "Overshirt+Trouser");
    assert.equal(enriched.fabric_number, "66046");
    assert.equal(sewingSessionArticleLabel(enriched), "Overshirt");
  });
});

describe("sewingSessionsDashboard article labels", () => {
  it("lists distinct articles on employee aggregates and history rows", () => {
    const at = new Date(2026, 7, 1, 15, 0, 0, 0).getTime();
    const store: SewingSessionsFile = {
      updated_at: null,
      kiosk_arms: [],
      sessions: [
        session({
          id: "os1",
          employee_id: "e1",
          employee_name: "Ali",
          status: "closed",
          production_code: "FR-OS",
          piece_mark: "OS-1/2",
          garment_type: "Overshirt+Trouser",
          started_at: new Date(at - 600_000).toISOString(),
          ended_at: new Date(at - 300_000).toISOString(),
          duration_sec: 300,
        }),
        session({
          id: "tr1",
          employee_id: "e1",
          employee_name: "Ali",
          status: "closed",
          production_code: "FR-TR",
          piece_mark: "TR-2/2",
          garment_type: "Overshirt+Trouser",
          started_at: new Date(at - 500_000).toISOString(),
          ended_at: new Date(at - 200_000).toISOString(),
          duration_sec: 300,
        }),
      ],
    };
    const dash = sewingSessionsDashboard(store, at);
    assert.deepEqual(dash.completed_by_employee[0]?.articles, ["Overshirt", "Trouser"]);
    assert.equal(sewingSessionArticleLabel(dash.sessions[0]!), "Trouser");
    assert.equal(sewingSessionArticleLabel(dash.sessions[1]!), "Overshirt");
  });

  it("backfills closed-session articles via SO lookup before Performance aggregates", () => {
    const at = new Date(2026, 7, 1, 15, 0, 0, 0).getTime();
    const store: SewingSessionsFile = {
      updated_at: null,
      kiosk_arms: [],
      sessions: [
        session({
          id: "legacy-closed",
          employee_id: "e1",
          employee_name: "Ali",
          status: "closed",
          production_code: "FR-0131-L04-OS-1/2",
          scan_code: "FR-0626-0037-SO-2026-0131-L04-OS",
          piece_mark: "OS-1/2",
          so_number: "SO-2026-0131",
          garment_type: null,
          fabric_number: null,
          started_at: new Date(at - 600_000).toISOString(),
          ended_at: new Date(at - 100_000).toISOString(),
          duration_sec: 500,
        }),
      ],
    };
    // Mirrors sewingSessionsDashboard wrapper: enrich store before aggregate.
    const enrichedStore: SewingSessionsFile = {
      ...store,
      sessions: enrichSewingSessionsGarmentFields(store.sessions),
    };
    const dash = sewingSessionsDashboard(enrichedStore, at);
    assert.equal(dash.sessions[0]?.garment_type, "Overshirt+Trouser");
    assert.deepEqual(dash.completed_by_employee[0]?.articles, ["Overshirt"]);
  });
});

describe("expireStaleSewingState", () => {
  it("drops arms older than timeout", () => {
    const at = Date.parse("2026-08-01T12:00:00.000Z");
    const store: SewingSessionsFile = {
      updated_at: null,
      kiosk_arms: [
        {
          kiosk_id: "k1",
          employee_id: "e1",
          employee_name: "Ali",
          employee_id_number: "100",
          workstation_id: "PL-1-1",
          armed_at: new Date(at - SEWING_ARM_TIMEOUT_MS - 1).toISOString(),
        },
        {
          kiosk_id: "k2",
          employee_id: "e2",
          employee_name: "Sara",
          employee_id_number: "200",
          workstation_id: null,
          armed_at: new Date(at - 1000).toISOString(),
        },
      ],
      sessions: [],
    };
    const next = expireStaleSewingState(store, at);
    assert.equal(next.kiosk_arms.length, 1);
    assert.equal(next.kiosk_arms[0]?.kiosk_id, "k2");
  });

  it("reopens closing session after closing timeout", () => {
    const at = Date.parse("2026-08-01T12:00:00.000Z");
    const store: SewingSessionsFile = {
      updated_at: null,
      kiosk_arms: [],
      sessions: [
        session({
          id: "s1",
          employee_id: "e1",
          employee_name: "Ali",
          production_code: "FR-0002-L33-SH",
          scan_code: "FR-0002-L33-SH",
          started_at: new Date(at - 120_000).toISOString(),
          status: "closing",
          closing_armed_at: new Date(at - 31_000).toISOString(),
          so_number: "SO-2026-0002",
          piece_mark: "SH",
          client_name: "Youssef",
        }),
      ],
    };
    const next = expireStaleSewingState(store, at);
    assert.equal(next.sessions[0]?.status, "open");
    assert.equal(next.sessions[0]?.closing_armed_at, null);
  });
});

describe("sewingPeriodWindow", () => {
  it("day starts at local midnight", () => {
    const at = new Date(2026, 7, 1, 15, 30, 0, 0).getTime(); // Sat Aug 1 2026 local
    const window = sewingPeriodWindow("day", at);
    const start = new Date(window.from_ms);
    assert.equal(start.getFullYear(), 2026);
    assert.equal(start.getMonth(), 7);
    assert.equal(start.getDate(), 1);
    assert.equal(start.getHours(), 0);
    assert.equal(window.to_ms, at);
  });

  it("week is calendar Mon-Sun containing today", () => {
    // Saturday Aug 1 2026 -> Monday Jul 27 2026
    const at = new Date(2026, 7, 1, 12, 0, 0, 0).getTime();
    const window = sewingPeriodWindow("week", at);
    const start = new Date(window.from_ms);
    assert.equal(start.getDay(), 1); // Monday
    assert.equal(start.getFullYear(), 2026);
    assert.equal(start.getMonth(), 6); // July
    assert.equal(start.getDate(), 27);
    assert.equal(start.getHours(), 0);
  });

  it("month starts on the 1st local", () => {
    const at = new Date(2026, 7, 15, 9, 0, 0, 0).getTime();
    const window = sewingPeriodWindow("month", at);
    const start = new Date(window.from_ms);
    assert.equal(start.getFullYear(), 2026);
    assert.equal(start.getMonth(), 7);
    assert.equal(start.getDate(), 1);
    assert.equal(start.getHours(), 0);
  });

  it("honors explicit from/to overrides", () => {
    const at = new Date(2026, 7, 1, 12, 0, 0, 0).getTime();
    const from = new Date(2026, 6, 1, 0, 0, 0, 0).toISOString();
    const to = new Date(2026, 6, 10, 23, 59, 0, 0).toISOString();
    const window = sewingPeriodWindow("day", at, { from, to });
    assert.equal(window.from_ms, Date.parse(from));
    assert.equal(window.to_ms, Date.parse(to));
  });
});

describe("sewingSessionsDashboard", () => {
  it("counts closed sessions today and lists open ones", () => {
    const at = new Date(2026, 7, 1, 15, 0, 0, 0).getTime();
    const store: SewingSessionsFile = {
      updated_at: null,
      kiosk_arms: [],
      sessions: [
        session({
          id: "open1",
          employee_id: "e1",
          employee_name: "Ali",
          started_at: new Date(at - 60_000).toISOString(),
          status: "open",
        }),
        session({
          id: "done1",
          kiosk_id: "k2",
          employee_id: "e2",
          employee_name: "Sara",
          employee_id_number: "200",
          production_code: "FR-B",
          scan_code: "FR-B",
          started_at: new Date(at - 600_000).toISOString(),
          ended_at: new Date(at - 100_000).toISOString(),
          duration_sec: 500,
          status: "closed",
        }),
      ],
    };
    const dash = sewingSessionsDashboard(store, at);
    assert.equal(dash.open_sessions.length, 1);
    assert.equal(dash.closed_today, 1);
    assert.equal(dash.closed_in_period, 1);
    assert.equal(dash.period, "day");
    assert.equal(dash.completed_by_employee[0]?.employee_name, "Sara");
    assert.equal(dash.completed_by_employee[0]?.count, 1);
    assert.equal(dash.completed_by_employee[0]?.avg_duration_sec, 500);
    assert.equal(dash.sessions.length, 2);
  });

  it("aggregates closed sessions for week and month windows", () => {
    // Saturday Aug 1 2026 afternoon local
    const at = new Date(2026, 7, 1, 16, 0, 0, 0).getTime();
    const store: SewingSessionsFile = {
      updated_at: null,
      kiosk_arms: [],
      sessions: [
        // Closed earlier this week (Wed Jul 29) - in week, not today
        session({
          id: "week1",
          employee_id: "e1",
          employee_name: "Ali",
          production_code: "FR-WEEK",
          started_at: new Date(2026, 6, 29, 10, 0, 0, 0).toISOString(),
          ended_at: new Date(2026, 6, 29, 10, 20, 0, 0).toISOString(),
          duration_sec: 1200,
          status: "closed",
        }),
        // Closed today
        session({
          id: "day1",
          employee_id: "e1",
          employee_name: "Ali",
          production_code: "FR-DAY",
          started_at: new Date(at - 900_000).toISOString(),
          ended_at: new Date(at - 300_000).toISOString(),
          duration_sec: 600,
          status: "closed",
        }),
        // Closed last month (July 2) - only in month if we were in July; exclude from Aug month
        session({
          id: "old1",
          employee_id: "e2",
          employee_name: "Sara",
          production_code: "FR-OLD",
          started_at: new Date(2026, 6, 2, 9, 0, 0, 0).toISOString(),
          ended_at: new Date(2026, 6, 2, 9, 15, 0, 0).toISOString(),
          duration_sec: 900,
          status: "closed",
        }),
        // Closed Aug 1 - Sara
        session({
          id: "day2",
          employee_id: "e2",
          employee_name: "Sara",
          production_code: "FR-SARA",
          started_at: new Date(at - 400_000).toISOString(),
          ended_at: new Date(at - 100_000).toISOString(),
          duration_sec: 300,
          status: "closed",
        }),
      ],
    };

    const day = sewingSessionsDashboard(store, at, { period: "day" });
    assert.equal(day.closed_in_period, 2);
    assert.equal(day.closed_today, 2);
    assert.equal(day.completed_by_employee.length, 2);
    const aliDay = day.completed_by_employee.find((r) => r.employee_id === "e1");
    assert.equal(aliDay?.count, 1);
    assert.equal(aliDay?.duration_sec, 600);
    assert.equal(aliDay?.avg_duration_sec, 600);

    const week = sewingSessionsDashboard(store, at, { period: "week" });
    // week1 (Jul 29) + day1 + day2 = 3; old1 is Jul 2 (previous weeks)
    assert.equal(week.closed_in_period, 3);
    const aliWeek = week.completed_by_employee.find((r) => r.employee_id === "e1");
    assert.equal(aliWeek?.count, 2);
    assert.equal(aliWeek?.duration_sec, 1800);
    assert.equal(aliWeek?.avg_duration_sec, 900);

    const month = sewingSessionsDashboard(store, at, { period: "month" });
    // Aug only: day1 + day2
    assert.equal(month.closed_in_period, 2);
    assert.ok(!month.sessions.some((s) => s.id === "old1"));
    assert.ok(month.sessions.some((s) => s.id === "day1"));
  });

  it("caps history sessions newest first", () => {
    const at = new Date(2026, 7, 1, 18, 0, 0, 0).getTime();
    const sessions: SewingSession[] = [];
    for (let i = 0; i < 12; i += 1) {
      sessions.push(
        session({
          id: `s${i}`,
          employee_id: "e1",
          employee_name: "Ali",
          production_code: `FR-${i}`,
          started_at: new Date(at - (12 - i) * 60_000).toISOString(),
          ended_at: new Date(at - (12 - i) * 60_000 + 30_000).toISOString(),
          duration_sec: 30,
          status: "closed",
        })
      );
    }
    const dash = sewingSessionsDashboard(
      { updated_at: null, kiosk_arms: [], sessions },
      at,
      { period: "day", history_cap: 5 }
    );
    assert.equal(dash.sessions.length, 5);
    assert.equal(dash.sessions[0]?.id, "s11");
    assert.equal(dash.closed_in_period, 12);
  });

  it("includes failed scans for the period and caps the list", () => {
    const at = new Date(2026, 7, 1, 16, 0, 0, 0).getTime();
    const failedScans: SewingScanFailure[] = [
      failure({
        id: "f-old",
        scanned_at: new Date(2026, 6, 29, 10, 0, 0, 0).toISOString(),
        reason: "Old week failure",
        employee_name: "Ali",
      }),
      failure({
        id: "f-today-1",
        scanned_at: new Date(at - 120_000).toISOString(),
        reason: "Badge first",
        reason_code: "badge_required",
        raw_code: "FR-TODAY",
      }),
      failure({
        id: "f-today-2",
        scanned_at: new Date(at - 60_000).toISOString(),
        reason: "Unknown piece",
        employee_name: "Sara",
      }),
    ];
    const day = sewingSessionsDashboard(
      { updated_at: null, kiosk_arms: [], sessions: [] },
      at,
      { period: "day", failed_scans: failedScans, failed_scan_cap: 1 }
    );
    assert.equal(day.failed_scans_in_period, 2);
    assert.equal(day.failed_scans.length, 1);
    assert.equal(day.failed_scans[0]?.id, "f-today-2");

    const week = sewingSessionsDashboard(
      { updated_at: null, kiosk_arms: [], sessions: [] },
      at,
      { period: "week", failed_scans: failedScans }
    );
    assert.equal(week.failed_scans_in_period, 3);
    assert.equal(week.failed_scans.length, 3);
  });
});

describe("buildSewingScanFailure", () => {
  it("builds a durable failure record with arm/session context", () => {
    const at = Date.parse("2026-08-01T12:00:00.000Z");
    const row = buildSewingScanFailure({
      raw_code: "EMP:999",
      reason: "Employee not found - scan your badge again.",
      reason_code: "employee_not_found",
      scan_kind: "badge",
      kiosk_id: "laptop-3",
      workstation_id: "PL-1-1",
      arm_employee_id: "e2",
      arm_employee_name: "Sara",
      phase: "identity_armed",
      source: "api",
      now: at,
    });
    assert.equal(row.kiosk_id, "laptop-3");
    assert.equal(row.scan_kind, "badge");
    assert.equal(row.reason_code, "employee_not_found");
    assert.equal(row.arm_employee_name, "Sara");
    assert.equal(row.scanned_at, new Date(at).toISOString());
    assert.equal(row.source, "api");
    assert.ok(row.id.startsWith("sew-fail-"));
  });
});

describe("pruneSewingScanFailures", () => {
  it("drops rows older than retention days and enforces max rows", () => {
    const at = Date.parse("2026-08-01T12:00:00.000Z");
    const dayMs = 24 * 60 * 60 * 1000;
    const rows: SewingScanFailure[] = [
      failure({
        id: "keep",
        scanned_at: new Date(at - 2 * dayMs).toISOString(),
        reason: "Recent",
      }),
      failure({
        id: "drop-old",
        scanned_at: new Date(
          at - (SEWING_SCAN_FAILURE_RETENTION_DAYS + 1) * dayMs
        ).toISOString(),
        reason: "Too old",
      }),
    ];
    const pruned = pruneSewingScanFailures(rows, at);
    assert.equal(pruned.length, 1);
    assert.equal(pruned[0]?.id, "keep");

    const many = Array.from({ length: SEWING_SCAN_FAILURE_MAX_ROWS + 25 }, (_, i) =>
      failure({
        id: `f${i}`,
        scanned_at: new Date(at - i * 1000).toISOString(),
        reason: `r${i}`,
      })
    );
    const capped = pruneSewingScanFailures(many, at);
    assert.equal(capped.length, SEWING_SCAN_FAILURE_MAX_ROWS);
    assert.equal(capped[0]?.id, "f0");
  });
});

describe("sewingFailedScansForPeriod", () => {
  it("filters by period and sorts newest first", () => {
    const at = new Date(2026, 7, 1, 15, 0, 0, 0).getTime();
    const rows = [
      failure({
        id: "a",
        scanned_at: new Date(at - 10_000).toISOString(),
        reason: "a",
      }),
      failure({
        id: "b",
        scanned_at: new Date(at - 1000).toISOString(),
        reason: "b",
      }),
      failure({
        id: "c",
        scanned_at: new Date(2026, 6, 2, 9, 0, 0, 0).toISOString(),
        reason: "c",
      }),
    ];
    const listed = sewingFailedScansForPeriod(rows, at, { period: "day" });
    assert.deepEqual(
      listed.map((row) => row.id),
      ["b", "a"]
    );
  });
});

function empArm(
  partial: Partial<SewingKioskArm> & Pick<SewingKioskArm, "employee_id" | "employee_name">
): SewingKioskArm {
  return {
    kiosk_id: "k1",
    employee_id_number: "100",
    workstation_id: null,
    armed_at: new Date().toISOString(),
    ...partial,
  };
}

function pieceArm(
  partial: Partial<SewingKioskPieceArm> & Pick<SewingKioskPieceArm, "production_code">
): SewingKioskPieceArm {
  return {
    kiosk_id: "k1",
    scan_code: partial.production_code,
    so_number: null,
    piece_mark: null,
    fabric_cut_code: null,
    client_name: null,
    garment_type: null,
    fabric_number: null,
    work_order_id: null,
    armed_at: new Date().toISOString(),
    ...partial,
  };
}

describe("blind-floor stitch scan recovery", () => {
  it("A4 then badge -> session starts (piece-first)", () => {
    const at = "2026-08-01T12:00:00.000Z";
    let store: SewingSessionsFile = {
      updated_at: null,
      kiosk_arms: [],
      kiosk_piece_arms: [],
      sessions: [],
    };

    assert.equal(decidePieceStart(store, "k1").type, "arm_piece");
    const pending = pieceArm({ production_code: "FR-PIECE-1", scan_code: "FR-PIECE-1", armed_at: at });
    store = applyPieceArm(store, pending);
    assert.equal(store.kiosk_piece_arms?.length, 1);

    const badge = decideBadgeScan(store, "k1", "e1");
    assert.equal(badge.type, "start_with_piece_arm");
    if (badge.type !== "start_with_piece_arm") return;

    const started = session({
      id: "sew-1",
      employee_id: "e1",
      employee_name: "Ali",
      production_code: badge.piece_arm.production_code,
      scan_code: badge.piece_arm.scan_code,
      status: "open",
      started_at: at,
    });
    store = applyStartFromPieceArm(store, "k1", badge.piece_arm, started);
    assert.equal(store.sessions.length, 1);
    assert.equal(store.sessions[0]?.employee_id, "e1");
    assert.equal(store.sessions[0]?.production_code, "FR-PIECE-1");
    assert.equal(store.kiosk_piece_arms?.length, 0);
  });

  it("badge while open -> enters closing; matching A4 closes", () => {
    const at = "2026-08-01T12:00:00.000Z";
    const open = session({
      id: "s-open",
      employee_id: "e1",
      employee_name: "Ali",
      production_code: "FR-OPEN",
      scan_code: "FR-OPEN",
      status: "open",
      started_at: at,
    });
    let store: SewingSessionsFile = {
      updated_at: null,
      kiosk_arms: [],
      kiosk_piece_arms: [],
      sessions: [open],
    };

    const badge = decideBadgeScan(store, "k1", "e1");
    assert.equal(badge.type, "enter_closing_badge_first");
    if (badge.type !== "enter_closing_badge_first") return;

    store = applyBadgeFirstClosing(store, badge.session, at);
    assert.equal(store.sessions[0]?.status, "closing");
    assert.equal(store.sessions[0]?.closing_confirm, "piece");

    const closing = store.sessions[0]!;
    const closed = session({
      ...closing,
      status: "closed",
      ended_at: at,
      duration_sec: 0,
      closing_armed_at: null,
      closing_confirm: null,
    });
    store = applyCloseSession(store, closing, closed);
    assert.equal(store.sessions[0]?.status, "closed");
  });

  it("A4 with one employee arm -> start (happy path)", () => {
    const arm = empArm({ employee_id: "e1", employee_name: "Ali" });
    let store: SewingSessionsFile = {
      updated_at: null,
      kiosk_arms: [arm],
      kiosk_piece_arms: [],
      sessions: [],
    };
    const decision = decidePieceStart(store, "k1");
    assert.equal(decision.type, "start_with_employee_arm");
    if (decision.type !== "start_with_employee_arm") return;

    const started = session({
      id: "sew-happy",
      employee_id: arm.employee_id,
      employee_name: arm.employee_name,
      production_code: "FR-HAPPY",
      scan_code: "FR-HAPPY",
      status: "open",
    });
    store = applyStartFromEmployeeArm(store, "k1", decision.arm, started);
    assert.equal(store.sessions.length, 1);
    assert.equal(store.kiosk_arms.length, 0);
    assert.equal(store.sessions[0]?.production_code, "FR-HAPPY");
  });

  it("3 EMP ready -> A4 starts use mostRecentArm (original queue, not reject)", () => {
    const t0 = "2026-08-02T17:18:25.000Z";
    const t1 = "2026-08-02T17:18:27.000Z";
    const t2 = "2026-08-02T17:18:30.000Z";
    let store: SewingSessionsFile = {
      updated_at: null,
      kiosk_arms: [
        empArm({
          employee_id: "e-imran",
          employee_name: "Imran",
          employee_id_number: "200",
          armed_at: t1,
        }),
        empArm({
          employee_id: "e-adnan",
          employee_name: "Adnan",
          employee_id_number: "100",
          armed_at: t0,
        }),
        empArm({
          employee_id: "e-kashif",
          employee_name: "Kashif",
          employee_id_number: "300",
          armed_at: t2,
        }),
      ],
      kiosk_piece_arms: [],
      sessions: [],
    };

    // Regression guard: 09033b3 rejected multi-arm; original 2ac1d24 used mostRecentArm.
    assert.equal(mostRecentArm(store, "k1")?.employee_id, "e-kashif");
    assert.notEqual(decidePieceStart(store, "k1").type, "reject_ambiguous_employee_arms");

    const order: string[] = [];
    for (const code of ["FR-L04", "FR-L02", "FR-L06"] as const) {
      const decision = decidePieceStart(store, "k1");
      assert.equal(decision.type, "start_with_employee_arm");
      if (decision.type !== "start_with_employee_arm") return;
      order.push(decision.arm.employee_id);
      const started = session({
        id: `sew-${code}`,
        employee_id: decision.arm.employee_id,
        employee_name: decision.arm.employee_name,
        production_code: code,
        scan_code: code,
        status: "open",
        started_at: decision.arm.armed_at,
      });
      store = applyStartFromEmployeeArm(store, "k1", decision.arm, started);
    }

    // Newest armed first (badge-then-piece at shared scanner).
    assert.deepEqual(order, ["e-kashif", "e-imran", "e-adnan"]);
    assert.equal(store.kiosk_arms.length, 0);
    assert.equal(store.sessions.length, 3);
  });

  it("closing / open piece match is not blocked by other ready EMPs", () => {
    const openAshraf = session({
      id: "sew-ashraf",
      employee_id: "e-ashraf",
      employee_name: "Ashraf",
      production_code: "FR-0129-L06-TR-2/2",
      scan_code: "FR-0129-L06-TR-2/2",
      status: "open",
    });
    const store: SewingSessionsFile = {
      updated_at: null,
      kiosk_arms: [
        empArm({
          employee_id: "e-adnan",
          employee_name: "Adnan",
          armed_at: "2026-08-02T17:18:25.000Z",
        }),
        empArm({
          employee_id: "e-kashif",
          employee_name: "Kashif",
          employee_id_number: "300",
          armed_at: "2026-08-02T17:18:30.000Z",
        }),
      ],
      kiosk_piece_arms: [],
      sessions: [openAshraf],
    };

    // Kiosk matches open/closing piece before arm start (same order as processSewingKioskScan).
    const pieceCode = "FR-0129-L06-TR-2/2";
    const matched =
      openSessionsOnKiosk(store, "k1").find(
        (row) =>
          productionCodesMatch(row.production_code, pieceCode) ||
          productionCodesMatch(row.scan_code, pieceCode)
      ) ?? null;
    assert.equal(matched?.id, "sew-ashraf");
    assert.equal(matched?.employee_id, "e-ashraf");

    // Without a piece match, start would go to most recent ready EMP (Kashif).
    const startIfNoMatch = decidePieceStart(store, "k1");
    assert.equal(startIfNoMatch.type, "start_with_employee_arm");
    if (startIfNoMatch.type === "start_with_employee_arm") {
      assert.equal(startIfNoMatch.arm.employee_id, "e-kashif");
    }
  });

  it("most recent ready EMP with open piece is rejected (original behavior)", () => {
    const store: SewingSessionsFile = {
      updated_at: null,
      kiosk_arms: [
        empArm({
          employee_id: "e1",
          employee_name: "Ali",
          armed_at: "2026-08-02T17:00:00.000Z",
        }),
        empArm({
          employee_id: "e2",
          employee_name: "Sara",
          employee_id_number: "200",
          armed_at: "2026-08-02T17:00:01.000Z",
        }),
      ],
      kiosk_piece_arms: [],
      sessions: [
        session({
          id: "open-sara",
          employee_id: "e2",
          employee_name: "Sara",
          production_code: "FR-OPEN-SARA",
          status: "open",
        }),
      ],
    };
    const decision = decidePieceStart(store, "k1");
    assert.equal(decision.type, "reject_employee_has_open_piece");
    if (decision.type !== "reject_employee_has_open_piece") return;
    assert.equal(decision.arm.employee_id, "e2");
  });

  it("badge then A4 with a second ready EMP still assigns to most recent badge", () => {
    // Floor pattern: Adnan badges, Imran badges, Imran scans A4 -> Imran starts.
    const store: SewingSessionsFile = {
      updated_at: null,
      kiosk_arms: [
        empArm({
          employee_id: "e-adnan",
          employee_name: "Adnan",
          armed_at: "2026-08-02T17:18:25.000Z",
        }),
        empArm({
          employee_id: "e-imran",
          employee_name: "Imran",
          employee_id_number: "200",
          armed_at: "2026-08-02T17:18:27.000Z",
        }),
      ],
      kiosk_piece_arms: [],
      sessions: [],
    };
    const decision = decidePieceStart(store, "k1");
    assert.equal(decision.type, "start_with_employee_arm");
    if (decision.type !== "start_with_employee_arm") return;
    assert.equal(decision.arm.employee_id, "e-imran");
    assert.notEqual(decision.type, "reject_ambiguous_employee_arms");
  });

  it("expires stale piece arms with the 30s arm timeout", () => {
    const at = Date.parse("2026-08-01T12:00:00.000Z");
    const store: SewingSessionsFile = {
      updated_at: null,
      kiosk_arms: [],
      kiosk_piece_arms: [
        pieceArm({
          production_code: "FR-OLD",
          armed_at: new Date(at - SEWING_ARM_TIMEOUT_MS - 1).toISOString(),
        }),
        pieceArm({
          production_code: "FR-FRESH",
          armed_at: new Date(at - 1000).toISOString(),
        }),
      ],
      sessions: [],
    };
    const next = expireStaleSewingState(store, at);
    assert.equal(next.kiosk_piece_arms?.length, 1);
    assert.equal(next.kiosk_piece_arms?.[0]?.production_code, "FR-FRESH");
  });

  it("unknown / empty failure reasons still build durable log rows", () => {
    const empty = buildSewingScanFailure({
      raw_code: "",
      reason: "Empty scan.",
      reason_code: "empty_scan",
      scan_kind: "unknown",
      kiosk_id: "k1",
      phase: "idle",
      now: Date.parse("2026-08-01T12:00:00.000Z"),
    });
    assert.equal(empty.reason_code, "empty_scan");
    assert.equal(empty.scan_kind, "unknown");

    const unknown = buildSewingScanFailure({
      raw_code: "ZZZ-NOT-A-PIECE",
      reason:
        "Code not recognized: ZZZ-NOT-A-PIECE. Stitch accepts EMP badge (EMP:{id}) or production A4 piece QR (e.g. FR-0132-L07-JKT-1/2).",
      reason_code: "piece_not_recognized",
      scan_kind: "piece",
      kiosk_id: "k1",
      phase: "idle",
      now: Date.parse("2026-08-01T12:00:01.000Z"),
    });
    assert.equal(unknown.reason_code, "piece_not_recognized");
    assert.equal(unknown.raw_code, "ZZZ-NOT-A-PIECE");
    assert.match(unknown.reason, /Code not recognized: ZZZ-NOT-A-PIECE/);
  });

  it("multiple open sessions for one employee reject badge-first close", () => {
    const store: SewingSessionsFile = {
      updated_at: null,
      kiosk_arms: [],
      kiosk_piece_arms: [],
      sessions: [
        session({
          id: "a",
          employee_id: "e1",
          employee_name: "Ali",
          production_code: "FR-A",
          status: "open",
        }),
        session({
          id: "b",
          employee_id: "e1",
          employee_name: "Ali",
          production_code: "FR-B",
          status: "open",
        }),
      ],
    };
    const decision = decideBadgeScan(store, "k1", "e1");
    assert.equal(decision.type, "reject_multi_open");
  });
});
