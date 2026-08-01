"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

/**
 * Admin fabric catalog / price-list UI - prices hidden by default.
 * Unlock is in-memory for the current page only; route changes re-lock.
 */
export function useFabricSpecPricesVisibility(defaultVisible = false) {
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
