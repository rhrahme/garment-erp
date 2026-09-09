import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  employeeExpectedOnStitchFloor,
  sewingFloorAttendance,
} from "@/lib/production/sewing-floor-dashboard";
import type { PayrollEmployee } from "@/lib/types/hr-payroll";
import type { SewingSession, SewingSessionsFile } from "@/lib/types/sewing-sessions";

function employee(partial: Partial<PayrollEmployee> & Pick<PayrollEmployee, "id" | "full_name">): PayrollEmployee {
  return {
    s_no: 1,
    employee_id_number: partial.employee_id_number ?? partial.id,
    bank_name: "Arab National Bank",
    account_number: "",
    salary_amount: 0,
    basic_salary: 0,
    housing_allowance: 0,
    other_earnings: 0,
    deduction: 0,
    payment_description: "",
    address_1: "",
    address_2: "",
    address_3: "",
    is_active: true,
    job_functions: ["trouser_tailor"],
    ...partial,
  };
}

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

describe("employeeExpectedOnStitchFloor", () => {
  it("includes active expats with floor, QC, Digital pattern, or cleaner jobs; skips saudi / inactive", () => {
    assert.equal(
      employeeExpectedOnStitchFloor(
        employee({ id: "e1", full_name: "Ali", job_functions: ["cutter"] })
      ),
      true
    );
    assert.equal(
      employeeExpectedOnStitchFloor(
        employee({
          id: "e2",
          full_name: "Sara",
          bank_name: "AL RAJHI BANK",
          job_functions: ["jacket_tailor"],
        })
      ),
      false
    );
    assert.equal(
      employeeExpectedOnStitchFloor(
        employee({ id: "e3", full_name: "Old", is_active: false })
      ),
      false
    );
    assert.equal(
      employeeExpectedOnStitchFloor(
        employee({ id: "e4", full_name: "Mohtajul", job_functions: ["pattern"] })
      ),
      true
    );
    assert.equal(
      employeeExpectedOnStitchFloor(
        employee({ id: "e4b", full_name: "Hossain", job_functions: ["qc"] })
      ),
      true
    );
    assert.equal(
      employeeExpectedOnStitchFloor(
        employee({ id: "e4c", full_name: "Mahmudul", job_functions: ["qc", "pattern"] })
      ),
      true
    );
    assert.equal(
      employeeExpectedOnStitchFloor(
        employee({
          id: "0027",
          full_name: "Md. Farid Hossain",
          short_name: "Farid",
          job_functions: ["jacket_tailor", "qc", "pattern"],
        })
      ),
      true
    );
    assert.equal(
      employeeExpectedOnStitchFloor(
        employee({ id: "e5", full_name: "Empty jobs", job_functions: [] })
      ),
      true
    );
    assert.equal(
      employeeExpectedOnStitchFloor(
        employee({ id: "e6", full_name: "Champa", job_functions: ["champa"] })
      ),
      true
    );
    assert.equal(
      employeeExpectedOnStitchFloor(
        employee({ id: "e7", full_name: "Washer", job_functions: ["washing"] })
      ),
      true
    );
  });
});

describe("sewingFloorAttendance", () => {
  it("lists who did not scan today and who did", () => {
    const at = new Date(2026, 7, 19, 12, 0, 0, 0).getTime();
    const roster = [
      employee({ id: "e1", full_name: "Haider", employee_id_number: "111", job_functions: ["trouser_tailor"] }),
      employee({ id: "e2", full_name: "Razzak", employee_id_number: "222", job_functions: ["jacket_tailor"] }),
      employee({
        id: "e3",
        full_name: "Ashraf",
        employee_id_number: "333",
        job_functions: ["cutter"],
        assigned_workstation_id: "PL-1-2",
      }),
    ];
    const store: SewingSessionsFile = {
      updated_at: null,
      kiosk_arms: [],
      sessions: [
        session({
          id: "s1",
          employee_id: "e1",
          employee_name: "Haider",
          employee_id_number: "111",
          started_at: new Date(at - 600_000).toISOString(),
          ended_at: new Date(at - 120_000).toISOString(),
          duration_sec: 480,
          status: "closed",
        }),
        session({
          id: "s2",
          employee_id: "e2",
          employee_name: "Razzak",
          employee_id_number: "222",
          started_at: new Date(at - 60_000).toISOString(),
          status: "open",
        }),
      ],
    };

    const dash = sewingFloorAttendance(store, roster, "day", at);
    assert.equal(dash.expected, 3);
    assert.equal(dash.scanned, 2);
    assert.equal(dash.entered, 0);
    assert.equal(dash.missing, 1);
    assert.equal(dash.live, 1);
    assert.equal(dash.missing_rows[0]?.employee_name, "Ashraf");
    assert.equal(dash.missing_rows[0]?.workstation_id, "PL-1-2");
    assert.equal(dash.scanned_rows.some((row) => row.employee_id === "e2" && row.live), true);
    assert.equal(dash.scanned_rows.find((row) => row.employee_id === "e1")?.count, 1);
  });

  it("counts a wall QR clock-in as present with 0 pieces", () => {
    const at = Date.parse("2026-09-08T08:00:00.000Z");
    const roster = [
      employee({ id: "e3", full_name: "Ashraf", employee_id_number: "333", job_functions: ["cutter"] }),
    ];
    const store: SewingSessionsFile = { updated_at: null, kiosk_arms: [], sessions: [] };
    const dash = sewingFloorAttendance(store, roster, "day", at, [
      {
        employee_id: "e3",
        employee_name: "Ashraf",
        employee_id_number: "333",
        kiosk_id: "k1",
        scanned_at: "2026-09-08T05:10:00.000Z",
        workday: "2026-09-08",
      },
    ]);
    assert.equal(dash.scanned, 1);
    assert.equal(dash.entered, 1);
    assert.equal(dash.left, 0);
    assert.equal(dash.missing, 0);
    assert.equal(dash.scanned_rows[0]?.count, 0);
    assert.ok(dash.scanned_rows[0]?.checked_in_at);
    assert.equal(dash.scanned_rows[0]?.checked_out_at, null);
  });

  it("shows an end-of-day wall QR checkout time", () => {
    const at = Date.parse("2026-09-08T16:00:00.000Z");
    const roster = [
      employee({ id: "e3", full_name: "Ashraf", employee_id_number: "333", job_functions: ["cutter"] }),
    ];
    const store: SewingSessionsFile = { updated_at: null, kiosk_arms: [], sessions: [] };
    const dash = sewingFloorAttendance(store, roster, "day", at, [
      {
        employee_id: "e3",
        employee_name: "Ashraf",
        employee_id_number: "333",
        kiosk_id: "k1",
        scanned_at: "2026-09-08T05:10:00.000Z",
        checked_out_at: "2026-09-08T14:05:00.000Z",
        workday: "2026-09-08",
      },
    ]);
    assert.equal(dash.entered, 1);
    assert.equal(dash.left, 1);
    assert.equal(dash.scanned_rows[0]?.checked_out_at, "2026-09-08T14:05:00.000Z");
  });

  it("ignores clock-ins from before the Riyadh go-live day", () => {
    const at = Date.parse("2026-09-07T18:00:00.000Z");
    const roster = [
      employee({ id: "e3", full_name: "Ashraf", employee_id_number: "333", job_functions: ["cutter"] }),
    ];
    const store: SewingSessionsFile = { updated_at: null, kiosk_arms: [], sessions: [] };
    const dash = sewingFloorAttendance(store, roster, "day", at, [
      {
        employee_id: "e3",
        employee_name: "Ashraf",
        employee_id_number: "333",
        kiosk_id: "k1",
        scanned_at: "2026-09-07T08:00:00.000Z",
        workday: "2026-09-07",
      },
    ]);
    assert.equal(dash.scanned, 0);
    assert.equal(dash.entered, 0);
    assert.equal(dash.missing, 1);
  });

  it("still counts a rejected overtime scan as present", () => {
    const at = new Date(2026, 7, 19, 23, 0, 0, 0).getTime();
    const roster = [
      employee({ id: "e1", full_name: "Ali", employee_id_number: "111" }),
    ];
    const store: SewingSessionsFile = {
      updated_at: null,
      kiosk_arms: [],
      sessions: [
        session({
          id: "ot",
          employee_id: "e1",
          employee_name: "Ali",
          employee_id_number: "111",
          started_at: new Date(at - 300_000).toISOString(),
          ended_at: new Date(at - 60_000).toISOString(),
          duration_sec: 240,
          status: "closed",
          overtime_status: "rejected",
        }),
      ],
    };
    const dash = sewingFloorAttendance(store, roster, "day", at);
    assert.equal(dash.missing, 0);
    assert.equal(dash.scanned, 1);
    assert.equal(dash.scanned_rows[0]?.count, 0);
  });

  it("puts Mahmudul, Mohtajul, Farid, and Hossain on the attendance roster", () => {
    const at = Date.parse("2026-09-09T08:00:00.000Z");
    const roster = [
      employee({
        id: "2587734852",
        full_name: "Mahmudul Hassan",
        short_name: "Mahmudul",
        employee_id_number: "2587734852",
        job_functions: ["qc", "pattern"],
      }),
      employee({
        id: "2625917972",
        full_name: "MD MOHTAJUL ISLAM",
        short_name: "Mohtajul",
        employee_id_number: "2625917972",
        job_functions: ["qc", "pattern"],
      }),
      employee({
        id: "0027",
        full_name: "Md. Farid Hossain",
        short_name: "Farid",
        employee_id_number: "0027",
        job_functions: ["jacket_tailor", "qc", "pattern"],
      }),
      employee({
        id: "2627130756",
        full_name: "Mohammed Sumon Shimon Hussain",
        short_name: "Hossain",
        employee_id_number: "2627130756",
        job_functions: ["qc"],
      }),
    ];
    const dash = sewingFloorAttendance(
      { updated_at: null, kiosk_arms: [], sessions: [] },
      roster,
      "day",
      at
    );
    assert.equal(dash.expected, 4);
    const names = [...dash.missing_rows, ...dash.scanned_rows].map((row) => row.employee_name);
    assert.ok(names.includes("Mahmudul"));
    assert.ok(names.includes("Mohtajul"));
    assert.ok(names.includes("Farid"));
    assert.ok(names.includes("Hossain"));
  });
});
