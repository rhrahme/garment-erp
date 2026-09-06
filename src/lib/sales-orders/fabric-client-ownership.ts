import { readSalesOrders } from "@/lib/data/sales-orders";
import type { SalesOrder, SalesOrderFabricLine } from "@/lib/types/sales-orders";

export type FabricClientOwnership = {
  current_client_name: string;
  source_client_name: string | null;
  destination_client_name: string | null;
};

function cleanName(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

/** Readable client label, including transfer from/to when those names differ. */
export function formatFabricClientOwnership(input: {
  currentClientName?: string | null;
  sourceClientName?: string | null;
  destinationClientName?: string | null;
}): string {
  const current = cleanName(input.currentClientName);
  const source = cleanName(input.sourceClientName);
  const destination = cleanName(input.destinationClientName);

  if (source && current && source !== current) {
    return `${current} (from ${source})`;
  }
  if (destination && current && destination !== current) {
    return `${current} -> ${destination}`;
  }
  if (source && destination && source !== destination) {
    return `${source} -> ${destination}`;
  }
  return current || destination || source;
}

export function ownershipFromFabricLine(
  order: Pick<SalesOrder, "client_name">,
  line: Pick<SalesOrderFabricLine, "transfer_inbound" | "transfer_replacement">
): FabricClientOwnership {
  return {
    current_client_name: cleanName(order.client_name),
    source_client_name: cleanName(line.transfer_inbound?.source_client_name) || null,
    destination_client_name: cleanName(line.transfer_replacement?.destination_client_name) || null,
  };
}

function lineMatchesLookup(
  line: SalesOrderFabricLine,
  fabricNumber: string | null,
  productionCode: string | null
): boolean {
  if (fabricNumber && line.fabric_number.trim() === fabricNumber) return true;
  if (!productionCode) return false;
  const needle = productionCode.trim().toUpperCase();
  return (line.label_stickers ?? []).some((sticker) => sticker.code.toUpperCase().includes(needle));
}

/** Resolve current + transfer client names for a fabric on an SO (dashboard / approvals). */
export function findFabricClientOwnership(input: {
  soNumber?: string | null;
  fabricNumber?: string | null;
  productionCode?: string | null;
  fallbackClientName?: string | null;
}): FabricClientOwnership {
  const fallback = cleanName(input.fallbackClientName);
  const soNumber = cleanName(input.soNumber);
  if (!soNumber) {
    return {
      current_client_name: fallback,
      source_client_name: null,
      destination_client_name: null,
    };
  }

  try {
    const order = readSalesOrders().orders.find((row) => row.so_number === soNumber);
    if (!order) {
      return {
        current_client_name: fallback,
        source_client_name: null,
        destination_client_name: null,
      };
    }

    const fabricNumber = cleanName(input.fabricNumber) || null;
    const productionCode = cleanName(input.productionCode) || null;
    const line =
      order.fabric_lines.find((row) => lineMatchesLookup(row, fabricNumber, productionCode)) ??
      null;
    if (!line) {
      return {
        current_client_name: cleanName(order.client_name) || fallback,
        source_client_name: null,
        destination_client_name: null,
      };
    }

    const ownership = ownershipFromFabricLine(order, line);
    return {
      ...ownership,
      current_client_name: ownership.current_client_name || fallback,
    };
  } catch {
    return {
      current_client_name: fallback,
      source_client_name: null,
      destination_client_name: null,
    };
  }
}
