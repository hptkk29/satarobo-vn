import type { Metadata } from "next";
import LapTrinhRobotClient from "./client-page";

const BASE_URL = "https://satarobo.vn";

export const metadata: Metadata = {
  title:
    "Học viện Robotics Đà Nẵng | Sata Robo — Lộ trình 5 năm cho con từ 6-13 tuổi",
  description:
    "Học viện Sata Robo — 2 cơ sở Robotics tại Đà Nẵng. Lộ trình 5 năm bài bản cho con từ lớp 1 đến lớp 8. Tư vấn miễn phí 24h, học bổng đến 50%, cam kết hoàn phí.",
  keywords:
    "học robotics đà nẵng, sata robo, robotics cho trẻ em, lập trình robot, stem đà nẵng, lớp robotics offline, học viện robotics",
  alternates: { canonical: `${BASE_URL}/khoa-hoc/laptrinhrobot` },
  openGraph: {
    title: "Học viện Robotics Đà Nẵng | Sata Robo",
    description: "2 cơ sở tại Đà Nẵng — Lộ trình 5 năm Robotics cho con lớp 1-8.",
    url: `${BASE_URL}/khoa-hoc/laptrinhrobot`,
    locale: "vi_VN",
    siteName: "Sata Robo",
    type: "website",
  },
};

export default function LapTrinhRobotPage() {
  return <LapTrinhRobotClient />;
}
