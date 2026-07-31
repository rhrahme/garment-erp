/** Factory job roles that can be assigned to payroll employees (multi-select). */
export const EMPLOYEE_JOB_FUNCTIONS = [
  "jacket_tailor",
  "trouser_tailor",
  "vest_tailor",
  "shorts_tailor",
  "shirt_tailor",
  "polo_tailor",
  "tshirt_tailor",
  "overshirt_tailor",
  "overcoat_tailor",
  "thobe_tailor",
  "boxer_tailor",
  "cutter",
  "wash_iron",
  "buttons",
  "qc",
  "pattern",
  "cleaner",
] as const;

export type EmployeeJobFunction = (typeof EMPLOYEE_JOB_FUNCTIONS)[number];

export const EMPLOYEE_JOB_FUNCTION_LABELS: Record<EmployeeJobFunction, string> = {
  jacket_tailor: "Jacket tailor",
  trouser_tailor: "Trouser tailor",
  vest_tailor: "Vest tailor",
  shorts_tailor: "Shorts tailor",
  shirt_tailor: "Shirt tailor",
  polo_tailor: "Polo tailor",
  tshirt_tailor: "T-shirt tailor",
  overshirt_tailor: "Overshirt tailor",
  overcoat_tailor: "Overcoat tailor",
  thobe_tailor: "Thobe tailor",
  boxer_tailor: "Boxer tailor",
  cutter: "Cutter",
  wash_iron: "Wash / iron",
  buttons: "Buttons",
  qc: "QC",
  pattern: "Pattern",
  cleaner: "Cleaner",
};

/**
 * Accept legacy / alternate keys from saved employee records and map to canonical roles.
 * Shirt LS/SS are not separate roles -- both alias to shirt_tailor.
 */
const JOB_FUNCTION_ALIASES: Record<string, EmployeeJobFunction> = {
  shirt: "shirt_tailor",
  shirt_ls_tailor: "shirt_tailor",
  shirt_ss_tailor: "shirt_tailor",
  short_tailor: "shorts_tailor",
  short: "shorts_tailor",
  shorts: "shorts_tailor",
  t_shirt_tailor: "tshirt_tailor",
  "t-shirt_tailor": "tshirt_tailor",
  overshirt: "overshirt_tailor",
  boxer: "boxer_tailor",
  vest: "vest_tailor",
  polo: "polo_tailor",
  overcoat: "overcoat_tailor",
  jacket: "jacket_tailor",
  trouser: "trouser_tailor",
  thobe: "thobe_tailor",
};

const JOB_FUNCTION_SET = new Set<string>(EMPLOYEE_JOB_FUNCTIONS);

export function isEmployeeJobFunction(value: string): value is EmployeeJobFunction {
  return JOB_FUNCTION_SET.has(value);
}

function resolveJobFunction(value: string): EmployeeJobFunction | null {
  if (isEmployeeJobFunction(value)) return value;
  return JOB_FUNCTION_ALIASES[value] ?? null;
}

/** Deduplicate, drop unknown values, keep catalog order. Accepts legacy aliases. */
export function normalizeJobFunctions(values: unknown): EmployeeJobFunction[] {
  if (!Array.isArray(values)) return [];
  const selected = new Set<EmployeeJobFunction>();
  for (const value of values) {
    if (typeof value !== "string") continue;
    const resolved = resolveJobFunction(value);
    if (resolved) selected.add(resolved);
  }
  return EMPLOYEE_JOB_FUNCTIONS.filter((fn) => selected.has(fn));
}

export function formatJobFunctionsSummary(values: readonly string[]): string {
  const normalized = normalizeJobFunctions(values);
  if (normalized.length === 0) return "Select roles...";
  if (normalized.length === 1) return EMPLOYEE_JOB_FUNCTION_LABELS[normalized[0]!];
  if (normalized.length <= 2) {
    return normalized.map((fn) => EMPLOYEE_JOB_FUNCTION_LABELS[fn]).join(", ");
  }
  return `${normalized.length} roles`;
}
