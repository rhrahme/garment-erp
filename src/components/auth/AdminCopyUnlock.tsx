"use client";

import { useEffect } from "react";
import { ADMIN_COPY_UNLOCK_CLASS } from "@/lib/auth/admin-copy";

/** Lets admin select and copy ERP text. Other roles keep the floor scan-first behavior. */
export function AdminCopyUnlock({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    const root = document.documentElement;
    if (enabled) root.classList.add(ADMIN_COPY_UNLOCK_CLASS);
    else root.classList.remove(ADMIN_COPY_UNLOCK_CLASS);
    return () => {
      root.classList.remove(ADMIN_COPY_UNLOCK_CLASS);
    };
  }, [enabled]);
  return null;
}
