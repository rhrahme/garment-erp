"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

/**
 * Invoice / costing monetary fields - hidden by default.
 * Unlock is in-memory for the current page only; route changes re-lock.
 */
export function useInvoiceAmountsVisibility(defaultVisible = false) {
  const pathname = usePathname();
  const [visible, setVisible] = useState(defaultVisible);

  useEffect(() => {
    setVisible(defaultVisible);
  }, [pathname, defaultVisible]);

  const unlock = useCallback(() => {
    setVisible(true);
  }, []);

  const lock = useCallback(() => {
    setVisible(false);
  }, []);

  return { visible, hydrated: true as const, unlock, lock };
}
