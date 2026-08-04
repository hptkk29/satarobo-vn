// Phase 4.UI.FIX.3 — legacy route group bypasses the (public) layout
// (Header + Footer + FloatingCta) because legacy pages bring their own chrome.
import type { ReactNode } from "react";
import { AttributionCapture } from "@/components/public/attribution-capture";

export default function LegacyLayout({ children }: { children: ReactNode }) {
  // Landing cũ cũng nhận link `?ref=` (2 domain cũ redirect về đây qua proxy.ts).
  return (
    <>
      <AttributionCapture />
      {children}
    </>
  );
}
