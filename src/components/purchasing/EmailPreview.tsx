"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, Mail, Check, Loader2, Send, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { SUPPLIER_EMAIL_ALWAYS_CC } from "@/lib/fabric-sourcing/email-content";
import type { FabricOrderEmail } from "@/lib/types/fabric-sourcing";

interface EmailPreviewProps {
  email: FabricOrderEmail;
  poNumber?: string;
  /** All PO numbers included in a consolidated supplier email. */
  poNumbers?: string[];
  onSent?: (result: { emailedAt: string; emailTo: string }) => void;
}

function defaultCc(email: FabricOrderEmail): string {
  return email.cc ?? SUPPLIER_EMAIL_ALWAYS_CC.join(", ");
}

export function EmailPreview({ email, poNumber, poNumbers, onSent }: EmailPreviewProps) {
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const [canSend, setCanSend] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [to, setTo] = useState(email.to);
  const [cc, setCc] = useState(defaultCc(email));
  const [subject, setSubject] = useState(email.subject);
  const [body, setBody] = useState(email.body);

  // Re-seed the editable draft whenever a different generated email comes in.
  useEffect(() => {
    setTo(email.to);
    setCc(defaultCc(email));
    setSubject(email.subject);
    setBody(email.body);
  }, [email]);

  const includedPoNumbers = poNumbers ?? (poNumber ? [poNumber] : []);
  const hasIncludedPos = includedPoNumbers.length > 0;

  const isDirty = useMemo(
    () =>
      to !== email.to ||
      cc !== defaultCc(email) ||
      subject !== email.subject ||
      body !== email.body,
    [to, cc, subject, body, email]
  );

  function resetDraft() {
    setTo(email.to);
    setCc(defaultCc(email));
    setSubject(email.subject);
    setBody(email.body);
  }

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
    await navigator.clipboard.writeText(body);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function openMailClient() {
    const recipients = to
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .join(",");
    const ccRecipients = cc
      .split(/[\n,;]+/)
      .map((value) => value.trim())
      .filter(Boolean)
      .join(",");
    const params = new URLSearchParams();
    params.set("subject", subject);
    params.set("body", body);
    if (ccRecipients) params.set("cc", ccRecipients);
    const mailto = `mailto:${recipients}?${params.toString().replace(/\+/g, "%20")}`;
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
          from: email.from,
          to,
          cc,
          subject,
          body,
          poNumber: includedPoNumbers[0],
          poNumbers: includedPoNumbers,
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
          {isDirty && (
            <Button variant="secondary" size="sm" onClick={resetDraft}>
              <RotateCcw className="h-4 w-4" />
              Reset
            </Button>
          )}
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
              disabled={!hasIncludedPos}
              onClick={() =>
                onSent({
                  emailedAt: new Date().toISOString(),
                  emailTo: to,
                })
              }
            >
              <Check className="mr-2 h-4 w-4" />
              Already sent
            </Button>
          )}
          <Button
            size="sm"
            onClick={sendEmail}
            disabled={!canSend || !to.trim() || sending || !hasIncludedPos}
          >
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
        {!hasIncludedPos && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
            Select at least one order above to include in this supplier email.
          </div>
        )}
        {!canSend && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
            Direct send is not configured yet. Add SMTP settings under Purchasing → Supplier Emails, or use Open in Mail.
          </div>
        )}
        {email.from && (
          <div className="flex items-baseline gap-2">
            <label className="w-16 shrink-0 text-slate-500">From</label>
            <span className="font-medium text-slate-900">{email.from}</span>
          </div>
        )}
        <div className="flex items-baseline gap-2">
          <label htmlFor="email-to" className="w-16 shrink-0 text-slate-500">
            To
          </label>
          <input
            id="email-to"
            type="text"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="(add supplier email)"
            className="w-full rounded-lg border border-slate-200 px-3 py-1.5 font-medium text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300"
          />
        </div>
        <div className="flex items-baseline gap-2">
          <label htmlFor="email-cc" className="w-16 shrink-0 text-slate-500">
            Cc
          </label>
          <input
            id="email-cc"
            type="text"
            value={cc}
            onChange={(e) => setCc(e.target.value)}
            placeholder="(add cc)"
            className="w-full rounded-lg border border-slate-200 px-3 py-1.5 font-medium text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300"
          />
        </div>
        <div className="flex items-baseline gap-2">
          <label htmlFor="email-subject" className="w-16 shrink-0 text-slate-500">
            Subject
          </label>
          <input
            id="email-subject"
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-1.5 font-medium text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300"
          />
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
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={18}
          className="mt-4 w-full whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-4 font-mono text-xs leading-relaxed text-slate-700 focus:border-slate-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-300"
        />
      </div>
    </div>
  );
}
