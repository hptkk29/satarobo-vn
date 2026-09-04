import "server-only";
/**
 * Site Sale — truy vấn màn "Chuyển lớp / chuyển cơ sở".
 *
 * ── ĐÂY LÀ BẢN ĐÔI CỦA TỆP NÀO, VÀ VÌ SAO ───────────────────────────────────
 * Bản gốc: khối truy vấn nằm THẲNG trong `app/(admin)/admin/chuyen-lop/page.tsx`.
 * Không có hàm dùng chung nào ở `lib/` để gọi lại (`lib/enrollment-flow.ts` chỉ
 * có `getNonEnrollableCenterIds`, đã dùng lại ở đây), nên đợt tách 04/09/2026
 * buộc phải CHÉP truy vấn.
 *
 * ⚠️ NỢ TRÔI LỆCH CÓ GHI SỔ. Đổi bộ trạng thái "đang học", đổi trần `take`, đổi
 *    cách scope yêu cầu chuyển, hay đổi cột chọn ở trang admin mà quên tệp này ⇒
 *    hai màn cùng tên cho hai kết quả khác nhau, và không có gì báo. Chủ dự án đã
 *    được nêu rủi ro và vẫn chọn tách bản.
 *
 * ── CÁCH LY CƠ SỞ — HAI CƠ CHẾ KHÁC NHAU TRONG CÙNG MỘT MÀN ─────────────────
 * 1. `Student` ∈ `SCOPED_MODELS` ⇒ `scopedDb` tự chèn `centerId IN visible`.
 * 2. `StudentTransferRequest` KHÔNG ∈ `SCOPED_MODELS` (nó chỉ có `fromCenterId`/
 *    `toCenterId`, không có `centerId`) ⇒ phải scope TAY qua hai cột đó, dùng
 *    ĐÚNG tầm nhìn mà `scopedDb` dùng cho `Student` (`getModelVisibleCenterIds`).
 *    Ngoài tầm nhìn (mảng rỗng) → `in: []` khớp 0 dòng = fail-safe.
 * 3. `Center` là bảng tổ chức (không scoped) → giữ toàn bộ cơ sở đang hoạt động
 *    làm danh sách đích chuyển cơ sở. Đây KHÔNG phải lỗ hổng: chuyển cơ sở mà chỉ
 *    thấy cơ sở của mình thì màn này hết nghĩa.
 *
 * FL2-05 — Hội sở không nhận học viên → loại khỏi cả picker nguồn lẫn đích.
 */
import type { Prisma } from "@prisma/client";
import type { Actor } from "@/lib/auth/actor";
import { scopedDb, getModelVisibleCenterIds } from "@/lib/db-scope";
import { getNonEnrollableCenterIds } from "@/lib/enrollment-flow";

/** Bộ trạng thái "đang học" — chép từ `ACTIVE_ENROLLMENT_STATUSES` của bản admin. */
const TRANG_THAI_DANG_HOC = ["CONFIRMED", "STUDYING", "ACTIVE"] as const;

/** Trần số dòng — giữ nguyên `take` của bản admin (100 yêu cầu / 500 học viên). */
const TRAN_YEU_CAU = 100;
const TRAN_HOC_VIEN = 500;

export type MucCoSo = { id: string; ten: string };

export type MucHocVienChuyen = {
  id: string;
  ten: string;
  ma: string | null;
  lop: { maLop: string; nhan: string }[];
};

export type DongYeuCauChuyen = {
  id: string;
  trangThai: "PENDING" | "WAITLISTED";
  lyDo: string | null;
  /** "YYYY-MM-DD". */
  ngay: string;
  /** Đã chọn được lớp đích chưa — quyết định có nút "Duyệt" hay không. */
  coLopDich: boolean;
  hocVien: string;
};

export type KetQuaChuyenLop = {
  coSo: MucCoSo[];
  hocVien: MucHocVienChuyen[];
  yeuCau: DongYeuCauChuyen[];
};

export async function layDuLieuChuyenLop({
  actor,
  maCoSoNguon,
}: {
  actor: Actor;
  /** FL2-06 (LD-6) — luồng "cơ sở → học sinh": chưa chọn cơ sở thì KHÔNG nạp HV. */
  maCoSoNguon?: string;
}): Promise<KetQuaChuyenLop> {
  const sdb = scopedDb(actor);
  const coSoNhinThay = getModelVisibleCenterIds("Student", actor);

  const maCoSoHoiSo = await getNonEnrollableCenterIds();
  const khongPhaiHoiSo = maCoSoHoiSo.length ? { id: { notIn: maCoSoHoiSo } } : {};

  const locYeuCau: Prisma.StudentTransferRequestWhereInput = {
    status: { in: ["PENDING", "WAITLISTED"] },
  };
  if (coSoNhinThay !== "ALL") {
    locYeuCau.OR = [
      { fromCenterId: { in: coSoNhinThay } },
      { toCenterId: { in: coSoNhinThay } },
    ];
  }

  const [coSo, yeuCau] = await Promise.all([
    sdb.center.findMany({
      where: { isActive: true, ...khongPhaiHoiSo },
      orderBy: { displayOrder: "asc" },
      select: { id: true, name: true },
    }),
    sdb.studentTransferRequest.findMany({
      where: locYeuCau,
      orderBy: { createdAt: "desc" },
      take: TRAN_YEU_CAU,
      select: {
        id: true,
        status: true,
        reason: true,
        createdAt: true,
        toClassId: true,
        student: { select: { name: true, studentCode: true } },
      },
    }),
  ]);

  // `scopedDb` tự chèn `centerId IN visible` ⇒ chọn cơ sở nguồn ngoài tầm nhìn
  // (vd người ở CS1 gõ tay id của CS2) khớp 0 dòng = fail-safe, không lộ HV.
  const hocVien = maCoSoNguon
    ? await sdb.student.findMany({
        where: {
          deletedAt: null,
          centerId: maCoSoNguon,
          enrollments: { some: { status: { in: [...TRANG_THAI_DANG_HOC] } } },
        },
        orderBy: { name: "asc" },
        take: TRAN_HOC_VIEN,
        select: {
          id: true,
          name: true,
          studentCode: true,
          enrollments: {
            where: { status: { in: [...TRANG_THAI_DANG_HOC] } },
            select: {
              classId: true,
              class: { select: { name: true, classCode: true } },
            },
          },
        },
      })
    : [];

  return {
    coSo: coSo.map((c) => ({ id: c.id, ten: c.name })),
    hocVien: hocVien.map((s) => ({
      id: s.id,
      ten: s.name,
      ma: s.studentCode,
      lop: s.enrollments.map((e) => ({
        maLop: e.classId,
        nhan: e.class.name + (e.class.classCode ? ` (${e.class.classCode})` : ""),
      })),
    })),
    yeuCau: yeuCau.map((r) => ({
      id: r.id,
      trangThai: r.status === "WAITLISTED" ? "WAITLISTED" : "PENDING",
      lyDo: r.reason,
      ngay: r.createdAt.toISOString().slice(0, 10),
      coLopDich: Boolean(r.toClassId),
      hocVien:
        r.student.name + (r.student.studentCode ? ` (${r.student.studentCode})` : ""),
    })),
  };
}
