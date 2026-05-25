import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Check, GraduationCap, Clock, Tag } from "lucide-react";
import { getCourseBundle } from "@/components/legacy-laptrinhrobot/_data/courses-helpers";
import {
  VALID_COURSE_SLUGS,
  courseDetails,
} from "@/components/legacy-laptrinhrobot/_data/courses-details";

const BASE_URL = "https://satarobo.vn";

// Reserved slugs that have their own static routes (must NOT be handled here)
const RESERVED_SLUGS = new Set(["laptrinhrobot", "luyenthirobosim"]);

// ─── SSG ────────────────────────────────────────────────────────────
export async function generateStaticParams() {
  return VALID_COURSE_SLUGS.map((slug) => ({ slug }));
}

// ─── SEO METADATA ───────────────────────────────────────────────────
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const detail = courseDetails[slug.toLowerCase()];
  if (!detail) {
    return { title: "Không tìm thấy khóa học | Sata Robo" };
  }
  return {
    title: detail.metaTitle,
    description: detail.metaDescription,
    alternates: { canonical: `${BASE_URL}/khoa-hoc/${slug.toLowerCase()}` },
    openGraph: {
      title: detail.metaTitle,
      description: detail.metaDescription,
      url: `${BASE_URL}/khoa-hoc/${slug.toLowerCase()}`,
      siteName: "Sata Robo",
      locale: "vi_VN",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: detail.metaTitle,
      description: detail.metaDescription,
    },
  };
}

const formatVnd = (n: number) => n.toLocaleString("vi-VN") + "đ";

export default async function CoursePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const slugLower = slug.toLowerCase();

  // Guard: don't intercept reserved routes
  if (RESERVED_SLUGS.has(slugLower)) {
    notFound();
  }

  const bundle = getCourseBundle(slugLower);
  if (!bundle) notFound();

  const { course, detail } = bundle;

  // Pricing display logic
  const isFixedPrice = !!course.fixedPrice;
  const finalPrice =
    course.fixedPrice ??
    course.comboPrice ??
    course.earlyBirdPrice ??
    course.listPrice;
  const showDiscount =
    !isFixedPrice &&
    course.earlyBirdPrice !== undefined &&
    course.earlyBirdPrice < course.listPrice;
  const discountPct = showDiscount
    ? Math.round(
        ((course.listPrice - (course.earlyBirdPrice ?? 0)) /
          course.listPrice) *
          100,
      )
    : 0;
  const savedAmount =
    course.savedAmount ??
    course.listPrice - (course.earlyBirdPrice ?? course.listPrice);

  return (
    <main className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-purple-50">
      {/* Breadcrumb */}
      <nav className="container mx-auto max-w-6xl px-4 py-4 text-sm text-gray-600">
        <Link
          href="/khoa-hoc/laptrinhrobot"
          className="inline-flex items-center gap-1 hover:text-orange-600 hover:underline"
        >
          <ChevronLeft size={16} /> So sánh các khóa học khác
        </Link>
      </nav>

      {/* HERO */}
      <section className="container mx-auto max-w-6xl px-4 pt-4 pb-12">
        <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
          {/* Left: Info */}
          <div className="flex flex-col justify-center">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold text-orange-700">
                <GraduationCap size={14} />
                {detail.audienceTag}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-3 py-1 text-xs font-semibold text-purple-700">
                <Clock size={14} />
                {course.sessions} buổi · {course.totalDuration}
              </span>
              {course.badge && (
                <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-orange-500 to-purple-600 px-3 py-1 text-xs font-bold text-white">
                  ★ {course.badge}
                </span>
              )}
            </div>

            <h1 className="mb-3 text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl">
              {course.shortName ?? course.name}
            </h1>
            <p className="mb-6 text-lg text-gray-700">
              {detail.audienceDescription}
            </p>

            {/* Price block */}
            <div className="mb-6 rounded-2xl border border-orange-200 bg-white p-6 shadow-sm">
              {showDiscount ? (
                <>
                  <div className="mb-1 flex items-center gap-3">
                    <span className="text-gray-400 line-through">
                      {formatVnd(course.listPrice)}
                    </span>
                    <span className="rounded-md bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">
                      −{discountPct}%
                    </span>
                  </div>
                  <div className="mb-1 text-4xl font-extrabold text-orange-600">
                    {formatVnd(finalPrice)}
                  </div>
                  <div className="text-sm text-gray-600">
                    Tiết kiệm{" "}
                    <strong className="text-green-600">
                      {formatVnd(savedAmount)}
                    </strong>
                    {course.installmentOutside && (
                      <>
                        {" "}
                        · hoặc{" "}
                        <strong>
                          {formatVnd(course.installmentOutside)}/tháng × 12
                          tháng
                        </strong>
                      </>
                    )}
                  </div>
                </>
              ) : isFixedPrice ? (
                <>
                  <div className="mb-1 text-4xl font-extrabold text-orange-600">
                    {formatVnd(finalPrice)}
                  </div>
                  <div className="text-sm font-semibold text-gray-700">
                    Giá CỐ ĐỊNH · không áp dụng giảm giá thêm
                  </div>
                </>
              ) : (
                <div className="text-4xl font-extrabold text-orange-600">
                  {formatVnd(finalPrice)}
                </div>
              )}
            </div>

            {/* CTAs (Phase A2 sẽ wire) */}
            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                disabled
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 px-6 py-4 text-base font-bold text-white shadow-lg shadow-orange-500/30 transition hover:from-orange-600 hover:to-orange-700 disabled:opacity-70"
              >
                Đăng ký tư vấn miễn phí
              </button>
              <button
                type="button"
                disabled
                className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-purple-300 bg-white px-6 py-4 text-base font-semibold text-purple-700 transition hover:bg-purple-50 disabled:opacity-50"
                title="Tính năng mua trực tiếp sẽ ra mắt sau khi hoàn thiện hệ thống thanh toán"
              >
                Mua ngay <span className="text-xs">(sắp ra mắt)</span>
              </button>
            </div>
            <p className="mt-2 text-xs text-gray-500">
              CTA tư vấn sẽ hoạt động sau Phase A2. Hiện tại vui lòng gọi
              hotline 0818.823.720.
            </p>
          </div>

          {/* Right: Image placeholder */}
          <div className="relative flex min-h-[300px] items-center justify-center rounded-2xl bg-gradient-to-br from-orange-100 to-purple-100 p-8 lg:min-h-[400px]">
            <div className="text-center">
              <div className="mb-4 text-7xl">🤖</div>
              <div className="text-lg font-bold text-gray-700">
                {course.shortName ?? course.name}
              </div>
              <div className="mt-1 text-sm text-gray-500">
                (Hình ảnh khóa học sẽ bổ sung sau)
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* MISSION */}
      <section className="bg-white py-16">
        <div className="container mx-auto max-w-4xl px-4">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-orange-100 px-3 py-1 text-xs font-bold text-orange-700">
            SỨ MỆNH KHÓA HỌC
          </div>
          <h2 className="mb-4 text-3xl font-extrabold text-gray-900">
            Khóa học này dành cho ai?
          </h2>
          <p className="whitespace-pre-line text-lg leading-relaxed text-gray-700">
            {detail.mission}
          </p>
        </div>
      </section>

      {/* OUTCOMES */}
      <section className="bg-gradient-to-br from-green-50 to-emerald-50 py-16">
        <div className="container mx-auto max-w-4xl px-4">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-700">
            SAU KHI HOÀN THÀNH
          </div>
          <h2 className="mb-6 text-3xl font-extrabold text-gray-900">
            Con sẽ đạt được gì?
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {detail.outcomes.map((outcome, i) => (
              <li
                key={i}
                className="flex items-start gap-3 rounded-xl bg-white p-4 shadow-sm"
              >
                <Check
                  className="mt-0.5 flex-shrink-0 text-green-600"
                  size={20}
                />
                <span className="text-gray-800">{outcome}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* HIGHLIGHTS */}
      <section className="bg-white py-16">
        <div className="container mx-auto max-w-4xl px-4">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-purple-100 px-3 py-1 text-xs font-bold text-purple-700">
            ĐIỂM NỔI BẬT
          </div>
          <h2 className="mb-6 text-3xl font-extrabold text-gray-900">
            Tại sao chọn khóa này?
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {detail.highlights.map((highlight, i) => (
              <div
                key={i}
                className="rounded-xl border border-purple-100 bg-purple-50/50 p-4"
              >
                <div className="flex items-start gap-3">
                  <Tag
                    className="mt-0.5 flex-shrink-0 text-purple-600"
                    size={18}
                  />
                  <span className="text-gray-800">{highlight}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SPECIAL NOTE */}
      {detail.noteForParents && (
        <section className="bg-yellow-50 py-8">
          <div className="container mx-auto max-w-4xl px-4">
            <div className="rounded-xl border-l-4 border-yellow-500 bg-white p-6 shadow-sm">
              <div className="mb-2 font-bold text-yellow-800">
                Lưu ý đặc biệt cho phụ huynh
              </div>
              <p className="text-gray-800">{detail.noteForParents}</p>
            </div>
          </div>
        </section>
      )}

      {/* DEVICE INFO */}
      <section className="bg-gray-50 py-12">
        <div className="container mx-auto max-w-4xl px-4">
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <h3 className="mb-3 text-lg font-bold text-gray-900">
              Thiết bị sử dụng
            </h3>
            <p className="text-gray-700">{course.device}</p>
            {course.format && (
              <p className="mt-2 text-sm text-gray-600">
                <strong>Hình thức:</strong> {course.format}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* CTA BOTTOM */}
      <section className="bg-gradient-to-r from-orange-500 to-purple-600 py-16">
        <div className="container mx-auto max-w-4xl px-4 text-center">
          <h2 className="mb-3 text-3xl font-extrabold text-white">
            Sẵn sàng cho con bắt đầu?
          </h2>
          <p className="mb-6 text-lg text-orange-100">
            Đăng ký tư vấn miễn phí — Sata Robo sẽ liên hệ trong 30 phút
          </p>
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <button
              type="button"
              disabled
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-8 py-4 text-lg font-bold text-orange-600 shadow-xl transition hover:bg-orange-50 disabled:opacity-70"
            >
              Đăng ký tư vấn miễn phí
            </button>
            <a
              href="tel:0818823720"
              className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-white px-8 py-4 text-lg font-bold text-white transition hover:bg-white/10"
            >
              Hotline 0818.823.720
            </a>
          </div>
          <div className="mt-6">
            <Link
              href="/khoa-hoc/laptrinhrobot"
              className="text-sm text-white/80 underline hover:text-white"
            >
              ← So sánh với các khóa học khác
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
