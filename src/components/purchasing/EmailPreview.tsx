"use client";

import { useEffect, useState } from "react";
import { Copy, Mail, Check, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { FabricOrderEmail } from "@/lib/types/fabric-sourcing";

interface EmailPreviewProps {
  email: FabricOrderEmail;
  poNumber?: string;
  onSent?: (result: { emailedAt: string; emailTo: string }) => void;
}

export function EmailPreview({ email, poNumber, onSent }: EmailPreviewProps) {
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const [canSend, setCanSend] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadStatus() {
      try {
        const res = await fetch("/api/email/status");
        if (!res.ok) return;
        const data = await res.json();
        setCanSend(Boolean(data.configured));
      } catch {
        setCanSend(false);
      }
    }
    loadStatus();
  }, []);

  async function copyBody() {
    await navigator.clipboard.writeText(email.body);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function openMailClient() {
    const recipients = email.to
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .join(",");
    const mailto = `mailto:${recipients}?subject=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(email.body)}`;
    window.location.href = mailto;
  }

  async function sendEmail() {
    setSending(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/fabric-orders/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...email,
          poNumber,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to send email");
      }
      setMessage(data.message ?? "Email sent.");
      onSent?.({ emailedAt: data.emailedAt, emailTo: data.emailTo });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send email");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-slate-400" />
          <span className="text-sm font-medium text-slate-900">Email to Supplier</span>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={copyBody}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button variant="secondary" size="sm" onClick={openMailClient}>
            Open in Mail
          </Button>
          {onSent && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                onSent({
                  emailedAt: new Date().toISOString(),
                  emailTo: email.to,
                })
              }
            >
              <Check className="mr-2 h-4 w-4" />
              Already sent
            </Button>
          )}
          <Button size="sm" onClick={sendEmail} disabled={!canSend || !email.to || sending}>
            {sending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending…
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Send email
              </>
            )}
          </Button>
        </div>
      </div>
      <div className="space-y-3 px-6 py-4 text-sm">
        {!canSend && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
            Direct send is not configured yet. Add SMTP settings under Purchasing → Supplier Emails, or use Open in Mail.
          </div>
        )}
        {email.from && (
          <div>
            <span className="text-slate-500">From: </span>
            <span className="font-medium">{email.from}</span>
          </div>
        )}
        <div>
          <span className="text-slate-500">To: </span>
          <span className="font-medium">{email.to || "(add supplier email)"}</span>
        </div>
        <div>
          <span className="text-slate-500">Subject: </span>
          <span className="font-medium">{email.subject}</span>
        </div>
        {(error || message) && (
          <div
            className={`rounded-lg border px-3 py-2 text-sm ${
              error ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"
            }`}
          >
            {error ?? message}
          </div>
        )}
        <pre className="mt-4 whitespace-pre-wrap rounded-lg bg-slate-50 p-4 font-mono text-xs leading-relaxed text-slate-700">
          {email.body}
        </pre>
      </div>
    </div>
  );
}
