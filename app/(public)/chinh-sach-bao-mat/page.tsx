import type { Metadata } from "next";
import { LegalPage } from "@/components/public/legal-page";

export const metadata: Metadata = {
  title: "Chính sách Bảo mật",
  description:
    "Chính sách bảo mật thông tin của Sata Robo — cách chúng tôi thu thập, sử dụng và bảo vệ dữ liệu cá nhân theo NĐ 13/2023/NĐ-CP.",
  alternates: { canonical: "https://satarobo.vn/chinh-sach-bao-mat" },
  openGraph: {
    title: "Chính sách Bảo mật | Sata Robo",
    description: "Cách Sata Robo thu thập, sử dụng và bảo vệ dữ liệu cá nhân của bạn.",
    url: "https://satarobo.vn/chinh-sach-bao-mat",
    siteName: "Sata Robo",
  },
  robots: { index: true, follow: true },
};

export default function ChinhSachBaoMatPage() {
  return (
    <LegalPage
      slug="chinh-sach-bao-mat"
      title="Chính sách Bảo mật"
      subtitle="Theo Nghị định 13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân"
      breadcrumbLabel="Chính sách Bảo mật"
    />
  );
}
