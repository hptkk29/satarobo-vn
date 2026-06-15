// lib/testimonials.ts — đọc cảm nhận PH/HV từ DB (model Testimonial), fallback
// về dữ liệu tĩnh _data/testimonials.ts khi bảng trống (2-phase additive: site
// chạy bình thường trước khi migration + seed được apply).
import { db } from "@/lib/db";
import {
  testimonials as STATIC_TESTIMONIALS,
  type Testimonial,
} from "@/components/legacy-laptrinhrobot/_data/testimonials";

export type TestimonialView = Testimonial;

/**
 * Cảm nhận đã publish, ưu tiên theo `displayOrder`. `courseSlug` lọc theo landing
 * (kèm bản chung `courseSlug = null`). Bảng trống → trả dữ liệu tĩnh (fallback).
 */
export async function getTestimonials(courseSlug?: string): Promise<TestimonialView[]> {
  let rows;
  try {
    rows = await db.testimonial.findMany({
      where: {
        isPublished: true,
        ...(courseSlug ? { OR: [{ courseSlug }, { courseSlug: null }] } : {}),
      },
      orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
    });
  } catch {
    // Bảng chưa tồn tại (migration chưa apply) → dùng dữ liệu tĩnh (2-phase additive).
    return STATIC_TESTIMONIALS;
  }
  if (rows.length === 0) return STATIC_TESTIMONIALS;
  return rows.map((r, i) => ({
    id: i + 1,
    name: r.name,
    role: r.role,
    location: r.location,
    rating: r.rating,
    avatar: r.avatar,
    avatarColor: r.avatarColor,
    content: r.content,
  }));
}
