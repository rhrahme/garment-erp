"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff, Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface EmailStatus {
  configured: boolean;
  missing?: string[];
  isProduction?: boolean;
  factoryOrdersEmail?: string | null;
}

export function SenderEmailSetup() {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState<EmailStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/email/status")
      .then((res) => res.json())
      .then((data: EmailStatus) => setStatus(data))
      .finally(() => setLoading(false));
  }, []);

  async function sendTestEmail() {
    setSending(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/email/send-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to send test email");
      setMessage(data.message ?? "Test email sent.");
      setStatus((prev) => (prev ? { ...prev, configured: true } : prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send test email");
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return null;
  }

  const configured = Boolean(status?.configured);
  const isProduction = Boolean(status?.isProduction);
  const factoryEmail = status?.factoryOrdersEmail ?? "orders.ruh@hagan.pro";
  const missing = status?.missing ?? [];

  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-6">
      <div className="flex items-center gap-2">
        <Mail className="h-5 w-5 text-indigo-600" />
        <h2 className="text-lg font-semibold text-slate-900">Direct send (SMTP)</h2>
      </div>

      {configured ? (
        <p className="mt-2 text-sm text-emerald-800">
          Direct send is configured. Supplier emails can be sent from the app.
        </p>
      ) : isProduction ? (
        <div className="mt-3 space-y-2 text-sm text-slate-700">
          <p>
            Production requires SMTP environment variables on Vercel. The password field below does not
            persist on Vercel — add it as <code className="rounded bg-white px-1">SMTP_PASS</code> in
            the dashboard instead.
          </p>
          {missing.length > 0 && (
            <p>
              Missing on Vercel:{" "}
              <span className="font-medium">{missing.join(", ")}</span>
            </p>
          )}
          <ol className="list-decimal space-y-1 pl-5">
            <li>
              Vercel → garment-erp project → Settings → Environment Variables
            </li>
            <li>
              Add the SMTP_* values from <code className="rounded bg-white px-1">.env.local.example</code>{" "}
              (same host/user as local: Microsoft 365 or Google Workspace)
            </li>
            <li>Set <code className="rounded bg-white px-1">SMTP_PASS</code> to the mailbox password or app password</li>
            <li>Redeploy, then hard-refresh this page</li>
          </ol>
        </div>
      ) : (
        <p className="mt-2 text-sm text-slate-600">
          Sends a test from your factory orders inbox to the configured scan inbox. Paste the mailbox
          password below (saved locally as <code className="rounded bg-white px-1">smtp-secret.local.json</code>)
          or set <code className="rounded bg-white px-1">SMTP_PASS</code> in{" "}
          <code className="rounded bg-white px-1">.env.local</code>.
        </p>
      )}

      {!configured && !isProduction && (
        <div className="mt-4 max-w-md">
          <label className="block text-sm font-medium text-slate-700">
            Password for {factoryEmail}
          </label>
          <div className="relative mt-2">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Paste password here"
              className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-3 pr-10 text-sm"
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Microsoft 365: use the mailbox password and ensure Authenticated SMTP is enabled. Gmail /
            Google Workspace: use an app password at myaccount.google.com/apppasswords.
          </p>
        </div>
      )}

      {!configured && !isProduction && (
        <Button className="mt-4" onClick={sendTestEmail} disabled={!password || sending}>
          {sending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Sending…
            </>
          ) : (
            "Send test email"
          )}
        </Button>
      )}

      {(error || message) && (
        <div
          className={`mt-4 rounded-lg border px-3 py-2 text-sm ${
            error ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-white text-emerald-800"
          }`}
        >
          {error ?? message}
        </div>
      )}
    </div>
  );
}
