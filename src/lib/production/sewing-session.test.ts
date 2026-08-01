import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  expireStaleSewingState,
  SEWING_ARM_TIMEOUT_MS,
  sewingSessionsDashboard,
} from "@/lib/production/sewing-session-state";
import type { SewingSessionsFile } from "@/lib/types/sewing-sessions";

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
        {
          id: "s1",
          kiosk_id: "k1",
          employee_id: "e1",
          employee_name: "Ali",
          employee_id_number: "100",
          production_code: "FR-0002-L33-SH",
          scan_code: "FR-0002-L33-SH",
          workstation_id: null,
          started_at: new Date(at - 120_000).toISOString(),
          ended_at: null,
          duration_sec: null,
          status: "closing",
          closing_armed_at: new Date(at - 31_000).toISOString(),
          work_order_id: null,
          so_number: "SO-2026-0002",
          piece_mark: "SH",
          fabric_cut_code: null,
          client_name: "Youssef",
        },
      ],
    };
    const next = expireStaleSewingState(store, at);
    assert.equal(next.sessions[0]?.status, "open");
    assert.equal(next.sessions[0]?.closing_armed_at, null);
  });
});

describe("sewingSessionsDashboard", () => {
  it("counts closed sessions today and lists open ones", () => {
    const at = Date.parse("2026-08-01T15:00:00.000Z");
    const store: SewingSessionsFile = {
      updated_at: null,
      kiosk_arms: [],
      sessions: [
        {
          id: "open1",
          kiosk_id: "k1",
          employee_id: "e1",
          employee_name: "Ali",
          employee_id_number: "100",
          production_code: "FR-A",
          scan_code: "FR-A",
          workstation_id: null,
          started_at: new Date(at - 60_000).toISOString(),
          ended_at: null,
          duration_sec: null,
          status: "open",
          closing_armed_at: null,
          work_order_id: null,
          so_number: null,
          piece_mark: null,
          fabric_cut_code: null,
          client_name: null,
        },
        {
          id: "done1",
          kiosk_id: "k2",
          employee_id: "e2",
          employee_name: "Sara",
          employee_id_number: "200",
          production_code: "FR-B",
          scan_code: "FR-B",
          workstation_id: null,
          started_at: new Date(at - 600_000).toISOString(),
          ended_at: new Date(at - 100_000).toISOString(),
          duration_sec: 500,
          status: "closed",
          closing_armed_at: null,
          work_order_id: null,
          so_number: null,
          piece_mark: null,
          fabric_cut_code: null,
          client_name: null,
        },
      ],
    };
    const dash = sewingSessionsDashboard(store, at);
    assert.equal(dash.open_sessions.length, 1);
    assert.equal(dash.closed_today, 1);
    assert.equal(dash.completed_by_employee[0]?.employee_name, "Sara");
    assert.equal(dash.completed_by_employee[0]?.count, 1);
  });
});
