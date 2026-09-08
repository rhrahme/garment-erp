/** A4 print variants on /orders/[id]/print?team= */

export type SalesOrderPrintTeam = "full" | "receiving" | "production" | "cutting";

export function parseSalesOrderPrintTeam(
  raw: string | null | undefined
): SalesOrderPrintTeam {
  if (raw === "receiving" || raw === "production" || raw === "cutting") return raw;
  return "full";
}

/** Production and cutting A4s both list piece QRs (FR-...-L07-JKT-1/2). */
export function isPieceQrPrintTeam(team: SalesOrderPrintTeam): boolean {
  return team === "production" || team === "cutting";
}

export const SALES_ORDER_PRINT_TEAM_LINKS: Array<{
  id: SalesOrderPrintTeam;
  label: string;
}> = [
  { id: "receiving", label: "Receiving / wash (A4)" },
  { id: "cutting", label: "Cutting (A4)" },
  { id: "production", label: "Production pieces (A4)" },
  { id: "full", label: "Full order (A4)" },
];
