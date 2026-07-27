"use client";

import { useCallback, useEffect, useState } from "react";
import { INVOICE_AMOUNTS_UNLOCK_SESSION_KEY } from "@/lib/auth/invoice-amounts-access";

export function useInvoiceAmountsVisibility(defaultVisible = false) {
  const [visible, setVisible] = useState(defaultVisible);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = sessionStorage.getItem(INVOICE_AMOUNTS_UNLOCK_SESSION_KEY);
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
    sessionStorage.setItem(INVOICE_AMOUNTS_UNLOCK_SESSION_KEY, "1");
    setVisible(true);
  }, []);

  const lock = useCallback(() => {
    sessionStorage.setItem(INVOICE_AMOUNTS_UNLOCK_SESSION_KEY, "0");
    setVisible(false);
  }, []);

  return { visible, hydrated, unlock, lock };
}
