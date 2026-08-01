"use client";

import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef } from "react";

/**
 * Leaving a page always re-locks money/prices.
 * Clears the path-scoped unlock cookie so soft App Router navigations cannot
 * carry reveal state onto the next route.
 */
export function PriceRevealLockOnNavigate() {
  const pathname = usePathname();
  const previousPath = useRef<string | null>(null);

  useLayoutEffect(() => {
    if (previousPath.current === null) {
      previousPath.current = pathname;
      return;
    }
    if (previousPath.current === pathname) return;
    previousPath.current = pathname;
    void fetch("/api/auth/fabric-prices/lock", {
      method: "POST",
      credentials: "same-origin",
    }).catch(() => {
      /* lock is best-effort; path-scoped cookie still fails on other pages */
    });
  }, [pathname]);

  return null;
}
