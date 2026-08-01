import { redirect } from "next/navigation";

/** Legacy path - stitch kiosk lives at `/stitch`. */
export default function ProductionStitchKioskRedirectPage() {
  redirect("/stitch");
}
