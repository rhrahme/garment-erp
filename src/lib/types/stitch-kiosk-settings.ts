/** Runtime ops controls for the stitch floor kiosk (admin-pausable). */
export type StitchKioskSettingsFile = {
  updated_at: string | null;
  /** When true, badge/A4 scans are rejected until an admin resumes. */
  paused: boolean;
  paused_at: string | null;
  paused_by: string | null;
  resumed_at: string | null;
  resumed_by: string | null;
};

export const EMPTY_STITCH_KIOSK_SETTINGS: StitchKioskSettingsFile = {
  updated_at: null,
  paused: false,
  paused_at: null,
  paused_by: null,
  resumed_at: null,
  resumed_by: null,
};
