"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { SessionContext } from "@/lib/auth/session";

const DISMISS_KEY = "hagan-copy-sizes-guide-v2-dismissed";

const STEPS: Array<{ title: string; body: string }> = [
  {
    title: "NEW: Paste sizes on the row that NEEDS them",
    body:
      "On the order board, press Paste sizes on the article missing measurements. " +
      "Pick which filled sheet to take them from and press Paste - done. " +
      "Works across garments too (e.g. take the Overshirt sizes from an " +
      "Overshirt+Trouser sheet).",
  },
  {
    title: "Or: Copy sizes on the sheet that HAS them",
    body:
      "Copy sizes on a filled row pushes its column to many sheets at once - " +
      "tick the receiving sheets, press Copy once.",
  },
  {
    title: "Pick which piece when asked",
    body:
      "For set garments choose Both, Overshirt only, or Trouser only. " +
      "Measurements and comments transfer; the receiving article keeps only " +
      "its own article + fabric number.",
  },
];

/**
 * One-time walkthrough for Pattern accounts: Copy sizes has no paste step -
 * targets are picked inside the copy window and the full column is applied
 * in one press. Dismiss persists per browser (localStorage).
 */
export function CopySizesGuidePrompt({ session }: { session: SessionContext }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!session.isPatternOperator) return;
    try {
      if (window.localStorage.getItem(DISMISS_KEY) === "1") return;
    } catch {
      /* private mode */
    }
    setOpen(true);
  }, [session]);

  function dismiss() {
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
    setOpen(false);
  }

  function tryNow() {
    dismiss();
    router.push("/pattern");
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-900/50 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="copy-sizes-guide-title"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
      >
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-indigo-50 p-3 text-indigo-700">
            <Copy className="h-6 w-6" aria-hidden />
          </div>
          <div>
            <h2
              id="copy-sizes-guide-title"
              className="text-lg font-semibold text-slate-900"
            >
              Copy &amp; Paste sizes - both directions now
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Push sizes from a filled sheet with Copy sizes, or pull them onto an
              empty article with the new Paste sizes button.
            </p>
          </div>
        </div>

        <ol className="mt-4 space-y-3">
          {STEPS.map((step, index) => (
            <li key={step.title} className="flex gap-3">
              <span className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">
                {index + 1}
              </span>
              <div>
                <p className="text-sm font-semibold text-slate-900">{step.title}</p>
                <p className="mt-0.5 text-sm text-slate-600">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 ring-1 ring-emerald-200">
          Safe by design: an empty cell on the source can never erase a filled
          value on the target. Use &quot;Fill empty only&quot; to keep every
          existing number untouched.
        </div>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
          <Button type="button" className="min-h-[48px] w-full sm:w-auto" onClick={tryNow}>
            Try it now
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="min-h-[48px] w-full sm:w-auto"
            onClick={dismiss}
          >
            Got it
          </Button>
        </div>
      </div>
    </div>
  );
}
