export type StitchAttendanceCheckIn = {
  employee_id: string;
  employee_name: string;
  employee_id_number: string;
  kiosk_id: string;
  scanned_at: string;
  /** Asia/Riyadh calendar day YYYY-MM-DD. */
  workday: string;
};

export type StitchAttendanceFile = {
  updated_at: string | null;
  check_ins: StitchAttendanceCheckIn[];
};
