"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import type { FabricLinePrintKind } from "@/lib/sales-orders/fabric-lines";
import { PRINTING_FREE } from "@/lib/sales-orders/print-mode";

export function useMarkFabricLinesPrinted(orderId: string) {
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
    (marks: Array<{ kind: FabricLinePrintKind; lineIds: string[] }>) => {
      if (PRINTING_FREE) {
        window.print();
        return;
      }

      const pending = marks.filter((mark) => mark.lineIds.length > 0);
      if (pending.length === 0) {
        window.print();
        return;
      }

      const onAfterPrint = () => {
        void Promise.all(pending.map((mark) => markPrinted(mark.kind, mark.lineIds)));
      };
      window.addEventListener("afterprint", onAfterPrint, { once: true });
      window.print();
    },
    [markPrinted]
  );

  return { markPrinted, printWithMark };
}
