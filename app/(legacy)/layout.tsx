// Phase 4.UI.FIX.3 — legacy route group bypasses the (public) layout
// (Header + Footer + FloatingCta) because legacy pages bring their own chrome.
import type { ReactNode } from "react";

export default function LegacyLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
