import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.satarobo.vn",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "*.r2.cloudflarestorage.com",
        pathname: "/**",
      },
      // YouTube thumbnails used in testimonials
      {
        protocol: "https",
        hostname: "img.youtube.com",
        pathname: "/vi/**",
      },
    ],
  },

  // 301 redirects:
  //   1) From old domains laptrinhrobot.vn / luyenthirobosim.vn → new no-hyphen slugs
  //   2) From legacy SP1-4 + hyphenated course paths → new slugs (Phase 4.UI.FIX.1)
  async redirects() {
    return [
      // ─── Old domains (Phase 1 marketing sites) ──────────────────────────
      {
        source: "/:path*",
        has: [{ type: "host", value: "laptrinhrobot.vn" }],
        destination: "https://satarobo.vn/khoa-hoc/laptrinhrobot/:path*",
        permanent: true,
      },
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.laptrinhrobot.vn" }],
        destination: "https://satarobo.vn/khoa-hoc/laptrinhrobot/:path*",
        permanent: true,
      },
      {
        source: "/:path*",
        has: [{ type: "host", value: "luyenthirobosim.vn" }],
        destination: "https://satarobo.vn/khoa-hoc/luyenthirobosim/:path*",
        permanent: true,
      },
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.luyenthirobosim.vn" }],
        destination: "https://satarobo.vn/khoa-hoc/luyenthirobosim/:path*",
        permanent: true,
      },
      // ─── Legacy in-domain slugs → 2 khoá học chính ──────────────────────
      // SP1 (RoboSim Online) + SP2 (Robotics Offline) → Lập trình Robot
      // SP3 (Sata Inno School) + SP4 (SATAGO) → /khoa-hoc overview (đã ngừng)
      // Hyphenated legacy slugs → no-hyphen mới
      { source: "/khoa-hoc/sp1", destination: "/khoa-hoc/luyenthirobosim", permanent: true },
      { source: "/khoa-hoc/sp2", destination: "/khoa-hoc/laptrinhrobot", permanent: true },
      { source: "/khoa-hoc/sp3", destination: "/khoa-hoc", permanent: true },
      { source: "/khoa-hoc/sp4", destination: "/khoa-hoc", permanent: true },
      { source: "/khoa-hoc/lap-trinh-robot", destination: "/khoa-hoc/laptrinhrobot", permanent: true },
      { source: "/khoa-hoc/luyen-thi-robosim", destination: "/khoa-hoc/luyenthirobosim", permanent: true },
      // Old blog slugs đã đổi
      { source: "/tin-tuc/sata-inno-school-giai-phap-stem-truong-hoc", destination: "/tin-tuc", permanent: true },
      { source: "/tin-tuc/satago-du-lich-giao-duc-stem", destination: "/tin-tuc", permanent: true },
    ];
  },
};

const sentryWebpackPluginOptions = {
  // Suppress source map upload logs in CI
  silent: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  // Auth token chỉ cần khi upload source maps
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // Hides source maps from public bundle
  hideSourceMaps: true,
  // Auto-instrument browser/server requests
  autoInstrumentServerFunctions: true,
  // Tunnel /monitoring to bypass ad-blockers
  tunnelRoute: "/monitoring",
  // Don't upload source maps in dev — chỉ prod
  disableLogger: process.env.NODE_ENV !== "production",
};

export default withSentryConfig(nextConfig, sentryWebpackPluginOptions);
