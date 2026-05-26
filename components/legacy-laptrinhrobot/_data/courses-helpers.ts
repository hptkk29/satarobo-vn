import { cache } from "react";
import { db } from "@/lib/db";
import { courseGroups, type Course } from "./courses-pricing";
import { courseDetails, type CourseDetail } from "./courses-details";
import { examRoadmap, type ExamRoadmapItem } from "./exam-roadmap";
import { roadmap5Years, type RoadmapCourse } from "./roadmap-5-years";

const allCourses: Course[] = courseGroups.flatMap((g) => g.courses);

// Map slug -> Course.id
const SLUG_TO_COURSE_ID: Record<string, string> = {
  sata1: "Sata1",
  sata2: "Sata2",
  sata3: "Sata3",
  sata4: "Sata4",
  sata5: "Sata5",
  sata6: "Sata6",
  sata7: "Sata7",
  sata8: "Sata8",
  "combo-sata1-sata2": "Combo",
};

// Exam courses (luyện thi): hiển thị lessons + goal + methods
const EXAM_SLUGS = new Set(["sata1", "sata2", "combo-sata1-sata2", "sata8"]);

// Longterm courses (chuyên sâu 5 năm): hiển thị 4 modules
const LONGTERM_SLUGS = new Set([
  "sata3",
  "sata4",
  "sata5",
  "sata6",
  "sata7",
]);

export type CourseType = "exam" | "longterm";

export function getCourseType(slug: string): CourseType | null {
  const s = slug.toLowerCase();
  if (EXAM_SLUGS.has(s)) return "exam";
  if (LONGTERM_SLUGS.has(s)) return "longterm";
  return null;
}

export function getCourseBySlug(slug: string): Course | null {
  const courseId = SLUG_TO_COURSE_ID[slug.toLowerCase()];
  if (!courseId) return null;
  return allCourses.find((c) => c.id === courseId) ?? null;
}

export function getExamRoadmapBySlug(slug: string): ExamRoadmapItem | null {
  const courseId = SLUG_TO_COURSE_ID[slug.toLowerCase()];
  if (!courseId) return null;
  return examRoadmap.find((e) => e.id === courseId) ?? null;
}

export function getRoadmapCourseBySlug(slug: string): RoadmapCourse | null {
  const courseId = SLUG_TO_COURSE_ID[slug.toLowerCase()];
  if (!courseId) return null;
  return roadmap5Years.find((r) => r.productCode === courseId) ?? null;
}

/**
 * Phase TD-1 — Load CoursePackage detail content từ DB.
 * Returns null nếu slug không có trong DB.
 *
 * Cached: dùng React `cache()` để dedupe trong cùng request.
 */
export const getCoursePackageFromDb = cache(async (slug: string) => {
  // Graceful fallback: nếu DB unreachable (VD: build worker thiếu DATABASE_URL),
  // return null để page render từ hardcoded courses-details.ts.
  try {
    return await db.coursePackage.findUnique({
      where: { slug: slug.toLowerCase() },
      select: {
        slug: true,
        audienceTag: true,
        audienceDescription: true,
        mission: true,
        outcomesJson: true,
        methodsJson: true,
        conditionsJson: true,
        noteForParents: true,
        faqsJson: true,
        highlights: true,
        heroImageUrl: true,
        galleryImageUrlsJson: true,
      },
    });
  } catch (err) {
    console.warn(
      `[courses-helpers] DB lookup failed for slug=${slug} — fallback to hardcoded:`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }
});

/**
 * Aggregate all data for a course slug.
 */
export function getCourseBundle(slug: string): {
  course: Course;
  detail: CourseDetail;
  type: CourseType;
  exam: ExamRoadmapItem | null;
  longterm: RoadmapCourse | null;
} | null {
  const slugLower = slug.toLowerCase();
  const course = getCourseBySlug(slugLower);
  const detail = courseDetails[slugLower];
  const type = getCourseType(slugLower);
  if (!course || !detail || !type) return null;

  return {
    course,
    detail,
    type,
    exam: type === "exam" ? getExamRoadmapBySlug(slugLower) : null,
    longterm: type === "longterm" ? getRoadmapCourseBySlug(slugLower) : null,
  };
}
