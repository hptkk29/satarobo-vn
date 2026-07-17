import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

// SEC-H02 — security headers (áp cho MỌI response).
// X-Frame-Options = SAMEORIGIN (KHÔNG DENY): SCORM player nhúng /api/scorm/asset trong iframe cùng origin.
// Permissions-Policy: geolocation=(self) BẮT BUỘC giữ — QR điểm danh GV dùng GPS.
// CSP để Content-Security-Policy-Report-Only (chỉ thu vi phạm, KHÔNG chặn) — tune + enforce ở đợt S2.
const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://www.google-analytics.com https://connect.facebook.net",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://cdn.satarobo.vn https://*.r2.cloudflarestorage.com https://images.unsplash.com https://img.youtube.com https://www.google-analytics.com https://www.facebook.com",
  "font-src 'self' data:",
  "connect-src 'self' https://www.google-analytics.com https://region1.google-analytics.com https://www.facebook.com",
  "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com",
  "media-src 'self' https://cdn.satarobo.vn https://*.r2.cloudflarestorage.com",
].join("; ");

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self), browsing-topics=()" },
  { key: "Content-Security-Policy-Report-Only", value: CSP_REPORT_ONLY },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },

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
  // Suppress Sentry plugin output in build log (errors still surface).
  silent: true,

  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Tunnel route to bypass ad-blockers (Sentry events go through /monitoring)
  tunnelRoute: "/monitoring",

  // Hide source maps from public bundle output
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },

  // Disable Sentry logger to reduce bundle size in production
  disableLogger: true,

  // Automatically tree-shake Sentry logger statements
  reactComponentAnnotation: {
    enabled: true,
  },
};

export default withSentryConfig(nextConfig, sentryWebpackPluginOptions);
