/** Client-safe payroll salary masking constants - no Node/server imports. */

/** HR & Payroll page - admin eye toggle (sessionStorage). */
export const PAYROLL_SALARIES_VISIBLE_SESSION_KEY = "payroll_salaries_visible";

/** ASCII mask only - avoid fancy ellipsis/bullets that break some deploys. */
export const MASKED_SALARY_AMOUNT = "SAR ......";
