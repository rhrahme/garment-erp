/** 17TRACK carrier codes — https://res.17track.net/asset/carrier/info/apicarrier.all.json */
export const TRACK17_CARRIER = {
  DHL_EXPRESS: 100001,
  FEDEX: 100003,
  UPS: 100002,
} as const;

const ERP_CARRIER_TO_TRACK17: Record<string, number> = {
  DHL: TRACK17_CARRIER.DHL_EXPRESS,
  "DHL EXPRESS": TRACK17_CARRIER.DHL_EXPRESS,
  FEDEX: TRACK17_CARRIER.FEDEX,
  UPS: TRACK17_CARRIER.UPS,
};

export function resolveTrack17CarrierCode(carrierName: string | null | undefined): number | undefined {
  const normalized = carrierName?.trim().toUpperCase() ?? "";
  return ERP_CARRIER_TO_TRACK17[normalized];
}
