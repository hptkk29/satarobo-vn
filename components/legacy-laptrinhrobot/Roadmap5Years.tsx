"use client";

import Link from "next/link";
import {
  CheckCircle2,
  ChevronRight,
  Trophy,
  ShieldCheck,
  Sprout,
  Rocket,
  Zap,
  Bot,
  type LucideIcon,
} from "lucide-react";
import { courseGroups, type Course } from "./_data/courses-pricing";

const fmt = (n?: number) => (n ? `${n.toLocaleString("vi-VN")}đ` : "-");

const allCourses: Course[] = courseGroups.flatMap((g) => g.courses);
const getCourse = (id: string): Course | undefined =>
  allCourses.find((c) => c.id === id);

// Map Course.id -> slug cho URL
const ID_TO_SLUG: Record<string, string> = {
  Sata1: "sata1",
  Sata2: "sata2",
  Combo: "combo-sata1-sata2",
  Sata3: "sata3",
  Sata4: "sata4",
  Sata5: "sata5",
  Sata6: "sata6",
  Sata7: "sata7",
  Sata8: "sata8",
};

// Icons + accent cho longterm courses
const LONGTERM_META: Record<string, { Icon: LucideIcon; color: string }> = {
  Sata3: { Icon: Sprout, color: "from-emerald-500 to-emerald-600" },
  Sata4: { Icon: Rocket, color: "from-indigo-500 to-indigo-600" },
  Sata5: { Icon: Zap, color: "from-amber-500 to-amber-600" },
  Sata6: { Icon: Trophy, color: "from-orange-500 to-orange-600" },
  Sata7: { Icon: Bot, color: "from-violet-500 to-violet-600" },
};

// ─── EXAM CARD (Sata1, Sata2, Combo, Sata8) ─────────────────────────
function ExamCard({ courseId }: { courseId: string }) {
  const course = getCourse(courseId);
  if (!course) return null;

  const slug = ID_TO_SLUG[courseId];
  const isCombo = courseId === "Combo";
  const isSata8 = courseId === "Sata8";
  const Icon = isCombo ? Trophy : isSata8 ? ShieldCheck : CheckCircle2;

  const finalPrice =
    course.fixedPrice ??
    course.comboPrice ??
    course.earlyBirdPrice ??
    course.listPrice;
  const showDiscount =
    !course.fixedPrice &&
    course.earlyBirdPrice !== undefined &&
    course.earlyBirdPrice < course.listPrice;
  const discountPct = showDiscount
    ? Math.round(
        ((course.listPrice - (course.earlyBirdPrice ?? 0)) /
          course.listPrice) *
          100,
      )
    : 0;

  return (
    <article
      className={`relative flex h-full flex-col rounded-3xl border-2 p-6 shadow-lg transition hover:scale-[1.02] hover:shadow-xl ${
        isCombo
          ? "border-orange-400 bg-gradient-to-br from-orange-50 via-yellow-50 to-white"
          : isSata8
            ? "border-purple-400 bg-gradient-to-br from-purple-50 via-pink-50 to-white"
            : "border-gray-200 bg-white"
      }`}
    >
      {/* Premium badge for Combo/Sata8 */}
      {(isCombo || isSata8) && (
        <div
          className={`-mx-6 -mt-6 mb-4 rounded-t-3xl px-6 py-2 text-center text-xs font-black uppercase tracking-widest text-white ${
            isCombo ? "bg-orange-500" : "bg-purple-600"
          }`}
        >
          {isCombo
            ? "Gói đề xuất — Tiết kiệm 15%"
            : "Cam kết hoàn tiền 100%"}
        </div>
      )}

      <div className="mb-3 flex items-start gap-3">
        <span
          className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl text-white shadow-md ${
            isCombo ? "bg-orange-500" : isSata8 ? "bg-purple-600" : "bg-blue-500"
          }`}
        >
          <Icon className="h-6 w-6" />
        </span>
        <div>
          {course.badge && (
            <span className="mb-1 inline-flex rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-black text-orange-700">
              {course.badge}
            </span>
          )}
          <h3 className="text-xl font-black leading-tight text-gray-900">
            {course.displayName ?? course.name}
          </h3>
          <p className="mt-1 text-xs font-semibold text-gray-600">
            {course.grade} · {course.sessions} buổi · {course.totalDuration}
          </p>
        </div>
      </div>

      <p className="mb-4 flex-1 text-sm text-gray-700">{course.note}</p>

      {/* Price block */}
      <div className="mb-4 rounded-xl bg-gray-50 p-4">
        {showDiscount ? (
          <>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-400 line-through">
                {fmt(course.listPrice)}
              </span>
              <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">
                −{discountPct}%
              </span>
            </div>
            <div className="text-2xl font-extrabold text-orange-600">
              {fmt(finalPrice)}
            </div>
            {course.savedAmount && (
              <div className="text-xs font-semibold text-green-600">
                Tiết kiệm {fmt(course.savedAmount)}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="text-2xl font-extrabold text-orange-600">
              {fmt(finalPrice)}
            </div>
            {course.fixedPrice && (
              <div className="text-xs font-semibold text-gray-600">
                Giá cố định
              </div>
            )}
          </>
        )}
      </div>

      <Link
        href={`/khoa-hoc/${slug}`}
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 px-4 py-3 text-sm font-bold text-white shadow-md transition hover:from-orange-600 hover:to-orange-700"
      >
        Xem chi tiết khoá học <ChevronRight size={16} />
      </Link>
    </article>
  );
}

// ─── LONGTERM CARD (Sata3-Sata7) ────────────────────────────────────
function LongtermCard({ courseId }: { courseId: string }) {
  const course = getCourse(courseId);
  if (!course) return null;

  const slug = ID_TO_SLUG[courseId];
  const meta = LONGTERM_META[courseId] ?? LONGTERM_META.Sata3;
  const { Icon, color } = meta;

  const finalPrice = course.earlyBirdPrice ?? course.listPrice;
  const discountPct = course.earlyBirdPrice
    ? Math.round(
        ((course.listPrice - course.earlyBirdPrice) / course.listPrice) * 100,
      )
    : 0;

  return (
    <article className="flex h-full flex-col rounded-3xl border-2 border-gray-200 bg-white p-6 shadow-lg transition hover:scale-[1.02] hover:shadow-xl">
      <div className="mb-3 flex items-start gap-3">
        <span
          className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${color} text-white shadow-md`}
        >
          <Icon className="h-6 w-6" />
        </span>
        <div className="flex-1">
          {course.badge && (
            <span className="mb-1 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-700">
              {course.badge}
            </span>
          )}
          <h3 className="text-xl font-black leading-tight text-gray-900">
            {course.displayName ?? course.name}
          </h3>
          <p className="mt-1 text-xs font-semibold text-gray-600">
            {course.grade} · 48 buổi · 4 học phần
          </p>
        </div>
      </div>

      <p className="mb-4 flex-1 text-sm text-gray-700">{course.note}</p>

      <div className="mb-4 rounded-xl bg-gray-50 p-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400 line-through">
            {fmt(course.listPrice)}
          </span>
          {discountPct > 0 && (
            <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">
              −{discountPct}%
            </span>
          )}
        </div>
        <div className="text-2xl font-extrabold text-orange-600">
          {fmt(finalPrice)}
        </div>
        {course.installmentOutside && (
          <div className="text-xs text-gray-600">
            hoặc{" "}
            <strong>
              {fmt(course.installmentOutside)}/tháng × 12 tháng
            </strong>
          </div>
        )}
      </div>

      <Link
        href={`/khoa-hoc/${slug}`}
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 px-4 py-3 text-sm font-bold text-white shadow-md transition hover:from-orange-600 hover:to-orange-700"
      >
        Xem chi tiết khoá học <ChevronRight size={16} />
      </Link>
    </article>
  );
}

// ─── MAIN COMPONENT ─────────────────────────────────────────────────
export default function Roadmap5Years() {
  return (
    <section className="bg-gradient-to-br from-orange-50/30 via-white to-purple-50/30 py-16">
      <div className="container mx-auto max-w-6xl px-4">
        {/* GROUP 1: Khoá luyện thi */}
        <div className="mb-16">
          <div className="mb-8 text-center">
            <span className="inline-flex items-center gap-2 rounded-full bg-orange-100 px-4 py-2 text-xs font-black uppercase tracking-widest text-orange-700">
              KHOÁ LUYỆN THI ROBOTICS 2026
            </span>
            <h2 className="mt-4 text-3xl font-extrabold text-gray-900 sm:text-4xl">
              Trọn lộ trình luyện thi vòng loại đến chung kết
            </h2>
            <p className="mt-2 text-gray-600">
              Phù hợp cho học sinh chuẩn bị thi Cuộc thi Sáng tạo Robotics 2026
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <ExamCard courseId="Sata1" />
            <ExamCard courseId="Sata2" />
            <ExamCard courseId="Combo" />
            <ExamCard courseId="Sata8" />
          </div>
        </div>

        {/* GROUP 2: Khoá chuyên sâu 5 năm */}
        <div>
          <div className="mb-8 text-center">
            <span className="inline-flex items-center gap-2 rounded-full bg-purple-100 px-4 py-2 text-xs font-black uppercase tracking-widest text-purple-700">
              LỘ TRÌNH 5 NĂM ROBOTICS
            </span>
            <h2 className="mt-4 text-3xl font-extrabold text-gray-900 sm:text-4xl">
              Đào tạo Robotics bài bản từ Lớp 1 đến Lớp 8
            </h2>
            <p className="mt-2 text-gray-600">
              5 khoá học × 48 buổi/năm · 4 học phần/năm · 240 buổi tổng cho hành trình 5 năm
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <LongtermCard courseId="Sata3" />
            <LongtermCard courseId="Sata4" />
            <LongtermCard courseId="Sata5" />
            <LongtermCard courseId="Sata6" />
            <LongtermCard courseId="Sata7" />
          </div>
        </div>
      </div>
    </section>
  );
}
