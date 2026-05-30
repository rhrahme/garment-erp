"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff, Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/Button";

export function SenderEmailSetup() {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/email/status")
      .then((res) => res.json())
      .then((data) => setConfigured(Boolean(data.configured)))
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
      setConfigured(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send test email");
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return null;
  }

  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-6">
      <div className="flex items-center gap-2">
        <Mail className="h-5 w-5 text-indigo-600" />
        <h2 className="text-lg font-semibold text-slate-900">Test email sending</h2>
      </div>
      <p className="mt-2 text-sm text-slate-600">
        Sends a test from your factory orders inbox to the configured scan inbox (for end-to-end testing).
        Use your Microsoft 365 password, or enable Authenticated SMTP in admin if send fails.
      </p>

      <div className="mt-4 max-w-md">
        <label className="block text-sm font-medium text-slate-700">Password for orders.ruh@hagan.pro</label>
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
      </div>

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

      {configured && !message && !error && (
        <p className="mt-3 text-sm text-emerald-700">Email password saved on this computer.</p>
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
