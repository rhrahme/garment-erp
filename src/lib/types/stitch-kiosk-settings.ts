/** One kiosk pause window (lunch / admin stop). ended_at null while still paused. */
export type StitchKioskPauseInterval = {
  started_at: string;
  ended_at: string | null;
  paused_by?: string | null;
  resumed_by?: string | null;
};

/** Runtime ops controls for the stitch floor kiosk (admin-pausable). */
export type StitchKioskSettingsFile = {
  updated_at: string | null;
  /** When true, badge/A4 scans are rejected until an admin resumes. */
  paused: boolean;
  paused_at: string | null;
  paused_by: string | null;
  resumed_at: string | null;
  resumed_by: string | null;
  /**
   * When set, cron / scan heal resume the kiosk gate at this instant
   * (lunch = 16:00 Asia/Riyadh). Null for manual/emergency pauses.
   */
  auto_resume_at?: string | null;
  /**
   * Pause history used so Live elapsed freezes during lunch and does not
   * keep counting paused wall-clock time after resume.
   */
  pause_intervals?: StitchKioskPauseInterval[];
};

export const EMPTY_STITCH_KIOSK_SETTINGS: StitchKioskSettingsFile = {
  updated_at: null,
  paused: false,
  paused_at: null,
  paused_by: null,
  resumed_at: null,
  resumed_by: null,
  auto_resume_at: null,
  pause_intervals: [],
};
