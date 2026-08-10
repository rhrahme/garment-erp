"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { canAccessClientMedia } from "@/lib/auth/permissions";
import type { SessionContext } from "@/lib/auth/session";
import { isMobileClient } from "@/lib/ui/is-mobile-client";

const DISMISS_KEY = "hagan-mobile-client-photos-prompt-dismissed";

type MobileClientPhotosPromptProps = {
  session: SessionContext;
};

/**
 * After mobile login, ask accounts that can upload client media whether they
 * want to go upload wearing photos first (common phone workflow).
 */
export function MobileClientPhotosPrompt({ session }: MobileClientPhotosPromptProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (session.isStitchOperator) return;
    if (
      !canAccessClientMedia({
        isAdmin: session.isAdmin,
        isSalesOperator: session.isSalesOperator,
        isClientManager: session.isClientManager,
        isProductionOperator: session.isProductionOperator,
        isPatternOperator: session.isPatternOperator,
      })
    ) {
      return;
    }
    if (!isMobileClient()) return;
    try {
      if (window.sessionStorage.getItem(DISMISS_KEY) === "1") return;
    } catch {
      /* private mode */
    }
    setOpen(true);
  }, [session]);

  function dismiss() {
    try {
      window.sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
    setOpen(false);
  }

  function goUpload() {
    dismiss();
    router.push("/clients?mobileUpload=1");
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-900/50 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="mobile-photos-prompt-title"
        className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
      >
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-indigo-50 p-3 text-indigo-700">
            <Camera className="h-6 w-6" aria-hidden />
          </div>
          <div>
            <h2
              id="mobile-photos-prompt-title"
              className="text-lg font-semibold text-slate-900"
            >
              Upload client photos?
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              On mobile, the first step is usually taking or uploading wearing photos
              for a client. Open Clients to pick someone and upload now?
            </p>
          </div>
        </div>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
          <Button type="button" className="min-h-[48px] w-full sm:w-auto" onClick={goUpload}>
            Yes, upload photos
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="min-h-[48px] w-full sm:w-auto"
            onClick={dismiss}
          >
            Not now
          </Button>
        </div>
      </div>
    </div>
  );
}
