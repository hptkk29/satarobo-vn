import type { Metadata } from "next";
import { organizationJsonLd, websiteJsonLd } from "@/lib/seo/jsonld";
import { HomePage, type FeaturedCourseCard } from "@/components/home/home-page";

const BASE_URL = "https://satarobo.vn";

export const metadata: Metadata = {
  title: "Sata Robo — Học Viện Robotics & AI Đà Nẵng | 8 Khoá Học",
  description:
    "Sata Robo - 6 cơ sở Robotics tại Đà Nẵng. 8 khoá học lớp 1-8. Robosim độc quyền - phần mềm bắt buộc Cuộc thi 2026. Cam kết hoàn 100%. EB đến 30%.",
  openGraph: {
    title: "Sata Robo — Học Viện Robotics & AI Đà Nẵng",
    description:
      "8 khoá học lớp 1-8 · Robosim độc quyền · Cam kết hoàn 100% · 6 cơ sở Đà Nẵng",
    url: BASE_URL,
    siteName: "Sata Robo",
    images: [
      {
        url: `${BASE_URL}/images/og/homepage.jpg`,
        width: 1200,
        height: 630,
        alt: "Sata Robo — Học Viện Robotics & AI Đà Nẵng",
      },
    ],
    locale: "vi_VN",
    type: "website",
  },
  alternates: { canonical: BASE_URL },
};

export const revalidate = 60;

// 4 featured Sata courses surfaced on homepage (Sata1, Sata2, Sata3, Sata8).
// Per RESET.1: 8 Sata courses are content inside /khoa-hoc/laptrinhrobot — not separate DB rows.
// Pricing comes from components/legacy-laptrinhrobot/_data/courses-pricing.ts.
const FEATURED_COURSES: FeaturedCourseCard[] = [
  {
    id: "sata1",
    code: "Sata1",
    title: "Robosim Master",
    subtitle: "Làm chủ vòng loại RoboSim — phần mềm thi bắt buộc 2026",
    ageGroup: "Lớp 3-8",
    lessons: 16,
    priceList: 2_400_000,
    priceEarlyBird: 1_800_000,
    badge: "🎯",
    href: "/khoa-hoc/laptrinhrobot#sata1",
    color: "orange",
  },
  {
    id: "sata2",
    code: "Sata2",
    title: "Đấu Trường Robot",
    subtitle: "Luyện robot Beta cho vòng chung kết khu vực",
    ageGroup: "Lớp 3-8",
    lessons: 16,
    priceList: 3_040_000,
    priceEarlyBird: 2_280_000,
    badge: "🤖",
    href: "/khoa-hoc/laptrinhrobot#sata2",
    color: "purple",
  },
  {
    id: "sata3",
    code: "Sata3",
    title: "Ươm Mầm Tài Năng",
    subtitle: "Khoá chuyên sâu 48 buổi — khởi đầu Robotics cho lớp 1-2",
    ageGroup: "Lớp 1-2",
    lessons: 48,
    priceList: 10_560_000,
    priceEarlyBird: 7_920_000,
    badge: "🌱",
    href: "/khoa-hoc/laptrinhrobot#sata3",
    color: "green",
  },
  {
    id: "sata8",
    code: "Sata8",
    title: "Vé Vàng Chung Kết",
    subtitle: "5 buổi chuyên binh — cam kết hoàn 100% nếu không vượt vòng loại",
    ageGroup: "Lớp 1-8",
    lessons: 5,
    priceList: 2_500_000,
    priceEarlyBird: null,
    badge: "🏆",
    href: "/khoa-hoc/laptrinhrobot#sata8",
    color: "amber",
  },
];

const orgJsonLd = organizationJsonLd();
const siteJsonLd = websiteJsonLd();

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(siteJsonLd) }}
      />
      <HomePage featuredCourses={FEATURED_COURSES} />
    </>
  );
}
