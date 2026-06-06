/** Parse "Net 30", "net 15", etc. and return due date ISO string (YYYY-MM-DD). */
export function computeDueDate(invoiceDate: string, paymentTerms: string | null | undefined): string | null {
  if (!paymentTerms?.trim()) return null;
  const match = paymentTerms.trim().match(/\bnet\s+(\d+)\b/i);
  if (!match) return null;

  const days = Number.parseInt(match[1]!, 10);
  if (!Number.isFinite(days) || days < 0) return null;

  const base = new Date(`${invoiceDate}T12:00:00`);
  if (Number.isNaN(base.getTime())) return null;

  base.setDate(base.getDate() + days);
  return base.toISOString().slice(0, 10);
}

export function applyMarkupToCost(cost: number, markupPercent: number): number {
  return Math.round(cost * (1 + markupPercent / 100) * 100) / 100;
}
