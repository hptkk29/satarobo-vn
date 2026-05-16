import { Header } from "@/components/public/header";
import { SiteFooter } from "@/components/sections/site-footer";
import { FloatingCta } from "@/components/public/floating-cta";
import { StickyMobileCta } from "@/components/sections/sticky-mobile-cta";
import { CampaignPopup20Suat } from "@/components/public/campaign-popup-20-suat";

// F-UI-4 wiring:
// - <SiteFooter /> thay <Footer /> cũ (giữ file cũ ở components/public/
//   để rollback nếu cần — không import nữa).
// - <FloatingCta /> giờ desktop-only (lg:flex); <StickyMobileCta />
//   bottom bar full-width chỉ mobile (lg:hidden) — không đè nhau.
// - CampaignPopup20Suat z-[60] để override drawer (z-50) + sticky (z-40).
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      <main className="flex-1">{children}</main>
      <SiteFooter />
      <FloatingCta />
      <StickyMobileCta />
      <CampaignPopup20Suat />
    </>
  );
}
