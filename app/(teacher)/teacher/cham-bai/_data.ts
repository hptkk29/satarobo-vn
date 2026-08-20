// app/(teacher)/teacher/cham-bai/_data.ts — loader server dùng chung cho trang
// "Bài tập & kiểm tra" (3 tab), route /teacher/kho-bai-tap và tab Bài tập của Class
// Hub (parity 18/08). Server-only: deserialize câu hỏi thành ContentQuestion rồi
// truyền plain data xuống client.
//
// "Kho của tôi" = createdById === ownerId; "Thư viện admin" = phần còn lại, lọc theo
// khoá GV phụ trách (đề không gắn khoá hiện với mọi người — giữ hành vi cũ).
import type { Prisma } from "@prisma/client";
import type { scopedDb } from "@/lib/db-scope";
import { ENROLLMENT_ACTIVE_STATUS_LIST } from "@/lib/enrollment-status";
import { deserializeQuestionRow } from "@/lib/assignments/question-content-db";
import type { KhoCourseOption, KhoTemplate } from "../kho-bai-tap/_types";

const dateFmt = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Asia/Ho_Chi_Minh",
});

const sessionFmt = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "Asia/Ho_Chi_Minh",
});

type Sdb = ReturnType<typeof scopedDb>;

/** Lớp GV có thể giao bài (kèm khoá + sĩ số cho dialog Giao bài). */
export interface AssignClassOption {
  id: string;
  name: string;
  courseId: string | null;
  courseName: string | null;
  studentCount: number;
}

/** Buổi học sắp tới của lớp — gắn bài vào buổi (không bắt buộc). */
export interface AssignSessionOption {
  id: string;
  classId: string;
  /** "dd/MM · chủ đề" — đã format server để client hiển thị thẳng. */
  label: string;
}

export interface TeacherAssignData {
  classes: AssignClassOption[];
  sessions: AssignSessionOption[];
  courses: KhoCourseOption[];
  /** Đề GV tự soạn (đầy đủ câu hỏi — dùng cho preview + sửa). */
  mine: KhoTemplate[];
  /** Thư viện admin/Đào tạo cho các khoá GV phụ trách (đọc-only với GV). */
  library: KhoTemplate[];
}

const TEMPLATE_SELECT = {
  id: true,
  title: true,
  description: true,
  kind: true,
  totalPoints: true,
  createdAt: true,
  createdById: true,
  curriculum: {
    select: { courseId: true, course: { select: { name: true } } },
  },
  templateQuestions: {
    orderBy: { order: "asc" as const },
    select: {
      question: {
        select: {
          id: true,
          type: true,
          text: true,
          correctAnswer: true,
          meta: true,
          choices: {
            orderBy: { order: "asc" as const },
            select: { order: true, text: true, isCorrect: true },
          },
        },
      },
    },
  },
} as const;

type TemplateRow = Prisma.AssignmentTemplateGetPayload<{ select: typeof TEMPLATE_SELECT }>;

function toKhoTemplate(t: TemplateRow): KhoTemplate {
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    kind: t.kind,
    courseId: t.curriculum?.courseId ?? null,
    courseName: t.curriculum?.course?.name ?? null,
    totalPoints: t.totalPoints,
    questionCount: t.templateQuestions.length,
    createdAt: dateFmt.format(t.createdAt),
    questions: t.templateQuestions.map((tq) => deserializeQuestionRow(tq.question)),
  };
}

/**
 * Tải toàn bộ dữ liệu cho trang Bài tập & kiểm tra + dialog Giao bài.
 * `lockClassId` (từ Class Hub) khoá danh sách lớp về đúng 1 lớp.
 */
export async function loadTeacherAssignData(
  sdb: Sdb,
  opts: {
    ownerId: string;
    classIds: string[];
    lockClassId?: string | null;
  },
): Promise<TeacherAssignData> {
  const { ownerId, classIds } = opts;
  const visibleClassIds =
    opts.lockClassId && classIds.includes(opts.lockClassId)
      ? [opts.lockClassId]
      : classIds;

  // GV chưa có lớp: vẫn thấy KHO CỦA MÌNH (soạn trước), chỉ trống lớp/buổi/thư viện.
  const [classRows, sessionRows, mineRows, libraryRows] = await Promise.all([
    visibleClassIds.length
      ? sdb.class.findMany({
          where: { id: { in: visibleClassIds } },
          select: {
            id: true,
            name: true,
            courseId: true,
            course: { select: { name: true } },
            _count: {
              select: {
                enrollments: {
                  where: { status: { in: ENROLLMENT_ACTIVE_STATUS_LIST } },
                },
              },
            },
          },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
    // Buổi từ 7 ngày trước tới tương lai (giao bài cho buổi vừa dạy vẫn tiện).
    visibleClassIds.length
      ? sdb.classSession.findMany({
          where: {
            classId: { in: visibleClassIds },
            status: { not: "CANCELLED" },
            date: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
          },
          select: { id: true, classId: true, date: true, topic: true },
          orderBy: { date: "asc" },
          take: 200,
        })
      : Promise.resolve([]),
    // 2 truy vấn tách pool: kho CỦA MÌNH không bao giờ bị đề người khác chiếm chỗ
    // trong giới hạn take (kho đầy vẫn hiện đủ đề của GV).
    sdb.assignmentTemplate.findMany({
      where: { createdById: ownerId },
      select: TEMPLATE_SELECT,
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    sdb.assignmentTemplate.findMany({
      // createdById null (mẫu hệ thống/không dấu vết) vẫn thuộc thư viện —
      // `not` của Prisma loại null nên phải OR tường minh.
      where: {
        OR: [{ createdById: null }, { createdById: { not: ownerId } }],
      },
      select: TEMPLATE_SELECT,
      orderBy: { createdAt: "desc" },
      take: 300,
    }),
  ]);

  // Khoá của các lớp GV phụ trách — nguồn cho ô "Khoá học" khi soạn đề + lọc thư viện.
  const courseById = new Map<string, string>();
  for (const c of classRows) {
    if (c.courseId && c.course) courseById.set(c.courseId, c.course.name);
  }

  const mine: KhoTemplate[] = mineRows.map(toKhoTemplate);
  // Thư viện: chỉ mẫu thuộc khoá GV phụ trách (mẫu không gắn khoá hiện với mọi người).
  const library: KhoTemplate[] = libraryRows
    .map(toKhoTemplate)
    .filter((t) => t.courseId === null || courseById.has(t.courseId));

  return {
    classes: classRows.map((c) => ({
      id: c.id,
      name: c.name,
      courseId: c.courseId,
      courseName: c.course?.name ?? null,
      studentCount: c._count.enrollments,
    })),
    sessions: sessionRows.map((s) => ({
      id: s.id,
      classId: s.classId,
      label: `${sessionFmt.format(s.date)} · ${s.topic?.trim() || "Buổi học"}`,
    })),
    courses: [...courseById.entries()].map(([id, name]) => ({ id, name })),
    mine,
    library,
  };
}
