/**
 * Site Sale — TRUY VẤN danh sách học viên cho màn `/sale/hoc-vien`.
 *
 * ══ ĐÂY LÀ BẢN ĐÔI CỦA TRUY VẤN TRONG `app/(admin)/admin/students/page.tsx` ══
 *
 * ── Vì sao nó tồn tại ───────────────────────────────────────────────────────
 * Chủ dự án chốt 04/09/2026: các màn site Sale phải TÁCH BẢN RIÊNG, không dùng
 * chung component với khu quản trị nữa — họ muốn thiết kế lại site Sale mà
 * KHÔNG đụng một pixel nào của khu quản trị (9 vai đang dùng hằng ngày). Rủi ro
 * trôi lệch đã được nêu; chủ dự án vẫn chọn đường này.
 *
 * Trang admin truy vấn DB NGAY TRONG `page.tsx` nên không có gì để gọi lại.
 * Chép truy vấn vào đây thay vì vào `page.tsx` của Sale để phần trôi lệch nằm ở
 * MỘT tệp có tên, đọc được, và sau này gộp lại được — chứ không lẫn vào JSX.
 *
 * ── NỢ TRÔI LỆCH: sửa bên nào cũng phải sửa bên kia ─────────────────────────
 *   1. `STUDENT_LIST_SELECT` — thêm/bớt cột.
 *   2. Cách dựng `baseFilters` (q / centerId → preferredCenterId / grade / status).
 *   3. Nhánh `frequent-absent` (trần 500 + post-filter) và trần đó.
 *   4. Điều kiện cho phép TÌM THEO SĐT (nợ #11 "search-oracle" — xem dưới).
 * Những thứ KHÔNG phải nợ vì đã ở `lib/` dùng chung: `buildLifecycleWhere`,
 * `postFilterFrequentlyAbsent`, `LIFECYCLE_*`, `docSoDong`, `phoneSearchTerm`,
 * `maskPhone`, `getSetting`, `scopedDb`.
 */
import { StudentStatus, type Prisma } from "@prisma/client";
import type { Actor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { getSetting } from "@/lib/settings/service";
import { phoneSearchTerm } from "@/lib/phone";
import { maskPhone } from "@/lib/utils";
import {
  buildLifecycleWhere,
  postFilterFrequentlyAbsent,
  type LifecycleView,
} from "@/lib/students/lifecycle";

/**
 * Trần dòng nạp về trước khi lọc "vắng nhiều" trong JS. Giữ bằng bản admin (500).
 *
 * ⚠️ MỘT CHỖ CỐ Ý KHÁC ADMIN, và là chỗ duy nhất: ĐIỀU KIỆN bật câu cảnh báo cắt.
 * Bản admin so `totalCount === 500`, tức số dòng SAU khi lọc "vắng nhiều" — con số
 * đó gần như không bao giờ đúng bằng 500, nên câu "(cap 500 — refine filter để xem
 * hết)" thực tế không bao giờ hiện. Ở đây so số ỨNG VIÊN nạp về, đúng chỗ việc cắt
 * xảy ra. Câu chữ giữ nguyên từng chữ; chỉ thời điểm nó hiện là đúng lại.
 * Cùng loại lỗi với `canhBaoCat` của màn "Khách của tôi": đếm câm là nói dối về
 * số lượng.
 */
export const TRAN_VANG_NHIEU = 500;

export const MOI_TRANG_THAI_HOC_VIEN = Object.values(StudentStatus);

export type DongHocVien = {
  id: string;
  name: string;
  studentCode: string | null;
  avatarUrl: string | null;
  currentGrade: number | null;
  status: StudentStatus;
  parentName: string | null;
  parentPhone: string | null;
  createdAt: Date;
  enrollmentDate: Date | null;
  preferredCenter: { name: string } | null;
  center: { name: string } | null;
  _count: { enrollments: number };
  reserves: Array<{
    id: string;
    startedAt: Date;
    expectedEndAt: Date | null;
    reason: string;
  }>;
};

const STUDENT_LIST_SELECT = {
  id: true,
  name: true,
  studentCode: true,
  avatarUrl: true,
  currentGrade: true,
  status: true,
  parentName: true,
  parentPhone: true,
  createdAt: true,
  enrollmentDate: true,
  preferredCenter: { select: { name: true } },
  center: { select: { name: true } },
  _count: { select: { enrollments: true } },
  reserves: {
    where: { isActive: true },
    select: {
      id: true,
      startedAt: true,
      expectedEndAt: true,
      reason: true,
    },
    take: 1,
    orderBy: { startedAt: "desc" as const },
  },
} satisfies Prisma.StudentSelect;

export type ThamSoHocVien = {
  actor: Actor;
  view: LifecycleView;
  /** Đã `trim()` sẵn ở trang. Rỗng = không lọc. */
  q: string;
  /** Lọc theo `Student.preferredCenterId` — đúng cột bản admin lọc. */
  centerId: string;
  /** Đã kẹp 1–12 ở trang; `undefined` = mọi lớp. */
  grade: number | undefined;
  status: StudentStatus | undefined;
  page: number;
  soDong: number;
  /**
   * Người xem có được thấy SĐT phụ huynh THẬT không (`canViewLeadPii()` VÀ không
   * bị DENY cấp trường `parentPhone`). Quyết định ở trang vì nó cần session.
   *
   * ⚠️ Nó chi phối HAI thứ, không phải một — và bỏ sót vế thứ hai là nợ #11
   * ("search-oracle"): (a) che số trước khi trả về, (b) CÓ ĐƯỢC lọc theo cột SĐT
   * hay không. Thiếu quyền mà vẫn cho tìm theo SĐT là dò được số qua kết quả
   * trả về, dù màn hình không in ra số nào.
   */
  xemDuocSdt: boolean;
};

export type KetQuaHocVien = {
  dong: DongHocVien[];
  tong: number;
  /** Nhánh "vắng nhiều" đã chạm trần `TRAN_VANG_NHIEU` — phải nói ra, không đếm câm. */
  chamTran: boolean;
  soTrang: number;
};

/** Đọc một trang danh sách học viên, đã cách ly cơ sở và đã che SĐT nếu cần. */
export async function docDanhSachHocVien(t: ThamSoHocVien): Promise<KetQuaHocVien> {
  // Cách ly cơ sở: `Student` ∈ SCOPED_MODELS (có `centerId`) → `scopedDb` tự chèn
  // `centerId IN visibleCenters`. Mọi đọc Student đi qua `sdb`. SUPER_ADMIN/HO bypass.
  const sdb = scopedDb(t.actor);

  const baseFilters: Prisma.StudentWhereInput = {};
  if (t.q) {
    // SĐT lưu 2 dạng (0… cũ / 84… mới) — tìm theo phần lõi để không sót.
    const qPhone = phoneSearchTerm(t.q) ?? t.q;
    baseFilters.OR = [
      { name: { contains: t.q, mode: "insensitive" } },
      { studentCode: { contains: t.q, mode: "insensitive" } },
      { parentName: { contains: t.q, mode: "insensitive" } },
      ...(t.xemDuocSdt
        ? [{ parentPhone: { contains: qPhone } }, { phone: { contains: qPhone } }]
        : []),
    ];
  }
  if (t.centerId) baseFilters.preferredCenterId = t.centerId;
  if (t.grade != null) baseFilters.currentGrade = t.grade;
  // Lọc trạng thái chỉ có nghĩa ở tab "Tất cả" — các tab khác đã mã hoá trạng thái.
  if (t.view === "all" && t.status) baseFilters.status = t.status;

  const [renewalWindowDays, absentThreshold, absentWindow] = await Promise.all([
    getSetting("student.renewalWindowDays"),
    getSetting("student.frequentAbsentThreshold"),
    getSetting("student.frequentAbsentWindow"),
  ]);
  const where = buildLifecycleWhere(t.view, baseFilters, renewalWindowDays);

  let dong: DongHocVien[] = [];
  let tong: number;
  let chamTran = false;

  if (t.view === "frequent-absent") {
    // "Vắng nhiều" không diễn đạt được bằng SQL where — nạp ứng viên rồi lọc trong JS.
    const ungVien = await sdb.student.findMany({
      where,
      select: { id: true },
      take: TRAN_VANG_NHIEU,
    });
    chamTran = ungVien.length === TRAN_VANG_NHIEU;
    const loc = Array.from(
      await postFilterFrequentlyAbsent(
        ungVien.map((s) => s.id),
        absentThreshold,
        absentWindow,
      ),
    );
    tong = loc.length;
    const idTrang = loc.slice((t.page - 1) * t.soDong, t.page * t.soDong);
    if (idTrang.length > 0) {
      dong = (await sdb.student.findMany({
        where: { id: { in: idTrang } },
        select: STUDENT_LIST_SELECT,
        orderBy: [{ name: "asc" }],
      })) as DongHocVien[];
    }
  } else {
    const [dem, rows] = await Promise.all([
      sdb.student.count({ where }),
      sdb.student.findMany({
        where,
        select: STUDENT_LIST_SELECT,
        orderBy: [{ createdAt: "desc" }],
        skip: (t.page - 1) * t.soDong,
        take: t.soDong,
      }),
    ]);
    tong = dem;
    dong = rows as DongHocVien[];
  }

  // Che SĐT ở SERVER cho actor thiếu quyền — chống rò qua payload RSC, chứ không
  // chỉ giấu bằng CSS.
  if (!t.xemDuocSdt) {
    dong = dong.map((s) => ({
      ...s,
      parentPhone: s.parentPhone ? maskPhone(s.parentPhone) : s.parentPhone,
    }));
  }

  return { dong, tong, chamTran, soTrang: Math.max(1, Math.ceil(tong / t.soDong)) };
}

/** Danh sách cơ sở cho ô lọc — đã cách ly theo tầm nhìn của actor. */
export async function docCoSoChoLoc(actor: Actor) {
  return scopedDb(actor).center.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}
