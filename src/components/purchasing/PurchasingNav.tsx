"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/purchasing", label: "Fabric Orders" },
  { href: "/purchasing/price-lists", label: "Price Lists" },
  { href: "/purchasing/suppliers", label: "Supplier Emails" },
  { href: "/purchasing/import", label: "Import Price List" },
];

export function PurchasingNav() {
  const pathname = usePathname();

  return (
    <div className="mb-6 flex gap-1 rounded-lg border border-slate-200 bg-white p-1">
      {tabs.map(({ href, label }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "rounded-md px-4 py-2 text-sm font-medium transition-colors",
              active ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-50"
            )}
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}
