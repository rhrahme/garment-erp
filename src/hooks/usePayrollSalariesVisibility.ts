"use client";

import { useCallback, useEffect, useState } from "react";
import { PAYROLL_SALARIES_VISIBLE_SESSION_KEY } from "@/lib/auth/payroll-salary.constants";

/** HR Payroll register - salaries visible by default; eye toggle persists in sessionStorage. */
export function usePayrollSalariesVisibility(defaultVisible = true) {
  const [visible, setVisible] = useState(defaultVisible);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(PAYROLL_SALARIES_VISIBLE_SESSION_KEY);
      if (stored === "1") {
        setVisible(true);
      } else if (stored === "0") {
        setVisible(false);
      } else {
        setVisible(defaultVisible);
      }
    } catch {
      setVisible(defaultVisible);
    } finally {
      setHydrated(true);
    }
  }, [defaultVisible]);

  const unlock = useCallback(() => {
    try {
      sessionStorage.setItem(PAYROLL_SALARIES_VISIBLE_SESSION_KEY, "1");
    } catch {
      /* private mode / blocked storage - still update UI */
    }
    setVisible(true);
  }, []);

  const lock = useCallback(() => {
    try {
      sessionStorage.setItem(PAYROLL_SALARIES_VISIBLE_SESSION_KEY, "0");
    } catch {
      /* private mode / blocked storage - still update UI */
    }
    setVisible(false);
  }, []);

  return { visible, hydrated, unlock, lock };
}
