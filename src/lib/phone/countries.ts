export type PhoneCountry = {
  code: string;
  dial: string;
  label: string;
};

/** Saudi first, then GCC and common client countries. */
export const PHONE_COUNTRIES: PhoneCountry[] = [
  { code: "SA", dial: "+966", label: "Saudi Arabia" },
  { code: "AE", dial: "+971", label: "United Arab Emirates" },
  { code: "KW", dial: "+965", label: "Kuwait" },
  { code: "BH", dial: "+973", label: "Bahrain" },
  { code: "QA", dial: "+974", label: "Qatar" },
  { code: "OM", dial: "+968", label: "Oman" },
  { code: "LB", dial: "+961", label: "Lebanon" },
  { code: "JO", dial: "+962", label: "Jordan" },
  { code: "EG", dial: "+20", label: "Egypt" },
  { code: "GB", dial: "+44", label: "United Kingdom" },
  { code: "US", dial: "+1", label: "United States" },
  { code: "FR", dial: "+33", label: "France" },
  { code: "IT", dial: "+39", label: "Italy" },
  { code: "DE", dial: "+49", label: "Germany" },
  { code: "IN", dial: "+91", label: "India" },
  { code: "PK", dial: "+92", label: "Pakistan" },
];

export const DEFAULT_PHONE_DIAL = PHONE_COUNTRIES[0].dial;

const dialByLength = [...PHONE_COUNTRIES].sort((a, b) => b.dial.length - a.dial.length);

export function findPhoneCountryByDial(dial: string): PhoneCountry | undefined {
  return PHONE_COUNTRIES.find((country) => country.dial === dial);
}

export function parseStoredPhone(value: string | null | undefined): { dial: string; local: string } {
  if (!value?.trim()) {
    return { dial: DEFAULT_PHONE_DIAL, local: "" };
  }

  const trimmed = value.trim();

  if (trimmed.startsWith("+")) {
    for (const country of dialByLength) {
      if (trimmed.startsWith(country.dial)) {
        return {
          dial: country.dial,
          local: trimmed.slice(country.dial.length).replace(/\D/g, "").replace(/^0+/, ""),
        };
      }
    }
  }

  const digits = trimmed.replace(/\D/g, "");

  if (digits.startsWith("966")) {
    return { dial: "+966", local: digits.slice(3).replace(/^0+/, "") };
  }

  if (digits.startsWith("0")) {
    return { dial: DEFAULT_PHONE_DIAL, local: digits.slice(1) };
  }

  return { dial: DEFAULT_PHONE_DIAL, local: digits };
}

export function formatStoredPhone(dial: string, local: string): string | null {
  const cleaned = local.replace(/\D/g, "").replace(/^0+/, "");
  if (!cleaned) return null;
  return `${dial}${cleaned}`;
}

export function normalizeStoredPhone(value: unknown): string | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const { dial, local } = parseStoredPhone(text);
  return formatStoredPhone(dial, local);
}
