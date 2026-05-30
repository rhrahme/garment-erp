interface ExchangeRateBannerProps {
  marketRate: number;
  bookRate: number;
  threshold: number;
}

export function ExchangeRateBanner({ marketRate, bookRate, threshold }: ExchangeRateBannerProps) {
  return (
    <div className="border-b border-amber-200 bg-amber-50 px-8 py-3 text-sm text-amber-950">
      <p className="font-medium">
        EUR/SAR market rate {marketRate.toFixed(2)} is above your {threshold.toFixed(2)} alert level
      </p>
      <p className="mt-0.5 text-amber-900">
        List prices still show original EUR/USD. SAR is calculated at the book rate EUR 1 = SAR{" "}
        {bookRate.toFixed(2)} (USD uses the 3.75 peg). An email alert was sent to super admins.
      </p>
    </div>
  );
}
