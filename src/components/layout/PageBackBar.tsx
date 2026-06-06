"use client";

import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { shouldShowPageBack } from "@/lib/navigation/page-back";

export function PageBackBar() {
  const pathname = usePathname();
  const router = useRouter();

  if (!shouldShowPageBack(pathname)) {
    return null;
  }

  return (
    <Button type="button" variant="secondary" size="sm" onClick={() => router.back()}>
      <ArrowLeft className="mr-1.5 h-4 w-4" />
      Back
    </Button>
  );
}
