"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import type { FabricLinePrintKind } from "@/lib/sales-orders/fabric-lines";
import { PRINTING_FREE } from "@/lib/sales-orders/print-mode";

export function useMarkFabricLinesPrinted(
  orderId: string,
  printFn: (onAfterPrint?: () => void) => void = (onAfterPrint) => {
    if (onAfterPrint) window.addEventListener("afterprint", onAfterPrint, { once: true });
    window.print();
  }
) {
  const router = useRouter();

  const markPrinted = useCallback(
    async (kind: FabricLinePrintKind, lineIds: string[]) => {
      if (lineIds.length === 0) return;
      try {
        await fetch(`/api/sales-orders/${orderId}/fabric-lines/print`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind, line_ids: lineIds }),
        });
        router.refresh();
      } catch {
        /* non-blocking — print already happened */
      }
    },
    [orderId, router]
  );

  const printWithMark = useCallback(
    (
      marks: Array<{ kind: FabricLinePrintKind; lineIds: string[] }>,
      onPrinted?: () => void,
      printOverride?: (onAfterPrint?: () => void) => void
    ) => {
      const pending = marks.filter((mark) => mark.lineIds.length > 0);
      const print = printOverride ?? printFn;

      const onAfterPrint = () => {
        onPrinted?.();
        if (!PRINTING_FREE && pending.length > 0) {
          void Promise.all(pending.map((mark) => markPrinted(mark.kind, mark.lineIds)));
        }
      };

      print(onAfterPrint);
    },
    [markPrinted, printFn]
  );

  return { markPrinted, printWithMark };
}
