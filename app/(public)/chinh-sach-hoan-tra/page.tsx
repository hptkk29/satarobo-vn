import type { Metadata } from "next";
import { LegalPage } from "@/components/public/legal-page";

export const metadata: Metadata = {
  title: "Chính sách Hoàn trả Học phí",
  description:
    "Chính sách hoàn trả học phí và học cụ của Sata Robo — điều kiện, mức hoàn trả và quy trình yêu cầu.",
  alternates: { canonical: "https://satarobo.vn/chinh-sach-hoan-tra" },
  openGraph: {
    title: "Chính sách Hoàn trả Học phí | Sata Robo",
    description: "Điều kiện, mức hoàn trả và quy trình yêu cầu hoàn học phí.",
    url: "https://satarobo.vn/chinh-sach-hoan-tra",
    siteName: "Sata Robo",
  },
  robots: { index: true, follow: true },
};

export default function ChinhSachHoanTraPage() {
  return (
    <LegalPage
      slug="chinh-sach-hoan-tra"
      title="Chính sách Hoàn trả Học phí"
      subtitle="Điều kiện và quy trình hoàn trả tại Sata Robo"
      breadcrumbLabel="Chính sách Hoàn trả"
    />
  );
}
