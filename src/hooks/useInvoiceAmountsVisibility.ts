"use client";

import { useCallback, useEffect, useState } from "react";
import { INVOICE_AMOUNTS_UNLOCK_SESSION_KEY } from "@/lib/auth/invoice-amounts-access";

export function useInvoiceAmountsVisibility() {
  const [visible, setVisible] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setVisible(sessionStorage.getItem(INVOICE_AMOUNTS_UNLOCK_SESSION_KEY) === "1");
    setHydrated(true);
  }, []);

  const unlock = useCallback(() => {
    sessionStorage.setItem(INVOICE_AMOUNTS_UNLOCK_SESSION_KEY, "1");
    setVisible(true);
  }, []);

  const lock = useCallback(() => {
    sessionStorage.removeItem(INVOICE_AMOUNTS_UNLOCK_SESSION_KEY);
    setVisible(false);
  }, []);

  return { visible, hydrated, unlock, lock };
}
