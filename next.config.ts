import type { NextConfig } from "next";

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

  // 301 redirects from old domains (laptrinhrobot.vn, luyenthirobosim.vn)
  // Both domains must point DNS to Vercel and list satarobo.vn as the primary domain.
  // Vercel receives the request with the original Host header, triggering these redirects.
  async redirects() {
    return [
      // laptrinhrobot.vn → /khoa-hoc/lap-trinh-robot (preserve path for SEO)
      {
        source: "/:path*",
        has: [{ type: "host", value: "laptrinhrobot.vn" }],
        destination: "https://satarobo.vn/khoa-hoc/lap-trinh-robot/:path*",
        permanent: true,
      },
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.laptrinhrobot.vn" }],
        destination: "https://satarobo.vn/khoa-hoc/lap-trinh-robot/:path*",
        permanent: true,
      },
      // luyenthirobosim.vn → /khoa-hoc/luyen-thi-robosim
      {
        source: "/:path*",
        has: [{ type: "host", value: "luyenthirobosim.vn" }],
        destination: "https://satarobo.vn/khoa-hoc/luyen-thi-robosim/:path*",
        permanent: true,
      },
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.luyenthirobosim.vn" }],
        destination: "https://satarobo.vn/khoa-hoc/luyen-thi-robosim/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
