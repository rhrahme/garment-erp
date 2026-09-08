export type CostHintNamedClient = {
  key: string;
  label: string;
  codes: string[];
  nameNeedles: string[];
};

/** Offline pricing pack Ralph asked for by name. */
export const COST_HINT_NAMED_CLIENTS: CostHintNamedClient[] = [
  {
    key: "ibrahim",
    label: "Ibrahim Al Shwemi",
    codes: ["FR-0726-0037"],
    nameNeedles: ["ibrahim al shwemi"],
  },
  {
    key: "mitwalli",
    label: "Mitwalli",
    codes: ["FR-0726-0046"],
    nameNeedles: ["mitwalli"],
  },
  {
    key: "hicham",
    label: "Hicham Al Saif",
    codes: ["FR-0726-0043"],
    nameNeedles: ["hicham al saif", "hicham"],
  },
  {
    key: "mohammad-al-sheikh",
    label: "Mohammad Al Sheikh",
    codes: ["FR-0726-0047"],
    nameNeedles: ["mohammad al sheikh", "al sheikh mohamad", "al sheikh mohammad"],
  },
  {
    key: "khaled",
    label: "Pr Khaled Bin Salman",
    codes: ["FR-0626-0037"],
    nameNeedles: ["pr khaled bin salman", "pr khaled", "khaled bin salman"],
  },
];

export const COST_HINT_NAMED_CLIENT_KEYS = COST_HINT_NAMED_CLIENTS.map((client) => client.key);

export function normalizeCostHintClientToken(value: string): string {
  return value.trim().toLowerCase().replace(/[_]+/g, "-").replace(/\s+/g, " ");
}

export function parseCostHintClientTokens(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((part) => normalizeCostHintClientToken(part))
    .filter(Boolean);
}

export function resolveCostHintNamedClient(token: string): CostHintNamedClient | null {
  const normalized = normalizeCostHintClientToken(token);
  if (!normalized) return null;
  return (
    COST_HINT_NAMED_CLIENTS.find(
      (client) =>
        client.key === normalized ||
        client.codes.some((code) => code.toLowerCase() === normalized) ||
        client.nameNeedles.some((needle) => needle === normalized)
    ) ?? null
  );
}

export function matchesCostHintClientFilter(
  clientName: string,
  clientCode: string,
  tokens: string[]
): boolean {
  if (tokens.length === 0) return true;
  const name = clientName.trim().toLowerCase();
  const code = clientCode.trim().toUpperCase();

  return tokens.some((token) => {
    const named = resolveCostHintNamedClient(token);
    if (named) {
      if (named.codes.some((known) => known.toUpperCase() === code)) return true;
      return named.nameNeedles.some((needle) => name.includes(needle));
    }
    const generic = normalizeCostHintClientToken(token);
    if (!generic) return false;
    if (code === generic.toUpperCase() || code.includes(generic.toUpperCase())) return true;
    return name.includes(generic);
  });
}

export function costHintNamedClientsQuery(): string {
  return COST_HINT_NAMED_CLIENT_KEYS.join(",");
}
