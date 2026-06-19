import { parseEmployeeQrPayload } from "@/lib/hr/employee-qr";

const SESSION_KEY = "garment-erp.scan-employee-session";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

export type ScanEmployeeSession = {
  employee_id: string;
  employee_name: string;
  employee_id_number: string;
  assigned_workstation_id: string | null;
  is_mobile_floater: boolean;
  workstation_override_id: string | null;
  logged_in_at: string;
  expires_at: string;
};

export function effectiveWorkstationId(session: ScanEmployeeSession): string | null {
  return session.workstation_override_id ?? session.assigned_workstation_id;
}

export function sessionNeedsWorkstationPick(session: ScanEmployeeSession): boolean {
  if (session.workstation_override_id) return false;
  return Boolean(session.is_mobile_floater) || !session.assigned_workstation_id;
}

export function readScanEmployeeSession(): ScanEmployeeSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as ScanEmployeeSession;
    if (!session.expires_at || Date.parse(session.expires_at) <= Date.now()) {
      window.localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export function writeScanEmployeeSession(session: ScanEmployeeSession): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearScanEmployeeSession(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SESSION_KEY);
}

export function createScanEmployeeSession(input: {
  employee_id: string;
  employee_name: string;
  employee_id_number: string;
  assigned_workstation_id: string | null;
  is_mobile_floater: boolean;
  workstation_override_id?: string | null;
}): ScanEmployeeSession {
  const now = Date.now();
  return {
    employee_id: input.employee_id,
    employee_name: input.employee_name,
    employee_id_number: input.employee_id_number,
    assigned_workstation_id: input.assigned_workstation_id,
    is_mobile_floater: input.is_mobile_floater,
    workstation_override_id: input.workstation_override_id ?? null,
    logged_in_at: new Date(now).toISOString(),
    expires_at: new Date(now + SESSION_TTL_MS).toISOString(),
  };
}

export function isEmployeeBadgeCode(raw: string): boolean {
  return parseEmployeeQrPayload(raw) !== null;
}
