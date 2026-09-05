/**
 * Site Sale — TRUY VẤN danh sách lớp học cho màn `/sale/lop-hoc`.
 *
 * ══ ĐÂY LÀ BẢN ĐÔI CỦA TRUY VẤN TRONG `app/(admin)/admin/classes/page.tsx` ══
 *
 * ── Vì sao nó tồn tại ───────────────────────────────────────────────────────
 * Chủ dự án chốt 04/09/2026: các màn site Sale phải TÁCH BẢN RIÊNG, không dùng
 * chung component với khu quản trị nữa — để thiết kế lại site Sale mà KHÔNG đụng
 * một pixel nào của khu quản trị. Rủi ro trôi lệch đã được nêu; chủ dự án vẫn
 * chọn đường này. Trang admin truy vấn DB ngay trong `page.tsx` nên không có hàm
 * nào để gọi lại.
 *
 * ── NỢ TRÔI LỆCH: sửa bên nào cũng phải sửa bên kia ─────────────────────────
 *   1. Bộ `select` của lớp (thêm/bớt cột hiển thị).
 *   2. Cách dựng `where` (q trên name+classCode, status, centerId, courseId,
 *      teacherId trên CẢ `teacherId` LẪN `assistantId`).
 *   3. Luật `effectiveTeacherFilter`: chỉ có `classes:view-own` thì ép lọc về
 *      chính mình. Bỏ sót vế này là GV/trợ giảng thấy lớp của người khác.
 *   4. `orderBy` (status → startDate desc → createdAt desc).
 * KHÔNG phải nợ vì đã dùng chung ở `lib/`: `getAssignableTeachers`,
 * `ENROLLMENT_ACTIVE_STATUS_LIST`, `scopedDb`.
 *
 * ⚠️ `.catch(() => [])` giữ nguyên từ bản admin CÓ CHỦ ĐÍCH: bốn truy vấn chạy
 *    song song, và một ô lọc hỏng không được làm trắng cả màn danh sách lớp.
 */
import { ClassStatus, type Prisma } from "@prisma/client";
import type { Actor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { ENROLLMENT_ACTIVE_STATUS_LIST } from "@/lib/enrollment-status";
import { getAssignableTeachers } from "@/lib/teachers/assignable";

export const MOI_TRANG_THAI_LOP = Object.values(ClassStatus);

export type DongLop = {
  id: string;
  classCode: string | null;
  name: string;
  status: ClassStatus;
  startDate: Date | null;
  scheduleDays: number[];
  startTime: string | null;
  endTime: string | null;
  maxStudents: number;
  course: { name: string } | null;
  center: { name: string } | null;
  room: { code: string } | null;
  teacher: { name: string | null } | null;
  _count: { enrollments: number; sessions: number };
};

export type ChonLoc = { value: string; label: string };

export type ThamSoLopHoc = {
  actor: Actor;
  /** Id người đang đăng nhập — dùng khi chỉ có `classes:view-own`. */
  userId: string;
  q: string | undefined;
  status: ClassStatus | undefined;
  centerId: string | undefined;
  courseId: string | undefined;
  teacherId: string | undefined;
  /** Kết quả `checkPermission("classes:view-all")` — quyết định ở trang vì cần session. */
  xemDuocTatCa: boolean;
  /** Kết quả `checkPermission("classes:view-own")`. */
  xemDuocCuaMinh: boolean;
};

export type KetQuaLopHoc = {
  lop: DongLop[];
  coSo: ChonLoc[];
  khoa: ChonLoc[];
  giaoVien: ChonLoc[];
};

export async function docDanhSachLopHoc(t: ThamSoLopHoc): Promise<KetQuaLopHoc> {
  const sdb = scopedDb(t.actor);

  // Chỉ có `view-own` (không có `view-all`) ⇒ ép lọc về chính mình, bất kể ô lọc
  // GV trên URL. Đây là ràng buộc QUYỀN, không phải bộ lọc giao diện.
  const locGv = !t.xemDuocTatCa && t.xemDuocCuaMinh ? t.userId : t.teacherId;

  const baseWhere: Prisma.ClassWhereInput = {
    deletedAt: null,
    ...(t.status ? { status: t.status } : {}),
    ...(t.centerId ? { centerId: t.centerId } : {}),
    ...(t.courseId ? { courseId: t.courseId } : {}),
  };
  const and: Prisma.ClassWhereInput[] = [];
  if (locGv) {
    // Trợ giảng cũng là "GV của lớp" — bỏ `assistantId` là trợ giảng không thấy lớp mình.
    and.push({ OR: [{ teacherId: locGv }, { assistantId: locGv }] });
  }
  if (t.q) {
    and.push({
      OR: [
        { name: { contains: t.q, mode: "insensitive" } },
        { classCode: { contains: t.q, mode: "insensitive" } },
      ],
    });
  }
  const where: Prisma.ClassWhereInput = and.length > 0 ? { ...baseWhere, AND: and } : baseWhere;

  const [lop, coSo, khoa, giaoVien] = await Promise.all([
    sdb.class
      .findMany({
        where,
        orderBy: [{ status: "asc" }, { startDate: "desc" }, { createdAt: "desc" }],
        select: {
          id: true,
          classCode: true,
          name: true,
          status: true,
          startDate: true,
          scheduleDays: true,
          startTime: true,
          endTime: true,
          maxStudents: true,
          course: { select: { name: true } },
          center: { select: { name: true } },
          room: { select: { code: true } },
          teacher: { select: { name: true } },
          _count: {
            select: {
              enrollments: {
                where: { status: { in: ENROLLMENT_ACTIVE_STATUS_LIST }, deletedAt: null },
              },
              sessions: true,
            },
          },
        },
      })
      .catch(() => [] as DongLop[]),
    sdb.center
      .findMany({
        where: { isActive: true },
        orderBy: { displayOrder: "asc" },
        select: { id: true, name: true },
      })
      .catch(() => [] as Array<{ id: string; name: string }>),
    sdb.course
      .findMany({
        where: { isActive: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      })
      .catch(() => [] as Array<{ id: string; name: string }>),
    // GV là NGUỒN LỰC CHUNG (Hội sở điều đi mọi cơ sở) — cố ý KHÔNG lọc theo cơ sở,
    // nếu không thì CS2 không bao giờ tới được form và ô lọc phía dưới thành vô nghĩa.
    getAssignableTeachers({}).catch(() => [] as Array<{ id: string; name: string | null }>),
  ]);

  return {
    lop: lop as DongLop[],
    coSo: coSo.map((c) => ({ value: c.id, label: c.name })),
    khoa: khoa.map((c) => ({ value: c.id, label: c.name })),
    giaoVien: giaoVien.map((g) => ({ value: g.id, label: g.name ?? "(chưa đặt tên)" })),
  };
}
