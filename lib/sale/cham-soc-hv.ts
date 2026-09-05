/**
 * Site Sale — DỮ LIỆU cho màn `/sale/cham-soc-hv` (Việc chăm sóc học viên).
 *
 * ══ ĐÂY LÀ BẢN ĐÔI CỦA TRUY VẤN TRONG `app/(admin)/admin/cham-soc-hv/page.tsx` ══
 *
 * Chốt 04/09/2026: màn site Sale tách bản riêng, không dùng chung component với
 * khu quản trị. Bản admin giữ nguyên, không sửa.
 *
 * ── MỘT CHỖ CỐ Ý KHÁC BẢN ADMIN: BỎ HẲN NHÁNH THEO MÃ VAI ──────────────────
 * Bản admin dựng `where` bằng ba phép so vai:
 *
 *     const isSuper     = hasRole(session.user, "SUPER_ADMIN");
 *     const isCM        = hasRole(session.user, "CENTER_MANAGER");
 *     const isSalesOnly = hasRole(session.user, "SALES_CSM") && !isSuper && !isCM;
 *     const where = isSalesOnly ? { status:"OPEN", assignedToId: me } : { … centerId … };
 *
 * Trên host Sale nhánh đó **luôn** rơi vào `isSalesOnly`, vì `app/(sale)/sale/layout.tsx`
 * chỉ cho Sale THUẦN vào site (`isSaleOnly`: mọi vai ≠ PARENT phải là `SALES_CSM`), và
 * `getEffectiveRoles` bỏ qua `user.role` khi `user.roles` không rỗng — nên `isSuper`
 * và `isCM` không thể true ở đây. Tức phép rẽ nhánh chỉ còn là một cách vòng vo để
 * nói "việc của chính tôi".
 *
 * Nên bản Sale nói thẳng điều đó. Không phải để gọn, mà vì so mã vai cũ trong màn là
 * đúng loại lỗi đã trả giá: vai đi qua được cổng nhưng không khớp chuỗi vai mong đợi
 * thì màn trả về nhánh sai **mà không có lỗi nào nổ**. (Xem chính bản admin của màn
 * Tin nhắn: `laSaleThuan` gộp cả `user.role` lẫn `user.roles`, ngược với
 * `getEffectiveRoles`, nên một Sale thuần có `role="CENTER_MANAGER"` sót lại nhận câu
 * gợi ý dành cho quản lý — sai hướng dẫn, không lỗi.)
 *
 * ⚠️ HỆ QUẢ PHẢI BIẾT: màn này KHÔNG phải "mọi việc của cơ sở", mà là **việc được
 *    giao cho chính người đang xem**. Đúng bằng thứ họ thấy hôm nay qua bản mount.
 *    Muốn có màn toàn cơ sở cho quản lý thì đó là màn KHÁC, và nó đã có bên admin.
 *
 * ── NỢ TRÔI LỆCH: sửa bên nào cũng phải sửa bên kia ─────────────────────────
 *   1. Chỉ việc `status = OPEN`; `orderBy dueAt asc`; `take: 200`.
 *   2. "Quá hạn" = `dueAt < bây giờ` (so mốc thời gian, không so ngày).
 *
 * ── KHÔNG ĐỌC `description` — và đó là SỬA MỘT CHỖ THỪA, KHÔNG PHẢI BỚT NỘI DUNG ──
 * Bản admin `select` cả `description` rồi **không vẽ nó ở đâu cả**. Cột đó là
 * `@db.Text` (ghi chú tự do của người tạo việc) nên nó đi từ CSDL, qua payload RSC,
 * xuống tận trình duyệt, để rồi bị bỏ. Không lấy nữa là bớt một đường dữ liệu không ai
 * dùng — màn hình không đổi một chữ.
 */
import "server-only";
import type { Actor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { formatDateVN } from "@/lib/format/date";

export type DongChamSoc = {
  id: string;
  tieuDe: string;
  studentId: string;
  tenHocVien: string;
  /** "26/09/2026" — định dạng ở máy chủ, tầng vẽ không đụng `Date`. */
  hanXuLy: string;
  quaHan: boolean;
};

export async function layViecChamSoc({
  actor,
  userId,
  bayGio = new Date(),
}: {
  actor: Actor;
  /** Người đang xem — việc chăm sóc là việc ĐƯỢC GIAO, không phải việc của cơ sở. */
  userId: string;
  bayGio?: Date;
}): Promise<DongChamSoc[]> {
  // Cách ly cơ sở do `scopedDb` lo — `StudentCareTask` ∈ SCOPED_MODELS. `assignedToId`
  // là lớp lọc thứ hai (ai làm việc này), không thay thế lớp thứ nhất.
  const rows = await scopedDb(actor).studentCareTask.findMany({
    where: { status: "OPEN", assignedToId: userId },
    orderBy: { dueAt: "asc" },
    take: 200,
    select: {
      id: true,
      title: true,
      dueAt: true,
      student: { select: { id: true, name: true } },
    },
  });

  return rows.map((t) => ({
    id: t.id,
    tieuDe: t.title,
    studentId: t.student.id,
    tenHocVien: t.student.name,
    hanXuLy: formatDateVN(t.dueAt),
    quaHan: t.dueAt < bayGio,
  }));
}
