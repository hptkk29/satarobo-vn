/**
 * Site Sale — TRUY VẤN hàng chờ học bù cho màn `/sale/hoc-bu`.
 *
 * ══ ĐÂY LÀ BẢN ĐÔI CỦA TRUY VẤN TRONG `app/(admin)/admin/hoc-bu/page.tsx` ═══
 *
 * ── Vì sao nó tồn tại ───────────────────────────────────────────────────────
 * Chủ dự án chốt 04/09/2026: các màn site Sale TÁCH BẢN RIÊNG, không mount lại
 * component của khu quản trị nữa — để thiết kế lại site Sale mà KHÔNG đụng một
 * pixel nào của khu quản trị. Rủi ro trôi lệch đã được nêu; chủ dự án vẫn chọn
 * đường này. Trang admin truy vấn DB ngay trong `page.tsx`.
 *
 * ── NỢ TRÔI LỆCH: sửa bên nào cũng phải sửa bên kia ─────────────────────────
 *   1. Bộ lọc `status IN (PENDING, SCHEDULED)` — màn này là HÀNG CHỜ, không phải
 *      lịch sử. Thêm `COMPLETED`/`CANCELLED` vào là đổi bản chất màn.
 *   2. `class: { deletedAt: null }` — QA 21/07 (B12): lớp đã xoá mềm thì yêu cầu
 *      bù không còn xử lý được trên giao diện (huỷ lớp đúng luồng đã tự
 *      `CANCELLED` các need). Bỏ vế này là hồi sinh những dòng không bấm được.
 *   3. `orderBy [status asc, createdAt asc]` — `PENDING` trước `SCHEDULED` (may
 *      mắn đúng thứ tự bảng chữ cái), rồi cũ trước mới: hàng chờ thì ai đợi lâu
 *      nhất đứng đầu.
 *   4. Trần `take: 200` và hai truy vấn phụ theo lô (ngày buổi + tên bài).
 *
 * ── KHÔNG phải nợ vì đã dùng chung ở `lib/` ─────────────────────────────────
 * `scopedDb` — `MakeupNeed` ∈ SCOPED_MODELS (có `centerId`) nên `centerId IN
 * <tầm nhìn>` được tiêm tự động; SUPER_ADMIN/HO bypass. Bản admin đã bỏ pattern
 * cũ (`hasRole CENTER_MANAGER` → `session.centerId`) vì nó không phủ multi-role
 * lẫn HO — ở đây KHÔNG được dựng lại nó.
 */
import type { Actor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { formatDateVN } from "@/lib/format/date";

/** Trần số dòng đọc về — giữ nguyên 200 của bản admin. */
export const TRAN_HOC_BU = 200;

export type DongHocBu = {
  id: string;
  tenHocVien: string;
  tenLop: string;
  /** Đã định dạng ở máy chủ; "—" khi không tra được buổi lỡ. */
  ngayLo: string;
  /** `Bài N: Tiêu đề`, hoặc `null` khi buổi lỡ chưa gắn bài. */
  baiLo: string | null;
  status: string;
  /** Đã định dạng ở máy chủ; `null` khi chưa xếp buổi bù. */
  ngayBu: string | null;
};

export async function docHangChoHocBu(actor: Actor): Promise<DongHocBu[]> {
  const sdb = scopedDb(actor);

  const nhuCau = await sdb.makeupNeed.findMany({
    where: {
      status: { in: ["PENDING", "SCHEDULED"] },
      class: { deletedAt: null },
    },
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    take: TRAN_HOC_BU,
    select: {
      id: true,
      status: true,
      missedSessionId: true,
      makeupSessionId: true,
      student: { select: { name: true } },
      class: { select: { name: true } },
      missedLessonId: true,
    },
  });

  // Lấy ngày buổi lỡ + buổi bù + tên bài theo LÔ (tránh N+1).
  const buoiIds = [
    ...new Set(
      nhuCau.flatMap((n) =>
        [n.missedSessionId, n.makeupSessionId].filter((x): x is string => !!x),
      ),
    ),
  ];
  const baiIds = [
    ...new Set(nhuCau.map((n) => n.missedLessonId).filter((x): x is string => !!x)),
  ];
  const [buoi, bai] = await Promise.all([
    buoiIds.length
      ? sdb.classSession.findMany({
          where: { id: { in: buoiIds } },
          select: { id: true, date: true },
        })
      : Promise.resolve([]),
    baiIds.length
      ? sdb.lesson.findMany({
          where: { id: { in: baiIds } },
          select: { id: true, order: true, title: true },
        })
      : Promise.resolve([]),
  ]);
  const ngayBuoi = new Map(buoi.map((s) => [s.id, s.date]));
  const bangBai = new Map(bai.map((l) => [l.id, l]));

  return nhuCau.map((n) => {
    const l = n.missedLessonId ? bangBai.get(n.missedLessonId) : null;
    const lo = ngayBuoi.get(n.missedSessionId);
    const bu = n.makeupSessionId ? ngayBuoi.get(n.makeupSessionId) : null;
    return {
      id: n.id,
      tenHocVien: n.student.name,
      tenLop: n.class.name,
      // Định dạng Ở MÁY CHỦ rồi truyền chuỗi xuống — `formatDateVN` đọc múi giờ
      // của máy chạy, nên gọi nó trong lần vẽ của client là mời hydration
      // mismatch khi máy khách lệch múi máy chủ. Bản admin gọi nó ở client.
      ngayLo: lo ? formatDateVN(lo) : "—",
      baiLo: l ? `Bài ${l.order}: ${l.title}` : null,
      status: n.status,
      ngayBu: bu ? formatDateVN(bu) : null,
    };
  });
}
