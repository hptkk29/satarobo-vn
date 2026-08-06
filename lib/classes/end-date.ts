import "server-only";
import { db } from "@/lib/db";
import { computeSessionDates, expandHolidaySet } from "@/lib/classes/schedule";
import { vnDateOnly } from "@/lib/time/vn";

// =============================================================================
// T3.3 (QĐ-8) — NGÀY BẾ GIẢNG gợi ý = ngày của BUỔI CUỐI theo lịch lớp, đã trừ
// ngày nghỉ. Chỉ dùng khi người tạo lớp BỎ TRỐNG ô "Ngày bế giảng" — nhập tay luôn
// được tôn trọng (override).
//
// Số buổi lấy đúng nguồn mà generateClassSessions dùng: giáo trình ghim (số Lesson,
// = số ClassSessionPlan sẽ sinh) → fallback Course.totalSessions. Lệch nguồn sẽ ra
// ngày bế giảng khác ngày buổi cuối thật.
// =============================================================================

/**
 * Ngày (bỏ giờ) — endDate là mốc NGÀY, không phải thời điểm. Lấy ngày theo LỊCH VN
 * rồi lưu nửa đêm UTC, đúng quy ước form admin ghi `startDate`
 * (`z.coerce.date("2026-06-20")`) để refine `endDate >= startDate` không lệch.
 */
function dateOnly(d: Date): Date {
  return vnDateOnly(d);
}

async function resolveSessionCount(
  courseId: string,
  curriculumId: string | null | undefined,
): Promise<number> {
  if (curriculumId) {
    const lessons = await db.lesson.count({ where: { curriculumId } });
    if (lessons > 0) return lessons;
  }
  const course = await db.course.findUnique({
    where: { id: courseId },
    select: { totalSessions: true },
  });
  return course?.totalSessions ?? 0;
}

/**
 * Ngày bế giảng gợi ý. Trả `null` khi thiếu dữ liệu (chưa có ngày khai giảng, chưa
 * chọn thứ học, hoặc khoá chưa cấu hình số buổi) — caller giữ nguyên giá trị cũ.
 */
export async function suggestClassEndDate(input: {
  centerId: string | null;
  startDate: Date | null;
  scheduleDays: number[];
  courseId: string;
  curriculumId?: string | null;
}): Promise<Date | null> {
  if (!input.startDate || input.scheduleDays.length === 0) return null;

  const count = await resolveSessionCount(input.courseId, input.curriculumId);
  if (count <= 0) return null;

  const holidayRows = await db.holiday.findMany({
    where: { OR: [{ centerId: input.centerId }, { centerId: null }] },
    select: { date: true, endDate: true },
  });

  const dates = computeSessionDates({
    from: input.startDate,
    scheduleDays: input.scheduleDays,
    count,
    holidays: expandHolidaySet(holidayRows),
  });
  const last = dates[dates.length - 1];
  return last ? dateOnly(last) : null;
}
