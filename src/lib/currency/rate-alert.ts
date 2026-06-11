import path from "path";
import { readJsonFileAsync, writeJsonFile } from "@/lib/data/json-file-cache";
import { parseSuperAdminEmails } from "@/lib/auth/permissions";
import { EUR_SAR_ALERT_THRESHOLD, EUR_TO_SAR } from "@/lib/currency/config";
import { fetchMarketEurToSar } from "@/lib/currency/market-rate";
import { sendEmail } from "@/lib/email/smtp";

const STATE_PATH = path.join(process.cwd(), "exchange-rate-state.local.json");
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const ALERT_COOLDOWN_MS = 24 * 60 * 60 * 1000;

interface ExchangeRateState {
  last_checked_at: string | null;
  last_market_rate: number | null;
  last_alert_at: string | null;
  last_alert_rate: number | null;
}

interface RateCheckResult {
  bookRate: number;
  alertThreshold: number;
  marketRate: number | null;
  aboveThreshold: boolean;
  alertSent: boolean;
  checkedAt: string;
}

const EMPTY_EXCHANGE_RATE_STATE: ExchangeRateState = {
  last_checked_at: null,
  last_market_rate: null,
  last_alert_at: null,
  last_alert_rate: null,
};

async function readState(): Promise<ExchangeRateState> {
  return readJsonFileAsync(STATE_PATH, EMPTY_EXCHANGE_RATE_STATE);
}

function writeState(state: ExchangeRateState): void {
  try {
    writeJsonFile(STATE_PATH, state);
  } catch (error) {
    console.error("Exchange rate state write failed:", error);
  }
}

function shouldRefresh(lastCheckedAt: string | null): boolean {
  if (!lastCheckedAt) return true;
  return Date.now() - new Date(lastCheckedAt).getTime() >= CHECK_INTERVAL_MS;
}

function shouldSendAlert(state: ExchangeRateState, marketRate: number): boolean {
  if (!state.last_alert_at) return true;
  const elapsed = Date.now() - new Date(state.last_alert_at).getTime();
  if (elapsed >= ALERT_COOLDOWN_MS) return true;
  if (state.last_alert_rate != null && marketRate > state.last_alert_rate + 0.01) return true;
  return false;
}

async function notifyAdmins(marketRate: number): Promise<boolean> {
  const recipients = [...parseSuperAdminEmails()];
  if (recipients.length === 0) return false;

  try {
    await sendEmail({
      to: recipients,
      subject: `ERP alert: EUR/SAR ${marketRate.toFixed(2)} above ${EUR_SAR_ALERT_THRESHOLD.toFixed(2)}`,
      text: [
        "Garment ERP — exchange rate alert",
        "",
        `Live EUR → SAR: ${marketRate.toFixed(4)}`,
        `Your alert threshold: ${EUR_SAR_ALERT_THRESHOLD.toFixed(2)}`,
        `Book rate used for pricing: ${EUR_TO_SAR.toFixed(2)}`,
        "",
        "Fabric list prices still show the original EUR/USD from suppliers, with SAR converted at the book rate.",
        "Review whether to update EUR_TO_SAR in .env.local if you want SAR prices to follow the market.",
      ].join("\n"),
    });
    return true;
  } catch (error) {
    console.error("EUR/SAR alert email failed:", error);
    return false;
  }
}

export async function checkEurSarRateAlert(force = false): Promise<RateCheckResult> {
  const state = await readState();
  const checkedAt = new Date().toISOString();

  if (!force && !shouldRefresh(state.last_checked_at)) {
    const marketRate = state.last_market_rate;
    return {
      bookRate: EUR_TO_SAR,
      alertThreshold: EUR_SAR_ALERT_THRESHOLD,
      marketRate,
      aboveThreshold: marketRate != null && marketRate > EUR_SAR_ALERT_THRESHOLD,
      alertSent: false,
      checkedAt: state.last_checked_at ?? checkedAt,
    };
  }

  const snapshot = await fetchMarketEurToSar();
  const marketRate = snapshot.marketRate;
  let alertSent = false;

  if (marketRate != null && marketRate > EUR_SAR_ALERT_THRESHOLD && shouldSendAlert(state, marketRate)) {
    alertSent = await notifyAdmins(marketRate);
    if (alertSent) {
      state.last_alert_at = checkedAt;
      state.last_alert_rate = marketRate;
    }
  }

  state.last_checked_at = checkedAt;
  state.last_market_rate = marketRate;
  writeState(state);

  return {
    bookRate: EUR_TO_SAR,
    alertThreshold: EUR_SAR_ALERT_THRESHOLD,
    marketRate,
    aboveThreshold: marketRate != null && marketRate > EUR_SAR_ALERT_THRESHOLD,
    alertSent,
    checkedAt,
  };
}
