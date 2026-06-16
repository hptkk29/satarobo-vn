// lib/lms/media-consent.ts — R3-06: media tag bắt buộc + StudentConsent (privacy-first).
// C6.1 upload phải tag ≥1 HS · C6.2 không tag → không hiển thị PH · C6.3 chưa consent → không tag
// · C6.4 thu hồi consent → media có tag con đó ẩn ngay.
import { db } from "@/lib/db";
import { ENROLLMENT_ACTIVE_STATUS_LIST } from "@/lib/enrollment-status";

export class ConsentError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ConsentError";
    this.code = code;
  }
}

/** PH cấp đồng ý dùng hình ảnh cho 1 học viên. */
export async function grantMediaConsent(studentId: string): Promise<void> {
  await db.studentConsent.upsert({
    where: { studentId_type: { studentId, type: "CLASS_MEDIA" } },
    update: { status: "GRANTED", revokedAt: null },
    create: { studentId, type: "CLASS_MEDIA", status: "GRANTED" },
  });
}

/** PH thu hồi đồng ý (C6.4). */
export async function revokeMediaConsent(studentId: string): Promise<void> {
  await db.studentConsent.upsert({
    where: { studentId_type: { studentId, type: "CLASS_MEDIA" } },
    update: { status: "REVOKED", revokedAt: new Date() },
    create: { studentId, type: "CLASS_MEDIA", status: "REVOKED", revokedAt: new Date() },
  });
}

export async function hasMediaConsent(studentId: string): Promise<boolean> {
  const c = await db.studentConsent.findUnique({
    where: { studentId_type: { studentId, type: "CLASS_MEDIA" } },
    select: { status: true },
  });
  return c?.status === "GRANTED";
}

/**
 * R7-09 — HS đang học của 1 lớp CHƯA có consent CLASS_MEDIA (status != GRANTED).
 * Dùng cho banner cảnh báo lúc upload: nhắc GV làm mờ thủ công / loại khỏi khung,
 * và chặn tag các HS này (server-side). Trả [] nếu lớp không có HS.
 */
export async function getNonConsentStudents(
  classId: string,
): Promise<{ id: string; name: string }[]> {
  const enrollments = await db.enrollment.findMany({
    where: { classId, status: { in: ENROLLMENT_ACTIVE_STATUS_LIST } },
    select: { student: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });
  const students = enrollments.map((e) => e.student);
  if (students.length === 0) return [];

  const granted = await db.studentConsent.findMany({
    where: {
      studentId: { in: students.map((s) => s.id) },
      type: "CLASS_MEDIA",
      status: "GRANTED",
    },
    select: { studentId: true },
  });
  const grantedSet = new Set(granted.map((g) => g.studentId));
  return students.filter((s) => !grantedSet.has(s.id));
}

/** C6.3 — chỉ tag được HS đã GRANTED consent. */
export async function tagStudentToMedia(mediaId: string, studentId: string): Promise<void> {
  if (!(await hasMediaConsent(studentId))) {
    throw new ConsentError("NO_CONSENT", "Học viên chưa đồng ý dùng hình ảnh — không thể gắn thẻ.");
  }
  await db.mediaStudentTag.create({ data: { mediaId, studentId } });
}

/**
 * C6.1/C6.2/C6.4 — media có hiển thị cho PH của 1 học viên không:
 * media APPROVED + có tag học viên đó + học viên đang GRANTED consent.
 */
export async function isMediaVisibleForStudent(mediaId: string, studentId: string): Promise<boolean> {
  const [media, tag, consent] = await Promise.all([
    db.classSessionMedia.findUnique({ where: { id: mediaId }, select: { status: true } }),
    db.mediaStudentTag.findFirst({ where: { mediaId, studentId }, select: { id: true } }),
    hasMediaConsent(studentId),
  ]);
  return media?.status === "APPROVED" && !!tag && consent;
}
