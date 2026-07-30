"use client";

import { useCallback, useEffect, useState } from "react";
import { FABRIC_SPEC_PRICES_VISIBLE_SESSION_KEY } from "@/lib/auth/fabric-price.constants";

/** Admin Fabric Specification - prices visible by default; eye toggle persists in sessionStorage. */
export function useFabricSpecPricesVisibility(defaultVisible = true) {
  const [visible, setVisible] = useState(defaultVisible);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = sessionStorage.getItem(FABRIC_SPEC_PRICES_VISIBLE_SESSION_KEY);
    if (stored === "1") {
      setVisible(true);
    } else if (stored === "0") {
      setVisible(false);
    } else {
      setVisible(defaultVisible);
    }
    setHydrated(true);
  }, [defaultVisible]);

  const unlock = useCallback(() => {
    sessionStorage.setItem(FABRIC_SPEC_PRICES_VISIBLE_SESSION_KEY, "1");
    setVisible(true);
  }, []);

  const lock = useCallback(() => {
    sessionStorage.setItem(FABRIC_SPEC_PRICES_VISIBLE_SESSION_KEY, "0");
    setVisible(false);
  }, []);

  return { visible, hydrated, unlock, lock };
}
