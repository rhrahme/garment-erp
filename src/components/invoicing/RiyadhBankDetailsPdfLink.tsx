import { ExternalLink } from "lucide-react";
import { RIYADH_BANK_DETAILS_PDF_HREF } from "@/lib/data/reference-source-files-shared";
import { cn } from "@/lib/utils";

export function RiyadhBankDetailsPdfLink({
  className,
  variant = "inline",
}: {
  className?: string;
  variant?: "inline" | "button";
}) {
  if (variant === "button") {
    return (
      <a
        href={RIYADH_BANK_DETAILS_PDF_HREF}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-indigo-600 shadow-sm hover:border-indigo-200 hover:text-indigo-800",
          className
        )}
      >
        Riyadh bank details PDF
        <ExternalLink className="h-3.5 w-3.5" />
      </a>
    );
  }

  return (
    <a
      href={RIYADH_BANK_DETAILS_PDF_HREF}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-800",
        className
      )}
    >
      Riyadh bank details PDF
      <ExternalLink className="h-3.5 w-3.5" />
    </a>
  );
}
