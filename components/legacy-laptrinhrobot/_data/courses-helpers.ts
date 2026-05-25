import { courseGroups, type Course } from "./courses-pricing";
import { courseDetails, type CourseDetail } from "./courses-details";

const allCourses: Course[] = courseGroups.flatMap((g) => g.courses);

/**
 * Get course by slug (case-insensitive, matches Course.id lowercase
 * or combo slug "combo-sata1-sata2").
 */
export function getCourseBySlug(slug: string): Course | null {
  const s = slug.toLowerCase();
  // Combo special case
  if (s === "combo-sata1-sata2") {
    return allCourses.find((c) => c.id === "Combo") ?? null;
  }
  // Sata1-Sata8: case-insensitive match
  return allCourses.find((c) => c.id.toLowerCase() === s) ?? null;
}

/**
 * Get both pricing + detail data for a slug.
 */
export function getCourseBundle(slug: string): {
  course: Course;
  detail: CourseDetail;
} | null {
  const course = getCourseBySlug(slug);
  const detail = courseDetails[slug.toLowerCase()];
  if (!course || !detail) return null;
  return { course, detail };
}
