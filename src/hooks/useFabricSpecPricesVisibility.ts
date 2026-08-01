"use client";

import { useCallback, useEffect, useState } from "react";
import { FABRIC_SPEC_PRICES_VISIBLE_SESSION_KEY } from "@/lib/auth/fabric-price.constants";

/**
 * Admin fabric catalog / price-list UI - prices hidden by default.
 * Eye toggle persists in sessionStorage so each browser session starts hidden.
 */
export function useFabricSpecPricesVisibility(defaultVisible = false) {
  const [visible, setVisible] = useState(defaultVisible);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(FABRIC_SPEC_PRICES_VISIBLE_SESSION_KEY);
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
      sessionStorage.setItem(FABRIC_SPEC_PRICES_VISIBLE_SESSION_KEY, "1");
    } catch {
      /* private mode / blocked storage - still update UI */
    }
    setVisible(true);
  }, []);

  const lock = useCallback(() => {
    try {
      sessionStorage.setItem(FABRIC_SPEC_PRICES_VISIBLE_SESSION_KEY, "0");
    } catch {
      /* private mode / blocked storage - still update UI */
    }
    setVisible(false);
  }, []);

  return { visible, hydrated, unlock, lock };
}
