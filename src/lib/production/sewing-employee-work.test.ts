import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  listSewingKioskEmployees,
  sewingEmployeeWorkLookup,
} from "@/lib/production/sewing-session-state";
import type { SewingSession, SewingSessionsFile } from "@/lib/types/sewing-sessions";

function session(
  partial: Partial<SewingSession> &
    Pick<SewingSession, "id" | "employee_id" | "employee_name" | "status">
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

describe("sewingEmployeeWorkLookup", () => {
  it("splits one employee's closed work into day / week / month", () => {
    const at = new Date(2026, 7, 1, 16, 0, 0, 0).getTime();
    const store: SewingSessionsFile = {
      updated_at: null,
      kiosk_arms: [],
      sessions: [
        session({
          id: "week1",
          employee_id: "e1",
          employee_name: "Ali",
          employee_id_number: "111",
          production_code: "FR-WEEK",
          garment_type: "Trouser",
          started_at: new Date(2026, 6, 29, 10, 0, 0, 0).toISOString(),
          ended_at: new Date(2026, 6, 29, 10, 20, 0, 0).toISOString(),
          duration_sec: 1200,
          status: "closed",
        }),
        session({
          id: "day1",
          employee_id: "e1",
          employee_name: "Ali",
          employee_id_number: "111",
          production_code: "FR-DAY",
          garment_type: "Trouser",
          started_at: new Date(at - 900_000).toISOString(),
          ended_at: new Date(at - 300_000).toISOString(),
          duration_sec: 600,
          status: "closed",
        }),
        session({
          id: "live1",
          employee_id: "e1",
          employee_name: "Ali",
          employee_id_number: "111",
          production_code: "FR-LIVE",
          garment_type: "Shirt",
          started_at: new Date(at - 60_000).toISOString(),
          status: "open",
        }),
        session({
          id: "other",
          employee_id: "e2",
          employee_name: "Sara",
          employee_id_number: "222",
          production_code: "FR-SARA",
          started_at: new Date(at - 400_000).toISOString(),
          ended_at: new Date(at - 100_000).toISOString(),
          duration_sec: 300,
          status: "closed",
        }),
        session({
          id: "rejected",
          employee_id: "e1",
          employee_name: "Ali",
          employee_id_number: "111",
          production_code: "FR-OT",
          started_at: new Date(at - 800_000).toISOString(),
          ended_at: new Date(at - 200_000).toISOString(),
          duration_sec: 900,
          status: "closed",
          overtime_status: "rejected",
        }),
      ],
    };

    const work = sewingEmployeeWorkLookup(store, "111", at);
    assert.ok(work);
    assert.equal(work.employee_id, "e1");
    assert.equal(work.day.count, 1);
    assert.equal(work.day.duration_sec, 600);
    assert.equal(work.day.open_sessions.length, 1);
    assert.equal(work.week.count, 2);
    assert.equal(work.week.duration_sec, 1800);
    assert.equal(work.month.count, 1);
    assert.ok(!work.day.sessions.some((row) => row.id === "rejected"));
    assert.ok(!work.day.sessions.some((row) => row.employee_id === "e2"));
  });

  it("lists kiosk employees by most recent activity", () => {
    const at = new Date(2026, 7, 1, 16, 0, 0, 0).getTime();
    const store: SewingSessionsFile = {
      updated_at: null,
      kiosk_arms: [],
      sessions: [
        session({
          id: "old",
          employee_id: "e2",
          employee_name: "Sara",
          employee_id_number: "222",
          started_at: new Date(at - 3_600_000).toISOString(),
          ended_at: new Date(at - 3_000_000).toISOString(),
          duration_sec: 600,
          status: "closed",
        }),
        session({
          id: "new",
          employee_id: "e1",
          employee_name: "Ali",
          employee_id_number: "111",
          started_at: new Date(at - 60_000).toISOString(),
          status: "open",
        }),
      ],
    };
    const list = listSewingKioskEmployees(store);
    assert.equal(list[0]?.employee_id, "e1");
    assert.equal(list[1]?.employee_id, "e2");
  });
});
