import type { PatternJobStatus } from "@/lib/types/pattern";

/** Pattern-floor stations - same manufacturing QR payloads as production stickers. */
export const PATTERN_SCAN_STATIONS = [
  "pattern_tud_ready",
  "pattern_sheet_filled",
  "pattern_handed_to_cut",
  "pattern_trial_done",
] as const;

export type PatternScanStation = (typeof PATTERN_SCAN_STATIONS)[number];

export function isPatternScanStation(station: string): station is PatternScanStation {
  return (PATTERN_SCAN_STATIONS as readonly string[]).includes(station);
}

const TERMINAL: PatternJobStatus[] = ["completed", "blocked", "cancelled"];

export type PatternScanTransition =
  | { kind: "advance"; status: PatternJobStatus; message: string }
  | { kind: "check_in"; message: string }
  | { kind: "reject"; message: string };

/** Pure status transition map for Pattern manufacturing QR scans. */
export function planPatternScan(
  station: PatternScanStation,
  status: PatternJobStatus
): PatternScanTransition {
  if (TERMINAL.includes(status)) {
    return {
      kind: "reject",
      message: `Pattern job is ${status.replace(/_/g, " ")} - cannot scan.`,
    };
  }

  switch (station) {
    case "pattern_tud_ready": {
      if (status === "pending" || status === "assigned" || status === "revising") {
        return {
          kind: "advance",
          status: "drafting",
          message: "TUD ready - pattern job moved to drafting.",
        };
      }
      if (status === "drafting") {
        return { kind: "check_in", message: "Checked in - TUD already marked ready (drafting)." };
      }
      return {
        kind: "check_in",
        message: `Checked in - currently ${status.replace(/_/g, " ")} (TUD scan recorded).`,
      };
    }
    case "pattern_sheet_filled": {
      if (
        status === "pending" ||
        status === "assigned" ||
        status === "drafting" ||
        status === "revising"
      ) {
        return {
          kind: "advance",
          status: "awaiting_fitting",
          message: "Measurement sheet filled - awaiting fitting.",
        };
      }
      if (status === "awaiting_fitting") {
        return {
          kind: "check_in",
          message: "Checked in - measurement sheet already marked filled (awaiting fitting).",
        };
      }
      return {
        kind: "check_in",
        message: `Checked in - currently ${status.replace(/_/g, " ")} (sheet-filled scan recorded).`,
      };
    }
    case "pattern_handed_to_cut": {
      if (status === "ready_for_cutting") {
        return {
          kind: "check_in",
          message: "Checked in - already ready for cutting (sheet handed off).",
        };
      }
      return {
        kind: "advance",
        status: "ready_for_cutting",
        message: "Size sheet handed to cut - pattern job ready for cutting.",
      };
    }
    case "pattern_trial_done": {
      if (status === "revising") {
        return {
          kind: "advance",
          status: "drafting",
          message: "Trial updates done - pattern job back to drafting.",
        };
      }
      if (status === "drafting") {
        return {
          kind: "check_in",
          message: "Checked in - trial updates already applied (drafting).",
        };
      }
      return {
        kind: "check_in",
        message: `Checked in - currently ${status.replace(/_/g, " ")} (trial-done scan recorded).`,
      };
    }
    default:
      return { kind: "reject", message: "Unknown pattern station." };
  }
}

export function isTerminalPatternStatus(status: PatternJobStatus): boolean {
  return TERMINAL.includes(status);
}
