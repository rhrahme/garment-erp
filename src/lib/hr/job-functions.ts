/** Factory job roles that can be assigned to payroll employees (multi-select). */
export const EMPLOYEE_JOB_FUNCTIONS = [
  "jacket_tailor",
  "trouser_tailor",
  "shirt_tailor",
  "thobe_tailor",
  "cutter",
  "wash_iron",
  "buttons",
  "qc",
  "pattern",
] as const;

export type EmployeeJobFunction = (typeof EMPLOYEE_JOB_FUNCTIONS)[number];

export const EMPLOYEE_JOB_FUNCTION_LABELS: Record<EmployeeJobFunction, string> = {
  jacket_tailor: "Jacket tailor",
  trouser_tailor: "Trouser tailor",
  shirt_tailor: "Shirt tailor",
  thobe_tailor: "Thobe tailor",
  cutter: "Cutter",
  wash_iron: "Wash / iron",
  buttons: "Buttons",
  qc: "QC",
  pattern: "Pattern",
};

const JOB_FUNCTION_SET = new Set<string>(EMPLOYEE_JOB_FUNCTIONS);

export function isEmployeeJobFunction(value: string): value is EmployeeJobFunction {
  return JOB_FUNCTION_SET.has(value);
}

/** Deduplicate, drop unknown values, keep catalog order. */
export function normalizeJobFunctions(values: unknown): EmployeeJobFunction[] {
  if (!Array.isArray(values)) return [];
  const selected = new Set<string>();
  for (const value of values) {
    if (typeof value === "string" && isEmployeeJobFunction(value)) {
      selected.add(value);
    }
  }
  return EMPLOYEE_JOB_FUNCTIONS.filter((fn) => selected.has(fn));
}

export function formatJobFunctionsSummary(values: readonly string[]): string {
  const normalized = normalizeJobFunctions(values);
  if (normalized.length === 0) return "Select roles…";
  if (normalized.length === 1) return EMPLOYEE_JOB_FUNCTION_LABELS[normalized[0]!];
  if (normalized.length <= 2) {
    return normalized.map((fn) => EMPLOYEE_JOB_FUNCTION_LABELS[fn]).join(", ");
  }
  return `${normalized.length} roles`;
}
