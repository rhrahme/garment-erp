import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyShortNamesToEmployeeAggregates,
  attachSewingSessionClientShortNames,
  attachSewingSessionJobFunctions,
  floorActivityInProgressLabel,
  floorActivityLabelFromJobFunctions,
  floorActivityNowLabel,
  floorActivitySessionStartedMessage,
  normalizeScanQrDisplay,
  sewingSessionClientDisplayName,
  sewingSessionEmployeeDisplayName,
  sewingSessionScanQrLabel,
  sewingSessionStatusLabel,
} from "@/lib/production/sewing-session-status-label";
import type { SewingSession } from "@/lib/types/sewing-sessions";

function session(partial: Partial<SewingSession> & Pick<SewingSession, "id" | "employee_id">): SewingSession {
  return {
    kiosk_id: "k1",
    employee_name: "Worker",
    employee_id_number: "1",
    production_code: "FR-A",
    scan_code: "FR-A",
    workstation_id: null,
    started_at: new Date().toISOString(),
    ended_at: null,
    duration_sec: null,
    status: "open",
    closing_armed_at: null,
    work_order_id: null,
    so_number: null,
    piece_mark: null,
    fabric_cut_code: null,
    client_name: null,
    ...partial,
  };
}

describe("floorActivityLabelFromJobFunctions", () => {
  it("maps cutter to Cutting and tailor to Sewing", () => {
    assert.equal(floorActivityLabelFromJobFunctions(["cutter"]), "Cutting");
    assert.equal(floorActivityLabelFromJobFunctions(["jacket_tailor"]), "Sewing");
    assert.equal(floorActivityLabelFromJobFunctions(["trouser_tailor", "cutter"]), "Sewing");
  });

  it("maps wash/iron, buttons, and other floor roles", () => {
    assert.equal(floorActivityLabelFromJobFunctions(["wash_iron"]), "Wash / iron");
    assert.equal(floorActivityLabelFromJobFunctions(["buttons"]), "Buttons");
    assert.equal(floorActivityLabelFromJobFunctions(["pattern"]), "Pattern");
    assert.equal(floorActivityLabelFromJobFunctions(["qc"]), "QC");
    assert.equal(floorActivityLabelFromJobFunctions(["cleaner"]), "Cleaning");
  });

  it("defaults unknown / empty roles to Sewing", () => {
    assert.equal(floorActivityLabelFromJobFunctions([]), "Sewing");
    assert.equal(floorActivityLabelFromJobFunctions(undefined), "Sewing");
  });
});

describe("sewingSessionStatusLabel", () => {
  it("keeps Closing/Closed/Abandoned; open uses job activity", () => {
    assert.equal(sewingSessionStatusLabel("closing", ["cutter"]), "Closing");
    assert.equal(sewingSessionStatusLabel("closed", ["cutter"]), "Closed");
    assert.equal(sewingSessionStatusLabel("abandoned", ["cutter"]), "Abandoned");
    assert.equal(sewingSessionStatusLabel("open", ["cutter"]), "Cutting");
    assert.equal(sewingSessionStatusLabel("open", ["shirt_tailor"]), "Sewing");
  });
});

describe("floorActivityInProgressLabel / Now / session started message", () => {
  it("builds Scan kiosk and Orders captions from badge jobs", () => {
    assert.equal(floorActivityInProgressLabel(["cutter"]), "Cutting in progress");
    assert.equal(floorActivityInProgressLabel(["overshirt_tailor"]), "Sewing in progress");
    assert.equal(
      floorActivityInProgressLabel([
        "trouser_tailor",
        "cutter",
        "wash_iron",
        "buttons",
      ]),
      "Sewing in progress"
    );
    assert.equal(floorActivityNowLabel(["cutter"]), "Cutting now");
    assert.equal(floorActivityNowLabel(["wash_iron"]), "Wash / iron now");
  });

  it("builds last-scan start lines from badge jobs (Ashraf cutter / Abdullah tailor)", () => {
    assert.equal(
      floorActivitySessionStartedMessage("Ashraf", ["cutter"], "FR-0129-L06-TR-2/2"),
      "Ashraf cutting FR-0129-L06-TR-2/2."
    );
    assert.equal(
      floorActivitySessionStartedMessage(
        "Abdullah",
        ["trouser_tailor", "cutter", "wash_iron", "buttons"],
        "FR-0129-L10-OS-1/2",
        "OS-1/2"
      ),
      "Abdullah sewing FR-0129-L10-OS-1/2 (OS-1/2)."
    );
  });
});

describe("sewingSessionEmployeeDisplayName", () => {
  it("prefers short_name and falls back to full employee_name", () => {
    assert.equal(
      sewingSessionEmployeeDisplayName({
        employee_name: "ASHRAF RAZA GAJJAN MASIH",
        employee_short_name: "Ashraf",
      }),
      "Ashraf"
    );
    assert.equal(
      sewingSessionEmployeeDisplayName({
        employee_name: "ASHRAF RAZA GAJJAN MASIH",
        employee_short_name: null,
      }),
      "ASHRAF RAZA GAJJAN MASIH"
    );
  });
});

describe("sewingSessionScanQrLabel", () => {
  it("shows scan_code, falling back to production_code", () => {
    assert.equal(
      sewingSessionScanQrLabel({
        scan_code: "FR-0626-0037-SO-2026-0131-L04-OS",
        production_code: "FR-OTHER",
      }),
      "FR-0626-0037-SO-2026-0131-L04-OS"
    );
    assert.equal(
      sewingSessionScanQrLabel({ scan_code: "", production_code: "FR-PIECE" }),
      "FR-PIECE"
    );
    assert.equal(sewingSessionScanQrLabel({ scan_code: "", production_code: "" }), "-");
  });

  it("collapses spaces around hyphens and slashes", () => {
    assert.equal(normalizeScanQrDisplay("FR - 8129 - L08 - TR - 2/2"), "FR-8129-L08-TR-2/2");
    assert.equal(
      sewingSessionScanQrLabel({
        scan_code: "FR - 8129 - L08 - TR - 2 / 2",
        production_code: "FR-OTHER",
      }),
      "FR-8129-L08-TR-2/2"
    );
  });
});

describe("sewingSessionClientDisplayName", () => {
  it("prefers client_short_name over full client_name", () => {
    assert.equal(
      sewingSessionClientDisplayName({
        client_name: "Abdel Aziz Fahd Al Ajlan",
        client_short_name: "Abdel Ajlan",
      }),
      "Abdel Ajlan"
    );
    assert.equal(
      sewingSessionClientDisplayName({
        client_name: "Abdel Aziz Fahd Al Ajlan",
        client_short_name: null,
      }),
      "Abdel Aziz Fahd Al Ajlan"
    );
  });
});

describe("attachSewingSessionClientShortNames", () => {
  it("joins first+last from matching client profiles", () => {
    const rows = attachSewingSessionClientShortNames(
      [
        session({
          id: "s1",
          employee_id: "e1",
          client_name: "Abdel Aziz Fahd Al Ajlan",
        }),
      ],
      [
        {
          first_name: "Abdel",
          middle_name: "Aziz Fahd Al",
          last_name: "Ajlan",
        },
      ]
    );
    assert.equal(rows[0]?.client_short_name, "Abdel Ajlan");
    assert.equal(sewingSessionClientDisplayName(rows[0]!), "Abdel Ajlan");
  });
});

describe("attachSewingSessionJobFunctions", () => {
  it("joins payroll roles and short names onto sessions for Live badges", () => {
    const rows = attachSewingSessionJobFunctions(
      [
        session({
          id: "s1",
          employee_id: "ashraf",
          employee_name: "ASHRAF RAZA GAJJAN MASIH",
        }),
      ],
      (id) =>
        id === "ashraf"
          ? { job_functions: ["cutter"], short_name: "Ashraf" }
          : null
    );
    assert.deepEqual(rows[0]?.job_functions, ["cutter"]);
    assert.equal(rows[0]?.employee_short_name, "Ashraf");
    assert.equal(sewingSessionEmployeeDisplayName(rows[0]!), "Ashraf");
    assert.equal(sewingSessionStatusLabel(rows[0]!.status, rows[0]!.job_functions), "Cutting");
  });
});

describe("applyShortNamesToEmployeeAggregates", () => {
  it("rewrites Performance employee_name to badge short name", () => {
    const rows = applyShortNamesToEmployeeAggregates(
      [
        {
          employee_id: "ashraf",
          employee_name: "ASHRAF RAZA GAJJAN MASIH",
          count: 2,
          duration_sec: 100,
          avg_duration_sec: 50,
          articles: ["Overshirt"],
        },
      ],
      (id) => (id === "ashraf" ? { short_name: "Ashraf" } : null)
    );
    assert.equal(rows[0]?.employee_name, "Ashraf");
  });
});
