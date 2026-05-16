import { Header } from "@/components/public/header";
import { Footer } from "@/components/public/footer";
import { FloatingCta } from "@/components/public/floating-cta";
import { CampaignPopup20Suat } from "@/components/public/campaign-popup-20-suat";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
      <FloatingCta />
      <CampaignPopup20Suat />
    </>
  );
}
