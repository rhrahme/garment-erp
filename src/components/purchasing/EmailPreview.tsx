"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, Mail, Check, Loader2, Send, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { SUPPLIER_EMAIL_ALWAYS_CC } from "@/lib/fabric-sourcing/email-content";
import { formatDateTimeRiyadh } from "@/lib/utils";
import type { FabricOrderEmail } from "@/lib/types/fabric-sourcing";

interface EmailPreviewProps {
  email: FabricOrderEmail;
  poNumber?: string;
  /** All PO numbers included in a consolidated supplier email. */
  poNumbers?: string[];
  /** Called after a successful send to persist sent state on fabric orders. Omit for follow-ups. */
  onSent?: (result: { emailedAt: string; emailTo: string }) => void;
  /** When set, the email is treated as already sent — send is disabled. */
  sentAt?: string | null;
  sentTo?: string | null;
  /** Show manual "Already sent" override (e.g. sent outside the app). Default false. */
  allowManualSent?: boolean;
}

function defaultCc(email: FabricOrderEmail): string {
  return email.cc ?? SUPPLIER_EMAIL_ALWAYS_CC.join(", ");
}

export function EmailPreview({
  email,
  poNumber,
  poNumbers,
  onSent,
  sentAt,
  sentTo,
  allowManualSent = false,
}: EmailPreviewProps) {
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const [canSend, setCanSend] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [justSentAt, setJustSentAt] = useState<string | null>(null);
  const [justSentTo, setJustSentTo] = useState<string | null>(null);

  const [to, setTo] = useState(email.to);
  const [cc, setCc] = useState(defaultCc(email));
  const [subject, setSubject] = useState(email.subject);
  const [body, setBody] = useState(email.body);

  const effectiveSentAt = sentAt ?? justSentAt;
  const effectiveSentTo = sentTo ?? justSentTo;
  const isSent = Boolean(effectiveSentAt);

  // Re-seed the editable draft whenever a different generated email comes in.
  useEffect(() => {
    setTo(email.to);
    setCc(defaultCc(email));
    setSubject(email.subject);
    setBody(email.body);
    setJustSentAt(null);
    setJustSentTo(null);
    setMessage(null);
    setError(null);
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
    if (isSent) return;
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
      const emailedAt = data.emailedAt ?? new Date().toISOString();
      const emailTo = data.emailTo ?? to;
      setJustSentAt(emailedAt);
      setJustSentTo(emailTo);
      setMessage(data.message ?? "Email sent.");
      onSent?.({ emailedAt, emailTo });
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
          {isSent && effectiveSentAt && (
            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
              Sent {formatDateTimeRiyadh(effectiveSentAt)}
              {effectiveSentTo ? ` · ${effectiveSentTo}` : ""}
            </span>
          )}
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {isDirty && !isSent && (
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
          {allowManualSent && onSent && !isSent && (
            <Button
              variant="secondary"
              size="sm"
              disabled={!hasIncludedPos}
              onClick={() => {
                const emailedAt = new Date().toISOString();
                setJustSentAt(emailedAt);
                setJustSentTo(to);
                onSent({ emailedAt, emailTo: to });
              }}
            >
              <Check className="mr-2 h-4 w-4" />
              Already sent
            </Button>
          )}
          {!isSent && (
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
          )}
        </div>
      </div>
      <div className="space-y-3 px-6 py-4 text-sm">
        {!hasIncludedPos && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
            Select at least one order above to include in this supplier email.
          </div>
        )}
        {!canSend && !isSent && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
            Direct send is not configured yet. On production, add SMTP_* environment variables in Vercel
            (see Purchasing → Supplier Emails). Locally, set them in .env.local or use Open in Mail.
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
            disabled={isSent}
            className="w-full rounded-lg border border-slate-200 px-3 py-1.5 font-medium text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300 disabled:bg-slate-50 disabled:text-slate-500"
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
            disabled={isSent}
            className="w-full rounded-lg border border-slate-200 px-3 py-1.5 font-medium text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300 disabled:bg-slate-50 disabled:text-slate-500"
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
            disabled={isSent}
            className="w-full rounded-lg border border-slate-200 px-3 py-1.5 font-medium text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300 disabled:bg-slate-50 disabled:text-slate-500"
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
          disabled={isSent}
          rows={18}
          className="mt-4 w-full whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-4 font-mono text-xs leading-relaxed text-slate-700 focus:border-slate-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-300 disabled:text-slate-500"
        />
      </div>
    </div>
  );
}
