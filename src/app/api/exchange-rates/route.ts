import { NextResponse } from "next/server";
import { EUR_SAR_ALERT_THRESHOLD, EUR_TO_SAR, USD_TO_SAR } from "@/lib/currency/config";
import { fetchMarketEurToSar } from "@/lib/currency/market-rate";
import { checkEurSarRateAlert } from "@/lib/currency/rate-alert";

export async function GET() {
  const snapshot = await fetchMarketEurToSar();
  return NextResponse.json({
    book_rates: {
      eur_to_sar: EUR_TO_SAR,
      usd_to_sar: USD_TO_SAR,
    },
    alert_threshold: EUR_SAR_ALERT_THRESHOLD,
    market: snapshot,
    above_threshold:
      snapshot.marketRate != null && snapshot.marketRate > EUR_SAR_ALERT_THRESHOLD,
  });
}

export async function POST() {
  const result = await checkEurSarRateAlert(true);
  return NextResponse.json(result);
}
