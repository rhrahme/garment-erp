const SUPPLIER_TOTAL_PATTERNS = [
  /Cod IVA Totale Fattura[\s\S]{0,160}?([\d][\d.,]*)\s*(EUR|USD|GBP|CHF)\b/i,
  /Totale Fattura[\s\S]{0,120}?([\d][\d.,]*)\s*(EUR|USD|GBP|CHF)\b/i,
  /\b([\d][\d.,]*)\s*(EUR|USD|GBP|CHF)\s*(?:\n|$)/im,
];

const CUSTOMS_TOTAL_PATTERNS = [
  /Payment due[\s\S]{0,120}?(\d+\.\d{2})\s+\d+\.\d{2}/i,
  /Bank Account Currency:\s*(SAR|AED|USD|EUR)[\s\S]{0,200}?Payment due[\s\S]{0,80}?(\d+\.\d{2})/i,
  /\(\s*SAR\s*\)[^\n]*Total Amount[\s\S]{0,120}?Payment due[\s\S]{0,80}?(\d+\.\d{2})/i,
];

const CUSTOMS_CURRENCY_PATTERNS = [
  /Bank Account Currency:\s*(SAR|AED|USD|EUR)/i,
  /\(\s*(SAR|AED|USD|EUR)\s*\)/,
  /VAT:\s*\d[\s\S]{0,400}?(SAR|AED|USD|EUR)/i,
];

export type ParsedMoney = {
  amount: string;
  currency: string;
};

function normalizeAmount(value: string): string {
  const trimmed = value.trim().replace(/\s/g, "");
  if (/^\d{1,3}(\.\d{3})+,\d{2}$/.test(trimmed)) {
    return trimmed.replace(/\./g, "").replace(",", ".");
  }
  if (/^\d+,\d{2}$/.test(trimmed)) {
    return trimmed.replace(",", ".");
  }
  if (trimmed.includes(",") && trimmed.includes(".")) {
    return trimmed.replace(/,/g, "");
  }
  if (trimmed.includes(",") && !trimmed.includes(".")) {
    return trimmed.replace(",", ".");
  }
  return trimmed;
}

export function extractSupplierInvoiceTotal(text: string): ParsedMoney | null {
  for (const pattern of SUPPLIER_TOTAL_PATTERNS) {
    const match = text.match(pattern);
    if (!match?.[1] || !match[2]) continue;
    const amount = normalizeAmount(match[1]);
    if (!/^\d+(\.\d+)?$/.test(amount)) continue;
    return { amount, currency: match[2].toUpperCase() };
  }
  return null;
}

export function extractCustomsInvoiceTotal(text: string): ParsedMoney | null {
  for (const pattern of CUSTOMS_TOTAL_PATTERNS) {
    const match = text.match(pattern);
    if (!match) continue;

    let amount: string | undefined;
    let currency: string | undefined;

    if (match[2] && /^[A-Z]{3}$/i.test(match[1])) {
      currency = match[1].toUpperCase();
      amount = normalizeAmount(match[2]);
    } else if (match[1]) {
      amount = normalizeAmount(match[1]);
      currency =
        CUSTOMS_CURRENCY_PATTERNS.map((p) => text.match(p)?.[1]?.toUpperCase()).find(Boolean) ?? "SAR";
    }

    if (!amount || !currency || !/^\d+(\.\d+)?$/.test(amount)) continue;
    return { amount, currency };
  }

  return null;
}

export function formatMoneyDisplay(currency: string | null, amount: string | null): string | null {
  if (!currency || !amount) return null;
  const numeric = Number(amount);
  if (Number.isNaN(numeric)) return `${currency} ${amount}`;

  const usesCommaDecimal = currency === "EUR" || currency === "CHF";
  const formatted = usesCommaDecimal
    ? numeric.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : numeric.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return `${currency} ${formatted}`;
}
