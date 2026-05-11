import type { Metadata } from "next";
import { Be_Vietnam_Pro } from "next/font/google";
import "./globals.css";
import { MetaPixel } from "@/components/public/meta-pixel";
import { GA4 } from "@/components/public/ga4";
import { Toaster } from "@/components/ui/sonner";

const beVietnamPro = Be_Vietnam_Pro({
  variable: "--font-sans",
  subsets: ["vietnamese", "latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "https://satarobo.vn"),
  title: {
    default: "Sata Robo — Hệ sinh thái Robotics & STEM giáo dục",
    template: "%s | Sata Robo",
  },
  description:
    "Sata Robo cung cấp các khóa học Lập trình Robot, Luyện thi RoboSim và giải pháp STEM toàn diện cho học sinh lớp 1-8 tại Đà Nẵng.",
  openGraph: {
    siteName: "Sata Robo",
    locale: "vi_VN",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    site: "@satarobo",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="vi"
      suppressHydrationWarning
      className={`${beVietnamPro.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        {children}
        <MetaPixel />
        <GA4 />
        <Toaster position="top-right" richColors />
      </body>
    </html>
  );
}
