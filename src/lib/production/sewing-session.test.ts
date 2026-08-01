import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  expireStaleSewingState,
  SEWING_ARM_TIMEOUT_MS,
  sewingPeriodWindow,
  sewingSessionsDashboard,
} from "@/lib/production/sewing-session-state";
import type { SewingSession, SewingSessionsFile } from "@/lib/types/sewing-sessions";

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
});
